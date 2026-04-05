const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { publishEvent } = require('../kafka/producer');
const { normalizeBookingDeadline } = require('../utils/datetime');
const appTimeZone = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// ─────────────────────────────────────
// POST /bookings/request/:rideId
// Rider requests a seat — does NOT reserve until driver approves
// ─────────────────────────────────────
router.post('/request/:rideId', async (req, res) => {
  const { rideId } = req.params;
  const {
    pickupName, dropName,
    pickupLat, pickupLng,
    dropLat, dropLng,
    distanceKm,
  } = req.body;
  const riderId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the ride row
    const rideResult = await client.query(
      `SELECT id, seats_available, price_per_km, driver_id, from_name, to_name, departure_time, status
       FROM rides WHERE id = $1 FOR UPDATE`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (ride.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ride is no longer available' });
    }

    // Check if rider already has a pending/approved request for this ride
    const existing = await client.query(
      `SELECT id FROM bookings
       WHERE ride_id = $1 AND rider_id = $2
       AND status IN ('requested', 'approved', 'payment_pending', 'confirmed')`,
      [rideId, riderId]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active request for this ride' });
    }

    // Count pending approved requests to check effective availability
    const pendingCount = await client.query(
      `SELECT COUNT(*) FROM bookings
       WHERE ride_id = $1 AND status IN ('approved', 'payment_pending')`,
      [rideId]
    );
    const pending = parseInt(pendingCount.rows[0].count);
    const effectiveSeats = ride.seats_available - pending;

    if (effectiveSeats <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No seats available for requests right now' });
    }

    // Get queue position
    const queueResult = await client.query(
      `SELECT COUNT(*) FROM bookings WHERE ride_id = $1 AND status = 'requested'`,
      [rideId]
    );
    const queuePosition = parseInt(queueResult.rows[0].count) + 1;

    // Calculate fare
    const fareAmount = parseFloat((distanceKm * ride.price_per_km + 1).toFixed(2));

    // Create booking with status 'requested'
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        ride_id, rider_id,
        pickup_name, drop_name,
        pickup_location, drop_location,
        distance_km, fare_amount,
        status, queue_position
      ) VALUES (
        $1, $2, $3, $4,
        ST_GeogFromText('POINT(' || $5::text || ' ' || $6::text || ')'),
        ST_GeogFromText('POINT(' || $7::text || ' ' || $8::text || ')'),
        $9, $10, 'requested', $11
      ) RETURNING *`,
      [
        rideId, riderId,
        pickupName, dropName,
        pickupLng, pickupLat,
        dropLng, dropLat,
        distanceKm, fareAmount,
        queuePosition,
      ]
    );

    await client.query('COMMIT');
    const booking = bookingResult.rows[0];

    // Publish Kafka event — notify driver
    await publishEvent('seat.requested', {
      bookingId:   booking.id,
      rideId,
      riderId,
      driverId:    ride.driver_id,
      pickupName,
      dropName,
      fareAmount,
      fromName:    ride.from_name,
      toName:      ride.to_name,
      departureTime: ride.departure_time,
    });

    res.status(201).json({
      message: 'Seat request sent! Waiting for driver approval.',
      booking,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RequestSeat]', err.message);
    res.status(500).json({ error: 'Failed to request seat' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────
// GET /bookings/ride/:rideId
// Driver sees all requests for their ride
// ─────────────────────────────────────
router.get('/ride/:rideId', async (req, res) => {
  const { rideId } = req.params;
  try {
    // Verify driver owns this ride
    const rideCheck = await pool.query(
      'SELECT id FROM rides WHERE id = $1 AND driver_id = $2',
      [rideId, req.user.id]
    );
    if (rideCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(
      `SELECT b.*, 
        u.name as rider_name, u.phone as rider_phone
       FROM bookings b
       LEFT JOIN dblink('dbname=auth_db user=carpool password=carpool123',
         'SELECT id, name, phone FROM users'
       ) AS u(id uuid, name varchar, phone varchar)
       ON b.rider_id = u.id
       WHERE b.ride_id = $1
       ORDER BY b.queue_position ASC, b.created_at ASC`,
      [rideId]
    ).catch(() =>
      // Fallback without join if dblink not available
      pool.query(
        `SELECT * FROM bookings WHERE ride_id = $1
         ORDER BY queue_position ASC, created_at ASC`,
        [rideId]
      )
    );

    res.json({ requests: result.rows.map(normalizeBookingDeadline) });
  } catch (err) {
    console.error('[GetRequests]', err.message);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ─────────────────────────────────────
// PATCH /bookings/:bookingId/approve
// Driver approves a seat request
// ─────────────────────────────────────
router.patch('/:bookingId/approve', async (req, res) => {
  const { bookingId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get booking + ride, verify driver owns the ride
    const result = await client.query(
      `SELECT b.*, r.driver_id, r.seats_available, r.price_per_km
       FROM bookings b
       JOIN rides r ON b.ride_id = r.id
       WHERE b.id = $1 FOR UPDATE`,
      [bookingId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    if (booking.driver_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (booking.status !== 'requested') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot approve a booking with status: ${booking.status}` });
    }

    const updated = await client.query(
      `UPDATE bookings
       SET status = 'approved',
           approved_at = NOW(),
           payment_deadline = NOW() + INTERVAL '15 minutes'
       WHERE id = $1
       RETURNING *`,
      [bookingId]
    );

    await client.query('COMMIT');

    const approvedBooking = normalizeBookingDeadline(updated.rows[0]);

    // Publish Kafka event — notify rider immediately
    await publishEvent('seat.approved', {
      bookingId,
      rideId:          booking.ride_id,
      riderId:         booking.rider_id,
      fareAmount:      booking.fare_amount,
      paymentDeadline: approvedBooking.payment_deadline?.toISOString?.() || approvedBooking.payment_deadline,
      pickupName:      booking.pickup_name,
      dropName:        booking.drop_name,
    });

    res.json({
      message: 'Request approved! Rider has 15 minutes to pay.',
      booking: approvedBooking,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ApproveRequest]', err.message);
    res.status(500).json({ error: 'Failed to approve request' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────
// PATCH /bookings/:bookingId/reject
// Driver rejects a seat request
// ─────────────────────────────────────
router.patch('/:bookingId/reject', async (req, res) => {
  const { bookingId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE bookings b
       SET status = 'rejected'
       FROM rides r
       WHERE b.id = $1
         AND b.ride_id = r.id
         AND r.driver_id = $2
         AND b.status = 'requested'
       RETURNING b.*`,
      [bookingId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or not authorized' });
    }

    const booking = result.rows[0];

    await publishEvent('seat.rejected', {
      bookingId,
      riderId:    booking.rider_id,
      pickupName: booking.pickup_name,
      dropName:   booking.drop_name,
    });

    res.json({ message: 'Request rejected', booking });
  } catch (err) {
    console.error('[RejectRequest]', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ─────────────────────────────────────
// GET /bookings/my
// Rider sees their bookings — upcoming only
// Driver sees their ride requests
// ─────────────────────────────────────
router.get('/my', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'rider') {
      // Only upcoming bookings (confirmed or approved, departure in future)
      result = await pool.query(
        `SELECT b.*, r.from_name, r.to_name, r.departure_time,
                r.driver_id, r.price_per_km
         FROM bookings b
         JOIN rides r ON b.ride_id = r.id
         WHERE b.rider_id = $1
           AND b.status IN ('requested', 'approved', 'payment_pending', 'confirmed')
           AND r.departure_time > TIMEZONE($2, NOW())
         ORDER BY r.departure_time ASC`,
        [req.user.id, appTimeZone]
      );
    } else {
      // Driver — active and in_progress rides by default
      result = await pool.query(
        `SELECT * FROM rides
         WHERE driver_id = $1
           AND status IN ('active', 'in_progress')
         ORDER BY departure_time ASC`,
        [req.user.id]
      );
    }
    res.json({ data: result.rows.map(normalizeBookingDeadline) });
  } catch (err) {
    console.error('[MyBookings]', err.message);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ─────────────────────────────────────
// GET /bookings/my/all
// Driver sees ALL rides (with filter)
// ─────────────────────────────────────
router.get('/my/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM rides WHERE driver_id = $1 ORDER BY departure_time DESC`,
      [req.user.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

module.exports = router;
