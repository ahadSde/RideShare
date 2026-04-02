require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { client: redis, connectRedis } = require('./redis');
const { connectProducer, publishEvent } = require('./kafka/producer');
const rideRoutes    = require('./routes/ride.routes');
const requestRoutes = require('./routes/request.routes');
const commentRoutes = require('./routes/comment.routes');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('[Auth Error]', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

const app = express();
app.use(express.json());
app.use(authenticate);

app.use('/rides', rideRoutes);
app.use('/rides', requestRoutes);
app.use('/rides/:rideId/comments', commentRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ride-service' }));

const startPaymentTimeoutCron = () => {
  setInterval(async () => {
    try {
      const expired = await pool.query(
        `UPDATE bookings
        SET status = 'expired'
        WHERE status = 'approved'
        AND payment_deadline < NOW()
        RETURNING *`
      );
      if (expired.rows.length > 0) {
        console.log(`[Cron] Expired ${expired.rows.length} unpaid booking(s)`);
        for (const booking of expired.rows) {
          await publishEvent('payment.timeout', {
            bookingId: booking.id,
            rideId: booking.ride_id,
            riderId: booking.rider_id,
          });
        }
      }
    } catch (err) {
      console.error('[Cron] Payment timeout error:', err.message);
    }
  }, 60 * 1000);
  console.log('[Cron] Payment timeout checker started');
};

const startRideAutoStartCron = () => {
  setInterval(async () => {
    try {
      const started = await pool.query(
        `UPDATE rides
         SET status = 'in_progress'
         WHERE status = 'active'
           AND departure_time <= NOW()
           AND (departure_time + (duration_min * interval '1 minute')) > NOW()
         RETURNING *`
      );

      if (started.rows.length > 0) {
        console.log(`[Cron] Auto-started ${started.rows.length} ride(s)`);
        for (const ride of started.rows) {
          await publishEvent('ride.started', {
            rideId: ride.id,
            driverId: ride.driver_id,
            startedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('[Cron] Auto-start error:', err.message);
    }
  }, 60 * 1000);
  console.log('[Cron] Ride auto-start checker started');
};

const startRideAutoCompleteCron = () => {
  setInterval(async () => {
    try {
      const completed = await pool.query(
        `UPDATE rides SET status = 'completed'
         WHERE status IN ('active', 'in_progress')
         AND (departure_time + (duration_min * interval '1 minute')) < NOW()
         RETURNING *`
      );
      if (completed.rows.length > 0) {
        console.log(`[Cron] Auto-completed ${completed.rows.length} ride(s)`);
        for (const ride of completed.rows) {
          await publishEvent('ride.autocompleted', {
            rideId: ride.id,
            driverId: ride.driver_id,
          });
        }
      }
    } catch (err) {
      console.error('[Cron] Auto-complete error:', err.message);
    }
  }, 10 * 60 * 1000);
  console.log('[Cron] Ride auto-complete checker started');
};

const start = async () => {
  try {
    await connectRedis();
    await connectProducer();
    await pool.query('SELECT 1');
    console.log('[DB] PostgreSQL connected');
    startPaymentTimeoutCron();
    startRideAutoStartCron();
    startRideAutoCompleteCron();
    app.listen(process.env.PORT, () => {
      console.log(`[Ride Service] Running on port ${process.env.PORT}`);
    });
  } catch (err) {
    console.error('[Startup Error]', err.message);
    process.exit(1);
  }
};

start();
