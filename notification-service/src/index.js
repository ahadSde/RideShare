require('dotenv').config();
const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');

// ── Email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.verify((err) => {
  if (err) console.error('[Email] Transporter error:', err.message);
  else console.log('[Email] Transporter ready ✅');
});

// ── Kafka consumer
const kafka    = new Kafka({ clientId: 'notification-service', brokers: [process.env.KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: 'notification-group-v2' });

// ─────────────────────────────────────
// Email templates
// ─────────────────────────────────────
const templates = {

  'seat.requested': (data) => ({
    to:      data.driverEmail,
    subject: '🚗 New Seat Request — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#0e0f13;">New seat request! 🙋</h2>
        <p>Hi Driver,</p>
        <p><b>${data.riderName || 'A rider'}</b> has requested a seat on your ride.</p>
        <div style="background:#fff;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #c8f135;">
          <p><b>Pickup:</b> ${data.pickupName}</p>
          <p><b>Drop:</b> ${data.dropName}</p>
          <p><b>Fare:</b> ₹${data.fareAmount}</p>
          <p><b>Queue position:</b> #${data.queuePosition}</p>
        </div>
        <p>Login to <b>approve or reject</b> the request from your dashboard.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'seat.approved': (data) => ({
    to:      data.riderEmail,
    subject: '✅ Seat Approved — Pay Now! — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#16a34a;">Your seat is approved! ✅</h2>
        <p>Hi there,</p>
        <p>The driver has approved your seat request. You have <b>15 minutes</b> to complete payment.</p>
        <div style="background:#fff;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #16a34a;">
          <p><b>From:</b> ${data.pickupName}</p>
          <p><b>To:</b> ${data.dropName}</p>
          <p><b>Amount to pay:</b> ₹${data.fareAmount}</p>
          <p><b>Pay before:</b> ${new Date(data.paymentDeadline).toLocaleString('en-IN')}</p>
        </div>
        <p style="color:#dc2626;font-weight:bold;">⚠️ Your seat will be released if payment is not made within 15 minutes!</p>
        <p>Login to RideShare and go to your Dashboard to pay now.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'seat.rejected': (data) => ({
    to:      data.riderEmail,
    subject: '❌ Seat Request Rejected — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#dc2626;">Request rejected ❌</h2>
        <p>Hi there,</p>
        <p>Unfortunately the driver has rejected your seat request.</p>
        <div style="background:#fff;padding:16px;border-radius:8px;margin:16px 0;">
          <p><b>From:</b> ${data.pickupName}</p>
          <p><b>To:</b> ${data.dropName}</p>
        </div>
        <p>Please search for other available rides on RideShare.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'payment.timeout': (data) => ({
    to:      data.riderEmail,
    subject: '⏰ Payment Window Expired — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2>Payment window expired ⏰</h2>
        <p>Hi there,</p>
        <p>Your 15-minute payment window has expired and your approved seat has been released.</p>
        <p>Please search for another available ride on RideShare.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'payment.success': (data) => ({
    to:      data.riderEmail,
    subject: '✅ Payment Successful — Booking Confirmed! — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#16a34a;">Booking Confirmed! ✅</h2>
        <p>Hi there,</p>
        <p>Your payment of <b>₹${data.amount}</b> was successful. Your seat is confirmed!</p>
        <div style="background:#fff;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #16a34a;">
          <p><b>Booking ID:</b> ${data.bookingId}</p>
          <p><b>Amount Paid:</b> ₹${data.amount}</p>
          <p><b>Date:</b> ${new Date(data.paidAt).toLocaleString('en-IN')}</p>
        </div>
        <p>The driver has been notified. Have a safe journey! 🚗</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'payment.failed': (data) => ({
    to:      data.riderEmail,
    subject: '❌ Payment Failed — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#dc2626;">Payment Failed ❌</h2>
        <p>Your payment could not be processed. Please try again from your dashboard.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'ride.started': (data) => ({
    to:      data.riderEmail,
    subject: '🚦 Your Ride Has Started — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2>Your ride has started! 🚗</h2>
        <p>The driver has started the ride. Please be ready at your pickup point!</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'booking.confirmed': (data) => ({
    to:      data.riderEmail,
    subject: '🚗 Booking Confirmed — RideShare',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2>Booking Confirmed! 🎉</h2>
        <p>Your seat has been booked.</p>
        <div style="background:#fff;padding:16px;border-radius:8px;margin:16px 0;">
          <p><b>Booking ID:</b> ${data.bookingId}</p>
          <p><b>From:</b> ${data.pickupName}</p>
          <p><b>To:</b> ${data.dropName}</p>
          <p><b>Fare:</b> ₹${data.fareAmount}</p>
        </div>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),

  'ride.autocompleted': (data) => ({
    to:      null,
    subject: '✅ Ride Completed',
    html:    `<p>Ride ${data.rideId} has been marked as completed.</p>`,
  }),

  'auth.password_reset_requested': (data) => ({
    to: data.email,
    subject: 'Reset Your RideShare Password',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#0e0f13;">Reset your password</h2>
        <p>Hi ${data.name || 'there'},</p>
        <p>We received a request to reset your RideShare password.</p>
        <p>This link will expire in <b>${data.expiresInMinutes || 15} minutes</b>.</p>
        <div style="margin:24px 0;">
          <a href="${data.resetLink}" style="display:inline-block;background:#c8f135;color:#0e0f13;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;">
            Reset Password
          </a>
        </div>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p style="color:#666;font-size:13px;">— RideShare Team</p>
      </div>
    `,
  }),
};

// ─────────────────────────────────────
// Send email helper
// ─────────────────────────────────────
const sendEmail = async (to, subject, html) => {
  if (!to) {
    console.log('[Email] No recipient — skipping');
    return;
  }
  try {
    await transporter.sendMail({
      from:    `"RideShare" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] ✅ Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error('[Email Error]', err.message);
  }
};

// ─────────────────────────────────────
// Kafka consumer
// ─────────────────────────────────────
const run = async () => {
  await consumer.connect();
  console.log('[Kafka] Notification consumer connected');

  await consumer.subscribe({
    topics: [
      'booking.confirmed',
      'payment.success',
      'payment.failed',
      'ride.started',
      'seat.requested',
      'seat.approved',
      'seat.rejected',
      'payment.timeout',
      'ride.autocompleted',
      'auth.password_reset_requested',
    ],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const data = JSON.parse(message.value.toString());
        console.log(`[Kafka] Received "${topic}"`, {
          to: data.riderEmail || data.driverEmail || 'unknown',
        });

        const templateFn = templates[topic];
        if (!templateFn) {
          console.log(`[Kafka] No template for: ${topic}`);
          return;
        }

        const { to, subject, html } = templateFn(data);
        await sendEmail(to, subject, html);

      } catch (err) {
        console.error(`[Notification Error] topic=${topic}:`, err.message);
      }
    },
  });
};

run().catch(err => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
