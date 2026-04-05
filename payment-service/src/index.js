require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

// ── DB
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const ridePool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'ride_db',
});

// ── Kafka producer
const kafka = new Kafka({ clientId: 'payment-service', brokers: [process.env.KAFKA_BROKER] });
const producer = kafka.producer();

// ── Razorpay (only initialize if real keys exist)
let razorpay = null;
try {
  const Razorpay = require('razorpay');
  if (
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_ID !== 'rzp_test_REPLACE_ME'
  ) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('[Razorpay] Initialized with real keys');
  } else {
    console.log('[Razorpay] Running in MOCK mode');
  }
} catch (e) {
  console.log('[Razorpay] Package not found, running in MOCK mode');
}

// ─────────────────────────────────────
// POST /payment/create-order
// Creates a Razorpay order and saves a pending payment record
// ─────────────────────────────────────
app.post('/payment/create-order', async (req, res) => {
  const { bookingId, riderId, amount } = req.body;
  if (!bookingId || !riderId || !amount) {
    return res.status(400).json({ error: 'bookingId, riderId and amount are required' });
  }

  try {
    let razorpayOrderId = `mock_order_${Date.now()}`;
    let checkoutKeyId = null;
    const receipt = `booking_${String(bookingId).replace(/-/g, '').slice(0, 24)}`;

    // Only create real Razorpay order if initialized
    if (razorpay) {
      try {
        const order = await razorpay.orders.create({
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt,
        });
        razorpayOrderId = order.id;
        checkoutKeyId = process.env.RAZORPAY_KEY_ID;
      } catch (err) {
        console.log(
          '[Razorpay] Order creation failed, using mock:',
          err?.error?.description || err?.message || err
        );
      }
    }

    // Save pending payment in DB
    const result = await pool.query(
      `INSERT INTO payments (booking_id, rider_id, amount, razorpay_order_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [bookingId, riderId, amount, razorpayOrderId]
    );

    res.status(201).json({
      payment: result.rows[0],
      razorpayOrderId,
      amount,
      currency: 'INR',
      mode: checkoutKeyId ? 'razorpay' : 'mock',
      // Only return keyId when a real Razorpay order was successfully created
      keyId: checkoutKeyId,
    });
  } catch (err) {
    console.error('[CreateOrder]', err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ─────────────────────────────────────
// POST /payment/verify
// Verifies Razorpay payment signature and publishes Kafka event
// ─────────────────────────────────────
app.post('/payment/verify', async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = req.body;

  try {
    let isValid = true;

    // Verify signature if Razorpay is configured
    if (razorpay && razorpaySignature) {
      const body = razorpayOrderId + '|' + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
      isValid = expectedSignature === razorpaySignature;
    }

    if (!isValid) {
      // Payment signature mismatch — mark as failed
      await pool.query(
        `UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1`,
        [razorpayOrderId]
      );
      await producer.send({
        topic: 'payment.failed',
        messages: [{ value: JSON.stringify({ bookingId, razorpayOrderId }) }],
      });
      return res.status(400).json({ error: 'Payment verification failed — invalid signature' });
    }

    // ── Payment is valid — update DB
    const result = await pool.query(
      `UPDATE payments
       SET status = 'success',
           razorpay_payment_id = $1,
           razorpay_signature = $2
       WHERE razorpay_order_id = $3
       RETURNING *`,
      [razorpayPaymentId, razorpaySignature, razorpayOrderId]
    );

    const payment = result.rows[0];

    // Update booking status to confirmed
    await ridePool.query(
      `UPDATE bookings SET status = 'confirmed' WHERE id = $1`,
      [payment.booking_id]
    );

    // Decrement seat count on the ride
    await ridePool.query(
      `UPDATE rides 
      SET seats_available = seats_available - 1 
      WHERE id = (SELECT ride_id FROM bookings WHERE id = $1)
      AND seats_available > 0`,
      [payment.booking_id]
    );

    // Fetch rider email from ride_db
    const bookingInfo = await ridePool.query(
      'SELECT rider_email FROM bookings WHERE id = $1',
      [payment.booking_id]
    );
    const riderEmail = bookingInfo.rows[0]?.rider_email;

    // ── Publish payment.success to Kafka
    // Notification Service and Ride Service both consume this event
    await producer.send({
      topic: 'payment.success',
      messages: [{
        value: JSON.stringify({
          paymentId: payment.id,
          bookingId: payment.booking_id,
          riderId:   payment.rider_id,
          riderEmail,
          amount:    payment.amount,
          paidAt:    new Date().toISOString(),
        }),
      }],
    });

    console.log(`[Kafka] payment.success published for booking ${payment.booking_id}`);

    res.json({ message: 'Payment successful', payment });
  } catch (err) {
    console.error('[VerifyPayment]', err.message);
    res.status(500).json({ error: 'Payment verification error' });
  }
});

// ─────────────────────────────────────
// GET /payment/status/:bookingId
// ─────────────────────────────────────
app.get('/payment/status/:bookingId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.bookingId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-service' }));

const start = async () => {
  await producer.connect();
  console.log('[Kafka] Payment producer connected');
  await pool.query('SELECT 1');
  console.log('[DB] Payment DB connected');
  app.listen(process.env.PORT || 3004, () => {
    console.log(`[Payment Service] Running on port ${process.env.PORT || 3004}`);
  });
};

start();
