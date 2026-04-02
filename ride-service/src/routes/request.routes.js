const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { publishEvent } = require('../kafka/producer');
const { normalizeBookingDeadline } = require('../utils/datetime');

const router = express.Router();

// ─────────────────────────────────────
// POST /rides/:rideId/request
// Rider requests a seat
// ─────────────────────────────────────
router.post('/:rideId/request', [
  body('pickupName').notEmpty(),
  body('dropName').notEmpty(),
  body('pickupLat').isFloat(),
  body('pickupLng').isFloat(),
  body('dropLat').isFloat(),
  body('dropLng').isFloat(),
  body('distanceKm').isFloat({ min: 0.1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

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
      `SELECT id, seats_available, seats_total, price_per_km, status, driver_id, driver_email,
              route_path, from_location, to_location
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
      return res.status(400).json({ error: 'Ride is not available' });
    }

    const routeValidation = await client.query(
      `WITH rider_points AS (
         SELECT
           ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')') AS pickup_point,
           ST_GeogFromText('POINT(' || $3 || ' ' || $4 || ')') AS drop_point
       )
       SELECT
         ST_DWithin(route_line, pickup_point, $5) AS pickup_matches_route,
         ST_DWithin(route_line, drop_point, $5) AS drop_matches_route,
         ST_LineLocatePoint(route_line::geometry, pickup_point::geometry) AS pickup_progress,
         ST_LineLocatePoint(route_line::geometry, drop_point::geometry) AS drop_progress
       FROM rider_points,
       LATERAL (
         SELECT COALESCE(
           $6::geography,
           ST_MakeLine($7::geometry, $8::geometry)::geography
         ) AS route_line
       ) route_data`,
      [
        pickupLng,
        pickupLat,
        dropLng,
        dropLat,
        5000,
        ride.route_path,
        ride.from_location,
        ride.to_location,
      ]
    );

    const routeMatch = routeValidation.rows[0];
    const followsRoute = routeMatch?.pickup_matches_route &&
      routeMatch?.drop_matches_route &&
      routeMatch?.pickup_progress <= routeMatch?.drop_progress;

    if (!followsRoute) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pickup and drop must be on or near the driver route' });
    }

    // Check if rider already has a pending request for this ride
    const existingRequest = await client.query(
      `SELECT id FROM bookings
       WHERE ride_id = $1 AND rider_id = $2
       AND status IN ('requested', 'approved', 'payment_pending', 'confirmed')`,
      [rideId, riderId]
    );

    if (existingRequest.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active request for this ride' });
    }

    // Count pending approvals (approved but not yet paid)
    const pendingApprovals = await client.query(
      `SELECT COUNT(*) FROM bookings
       WHERE ride_id = $1 AND status IN ('approved', 'payment_pending')`,
      [rideId]
    );

    const pendingCount = parseInt(pendingApprovals.rows[0].count);
    const availableSlots = ride.seats_available - pendingCount;

    if (availableSlots <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No seats available — all seats are pending approval' });
    }

    // Get queue position
    const queueResult = await client.query(
      `SELECT COUNT(*) FROM bookings
       WHERE ride_id = $1 AND status = 'requested'`,
      [rideId]
    );
    const queuePosition = parseInt(queueResult.rows[0].count) + 1;

    // Calculate fare
    const pricePerKm = parseFloat(ride.price_per_km);
    const fareAmount = parseFloat((distanceKm * pricePerKm + 1).toFixed(2));

    // Create booking with 'requested' status
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        ride_id, rider_id, rider_email,
        pickup_name, drop_name,
        pickup_location, drop_location,
        distance_km, fare_amount,
        status, queue_position
      ) VALUES (
        $1, $2, $3, $4, $5,
        ST_GeogFromText('POINT(' || $6::text || ' ' || $7::text || ')'),
        ST_GeogFromText('POINT(' || $8::text || ' ' || $9::text || ')'),
        $10, $11, 'requested', $12
      ) RETURNING *`,
      [
        rideId,        // $1
        riderId,       // $2
        req.user.email,// $3
        pickupName,    // $4
        dropName,      // $5
        pickupLng,     // $6
        pickupLat,     // $7
        dropLng,       // $8
        dropLat,       // $9
        distanceKm,    // $10
        fareAmount,    // $11
        queuePosition, // $12
      ]
    );

    await client.query('COMMIT');

    const booking = bookingResult.rows[0];

    // Notify driver via Kafka
    await publishEvent('seat.requested', {
      bookingId:    booking.id,
      rideId,
      riderId,
      driverId:     ride.driver_id,
      driverEmail:  ride.driver_email,
      riderEmail:   req.user.email,
      riderName:    req.user.name || 'A rider',
      pickupName,
      dropName,
      fareAmount,
      queuePosition,
    });

    res.status(201).json({
      message: 'Seat requested successfully! Waiting for driver approval.',
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
// GET /rides/:rideId/requests
// Driver views all requests for their ride
// ─────────────────────────────────────
router.get('/:rideId/requests', async (req, res) => {
  const { rideId } = req.params;
  const driverId = req.user.id;

  try {
    // Verify this ride belongs to the driver
    const ride = await pool.query(
      'SELECT id FROM rides WHERE id = $1 AND driver_id = $2',
      [rideId, driverId]
    );

    if (ride.rows.length === 0) {
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
       AND b.status IN ('requested', 'approved', 'payment_pending', 'confirmed')
       ORDER BY b.queue_position ASC, b.created_at ASC`,
      [rideId]
    );

    res.json({ requests: result.rows.map(normalizeBookingDeadline) });
  } catch (err) {
    // Fallback without join if dblink not available
    console.error('[GetRequests]', err.message);
    const result = await pool.query(
      `SELECT * FROM bookings
       WHERE ride_id = $1
       AND status IN ('requested', 'approved', 'payment_pending', 'confirmed')
       ORDER BY queue_position ASC, created_at ASC`,
      [rideId]
    );
    res.json({ requests: result.rows.map(normalizeBookingDeadline) });
  }
});

// ─────────────────────────────────────
// PATCH /rides/:rideId/requests/:bookingId/approve
// Driver approves a request
// ─────────────────────────────────────
router.patch('/:rideId/requests/:bookingId/approve', async (req, res) => {
  const { rideId, bookingId } = req.params;
  const driverId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ride belongs to driver
    const ride = await client.query(
      'SELECT id, seats_available, driver_email FROM rides WHERE id = $1 AND driver_id = $2 FOR UPDATE',
      [rideId, driverId]
    );

    if (ride.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check available slots
    const pendingApprovals = await client.query(
      `SELECT COUNT(*) FROM bookings
       WHERE ride_id = $1 AND status IN ('approved', 'payment_pending')`,
      [rideId]
    );

    const rideRecord = ride.rows[0];
    const pendingCount = parseInt(pendingApprovals.rows[0].count);
    const availableSlots = rideRecord.seats_available - pendingCount;

    if (availableSlots <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No seats available to approve' });
    }

    // Set 15 minute payment deadline

    const result = await client.query(
      `UPDATE bookings
      SET status = 'approved',
          approved_at = NOW(),
          payment_deadline = NOW() + INTERVAL '15 minutes'
      WHERE id = $1 AND ride_id = $2 AND status = 'requested'
      RETURNING *`,
      [bookingId, rideId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    await client.query('COMMIT');

    const booking = normalizeBookingDeadline(result.rows[0]);
    const paymentDeadline = booking.payment_deadline;

    // Notify rider immediately via Kafka
    await publishEvent('seat.approved', {
      bookingId:       booking.id,
      rideId,
      riderId:         booking.rider_id,
      riderEmail:      booking.rider_email,
      driverId,
      driverEmail:     rideRecord.driver_email,
      fareAmount:      booking.fare_amount,
      paymentDeadline: paymentDeadline.toISOString(),
      pickupName:      booking.pickup_name,
      dropName:        booking.drop_name,
    });

    res.json({
      message: 'Request approved! Rider has 15 minutes to pay.',
      booking,
      paymentDeadline,
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
// PATCH /rides/:rideId/requests/:bookingId/reject
// Driver rejects a request
// ─────────────────────────────────────
router.patch('/:rideId/requests/:bookingId/reject', async (req, res) => {
  const { rideId, bookingId } = req.params;
  const driverId = req.user.id;

  try {
    // Verify ride belongs to driver
    const ride = await pool.query(
      'SELECT id FROM rides WHERE id = $1 AND driver_id = $2',
      [rideId, driverId]
    );

    if (ride.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(
      `UPDATE bookings SET status = 'rejected'
       WHERE id = $1 AND ride_id = $2 AND status = 'requested'
       RETURNING *`,
      [bookingId, rideId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const booking = result.rows[0];

    // Notify rider
    await publishEvent('seat.rejected', {
      bookingId:  booking.id,
      rideId,
      riderId:    booking.rider_id,
      riderEmail: booking.rider_email,
      pickupName: booking.pickup_name,
      dropName:   booking.drop_name,
    });

    res.json({ message: 'Request rejected', booking });
  } catch (err) {
    console.error('[RejectRequest]', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

module.exports = router;
