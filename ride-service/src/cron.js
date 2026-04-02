const pool = require('./db');
const { publishEvent } = require('./kafka/producer');
const { normalizeUtcTimestamp } = require('./utils/datetime');

// ─────────────────────────────────────
// Auto-start rides
// Runs every minute
// Marks rides as in_progress once departure_time is reached
// ─────────────────────────────────────
const startRideAutoStart = () => {
  console.log('[Cron] Ride auto-start started');

  setInterval(async () => {
    try {
      const result = await pool.query(
        `UPDATE rides
         SET status = 'in_progress'
         WHERE status = 'active'
           AND departure_time <= NOW()
           AND departure_time + (duration_min * interval '1 minute') > NOW()
         RETURNING id, driver_id`
      );

      if (result.rows.length > 0) {
        console.log(`[Cron] Auto-started ${result.rows.length} ride(s)`);
        for (const ride of result.rows) {
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
  }, 60 * 1000); // every minute
};

// ─────────────────────────────────────
// Auto-complete rides
// Runs every 10 minutes
// Marks rides as completed if departure_time + duration has passed
// ─────────────────────────────────────
const startRideAutoComplete = () => {
  console.log('[Cron] Ride auto-complete started');

  setInterval(async () => {
    try {
      const result = await pool.query(
        `UPDATE rides
         SET status = 'completed'
         WHERE status IN ('active', 'in_progress')
           AND departure_time + (duration_min * interval '1 minute') < NOW()
         RETURNING id, driver_id`
      );

      if (result.rows.length > 0) {
        console.log(`[Cron] Auto-completed ${result.rows.length} ride(s)`);
        for (const ride of result.rows) {
          await publishEvent('ride.autocompleted', {
            rideId:   ride.id,
            driverId: ride.driver_id,
          });
        }
      }
    } catch (err) {
      console.error('[Cron] Auto-complete error:', err.message);
    }
  }, 10 * 60 * 1000); // every 10 minutes
};

// ─────────────────────────────────────
// Payment timeout handler
// Runs every minute
// Expires approved bookings whose 15-min window has passed
// Then notifies the next person in queue
// ─────────────────────────────────────
const startPaymentTimeoutHandler = () => {
  console.log('[Cron] Payment timeout handler started');

  setInterval(async () => {
    try {
      // Find expired approved bookings
      const expired = await pool.query(
        `UPDATE bookings
         SET status = 'expired'
         WHERE status = 'approved'
           AND payment_deadline < NOW()
         RETURNING ride_id, rider_id, id`
      );

      for (const booking of expired.rows) {
        console.log(`[Cron] Booking ${booking.id} expired — checking queue`);

        // Notify the rider their approval expired
        await publishEvent('payment.timeout', {
          bookingId: booking.id,
          riderId:   booking.rider_id,
          rideId:    booking.ride_id,
        });

        // Find next in queue for this ride
        const next = await pool.query(
          `SELECT b.*, r.price_per_km FROM bookings b
           JOIN rides r ON b.ride_id = r.id
           WHERE b.ride_id = $1
             AND b.status = 'requested'
           ORDER BY b.queue_position ASC
           LIMIT 1`,
          [booking.ride_id]
        );

        if (next.rows.length > 0) {
          const nextBooking = next.rows[0];

          // Auto-approve next in queue
          const approved = await pool.query(
            `UPDATE bookings
             SET status = 'approved',
                 approved_at = NOW(),
                 payment_deadline = NOW() + INTERVAL '15 minutes'
             WHERE id = $1
             RETURNING payment_deadline`,
            [nextBooking.id]
          );

          const paymentDeadline = normalizeUtcTimestamp(approved.rows[0]?.payment_deadline);

          await publishEvent('seat.approved', {
            bookingId:       nextBooking.id,
            rideId:          nextBooking.ride_id,
            riderId:         nextBooking.rider_id,
            fareAmount:      nextBooking.fare_amount,
            paymentDeadline: paymentDeadline?.toISOString?.() || paymentDeadline,
            pickupName:      nextBooking.pickup_name,
            dropName:        nextBooking.drop_name,
            fromQueue:       true,
          });

          console.log(`[Cron] Next in queue notified: booking ${nextBooking.id}`);
        }
      }
    } catch (err) {
      console.error('[Cron] Payment timeout error:', err.message);
    }
  }, 60 * 1000); // every minute
};

module.exports = { startRideAutoStart, startRideAutoComplete, startPaymentTimeoutHandler };
