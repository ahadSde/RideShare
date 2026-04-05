const express = require('express');
const axios = require('axios');
const { body, query, validationResult } = require('express-validator');
const pool = require('../db');
const { client: redis } = require('../redis');
const { publishEvent } = require('../kafka/producer');
const { normalizeBookingDeadline } = require('../utils/datetime');

const router = express.Router();
const padTimestamp = (value) => String(value).padStart(2, '0');
const formatTimestampForDb = (date) => {
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${date.getFullYear()}-${padTimestamp(date.getMonth() + 1)}-${padTimestamp(date.getDate())} ${padTimestamp(date.getHours())}:${padTimestamp(date.getMinutes())}:${padTimestamp(date.getSeconds())}.${milliseconds}`;
};

// ─────────────────────────────────────
// POST /rides — Driver posts a new ride
// ─────────────────────────────────────
router.post('/', [
  body('fromName').notEmpty(),
  body('toName').notEmpty(),
  body('fromLat').isFloat(),
  body('fromLng').isFloat(),
  body('toLat').isFloat(),
  body('toLng').isFloat(),
  body('seats').isInt({ min: 1, max: 6 }),
  body('departureTime').isISO8601(),
  body('fuelPrice').isFloat({ min: 1 }),
  body('mileage').isFloat({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    fromName, toName,
    fromLat, fromLng, toLat, toLng,
    routeCoords, // array of [lng, lat] from ORS - the actual road path
    distanceKm, durationMin,
    seats, departureTime,
    fuelPrice, mileage,
    description,
  } = req.body;

  const driverId = req.user.id;
  const pricePerKm = parseFloat((fuelPrice / mileage).toFixed(2));
  const parsedDepartureTime = new Date(departureTime);

  if (Number.isNaN(parsedDepartureTime.getTime())) {
    return res.status(400).json({ error: 'Invalid departure time' });
  }

  if (parsedDepartureTime.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Departure time must be in the future' });
  }

  try {
    let routePathWkt = null;
    if (routeCoords && routeCoords.length >= 2) {
      routePathWkt = `LINESTRING(${routeCoords.map(c => `${c[0]} ${c[1]}`).join(',')})`;
    }

    const result = await pool.query(
      `INSERT INTO rides (
        driver_id, driver_email, from_name, to_name,
        from_location, to_location, route_path,
        distance_km, duration_min,
        seats_total, seats_available,
        price_per_km, departure_time, description
      ) VALUES (
        $1, $2, $3, $4,
        ST_GeogFromText('POINT(' || $5::text || ' ' || $6::text || ')'),
        ST_GeogFromText('POINT(' || $7::text || ' ' || $8::text || ')'),
        CASE WHEN $9::text IS NOT NULL THEN ST_GeogFromText($9) ELSE NULL END,
        $10, $11, $12, $12, $13, $14, $15
      ) RETURNING *`,
      [
        driverId, req.user.email,
        fromName, toName,
        fromLng, fromLat,
        toLng, toLat,
        routePathWkt,
        distanceKm, durationMin,
        seats, pricePerKm,
        formatTimestampForDb(parsedDepartureTime), description || null
      ]
    );

    const ride = result.rows[0];

    // Invalidate ride search cache so new ride appears in searches
    await redis.del('rides:search:*');

    res.status(201).json({ message: 'Ride posted successfully', ride });
  } catch (err) {
    console.error('[PostRide]', err.message);
    res.status(500).json({ error: 'Failed to post ride' });
  }
});

// ─────────────────────────────────────
// GET /rides/search — Rider searches for rides
// Uses PostGIS to find rides whose route passes near rider's pickup & drop
// ─────────────────────────────────────
router.get('/search', [
  query('pickupLat').isFloat(),
  query('pickupLng').isFloat(),
  query('dropLat').isFloat(),
  query('dropLng').isFloat(),
  query('date').isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { pickupLat, pickupLng, dropLat, dropLng, date } = req.query;
  const radiusMeters = 5000; // 5 km radius — rider's point must be within 5km of the route

  // Redis cache key based on search params
  const cacheKey = `rides:search:${pickupLat}:${pickupLng}:${dropLat}:${dropLng}:${date}`;

  try {
    // Check Redis cache first — covers the caching requirement
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ rides: JSON.parse(cached), source: 'cache' });
    }

    // PostGIS geospatial query:
    // Find rides where the route path passes within 5km of BOTH the rider's pickup AND drop
    const result = await pool.query(
      `WITH rider_points AS (
         SELECT
           ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')') AS pickup_point,
           ST_GeogFromText('POINT(' || $3 || ' ' || $4 || ')') AS drop_point
       )
       SELECT
         r.id, r.driver_id, r.from_name, r.to_name,
         r.distance_km, r.duration_min,
         r.seats_available, r.price_per_km,
         r.departure_time, r.status, r.description,
         ST_Distance(rp.pickup_point, rp.drop_point) / 1000 AS rider_distance_km
       FROM rides r
       CROSS JOIN rider_points rp
       WHERE
         r.status = 'active'
         AND r.seats_available > 0
         AND DATE(r.departure_time) = $5
         AND ST_DWithin(
           COALESCE(
             r.route_path,
             ST_MakeLine(r.from_location::geometry, r.to_location::geometry)::geography
           ),
           rp.pickup_point,
           $6
         )
         AND ST_DWithin(
           COALESCE(
             r.route_path,
             ST_MakeLine(r.from_location::geometry, r.to_location::geometry)::geography
           ),
           rp.drop_point,
           $6
         )
         AND ST_LineLocatePoint(
           COALESCE(
             r.route_path,
             ST_MakeLine(r.from_location::geometry, r.to_location::geometry)::geography
           )::geometry,
           rp.pickup_point::geometry
         ) <= ST_LineLocatePoint(
           COALESCE(
             r.route_path,
             ST_MakeLine(r.from_location::geometry, r.to_location::geometry)::geography
           )::geometry,
           rp.drop_point::geometry
         )
       ORDER BY r.departure_time ASC
       LIMIT 20`,
      [pickupLng, pickupLat, dropLng, dropLat, date, radiusMeters]
    );

    const rides = result.rows;

    // Cache results for 5 minutes — ride search is called frequently
    await redis.setEx(cacheKey, 300, JSON.stringify(rides));

    res.json({ rides, source: 'db' });
  } catch (err) {
    console.error('[SearchRides]', err.message);
    res.status(500).json({ error: 'Failed to search rides' });
  }
});

// ─────────────────────────────────────
// POST /rides/:rideId/book — Rider books a seat
// Uses PostgreSQL row-level locking to prevent double booking (concurrency control)
// ─────────────────────────────────────
router.post('/:rideId/book', [
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

  // ── Begin a DB transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── SELECT FOR UPDATE: Lock this ride row so no other request can modify it
    // This is the CONCURRENCY CONTROL mechanism — prevents two riders from
    // booking the last seat simultaneously
    const rideResult = await client.query(
      `SELECT id, seats_available, price_per_km, status
       FROM rides
       WHERE id = $1
       FOR UPDATE`,  // <-- row-level lock acquired here
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

    if (ride.seats_available < 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No seats available — someone just booked the last one!' });
    }

    // ── Call Fare Service to calculate exact fare for rider's distance
    let fareAmount;
    try {
      const fareRes = await axios.post(`${process.env.FARE_SERVICE_URL}/fare/calculate`, {
        distanceKm,
        pricePerKm: ride.price_per_km,
      });
      fareAmount = fareRes.data.totalFare;
    } catch (err) {
      // If fare service is down, calculate locally as fallback
      fareAmount = parseFloat((distanceKm * ride.price_per_km + 1).toFixed(2));
    }

    // ── Decrement available seats
    await client.query(
      'UPDATE rides SET seats_available = seats_available - 1 WHERE id = $1',
      [rideId]
    );

    // ── Create the booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        ride_id, rider_id,
        pickup_name, drop_name,
        pickup_location, drop_location,
        distance_km, fare_amount
      ) VALUES (
        $1, $2, $3, $4,
        ST_GeogFromText('POINT(' || $5::text || ' ' || $6::text || ')'),
        ST_GeogFromText('POINT(' || $7::text || ' ' || $8::text || ')'),
        $9, $10
      ) RETURNING *`,
      [
        rideId, riderId,
        pickupName, dropName,
        pickupLng, pickupLat,
        dropLng, dropLat,
        distanceKm, fareAmount,
      ]
    );

    await client.query('COMMIT');
    // ── Lock released here after COMMIT

    const booking = bookingResult.rows[0];

    // ── Publish Kafka event — Notification Service will consume this
    await publishEvent('booking.confirmed', {
      bookingId: booking.id,
      rideId,
      riderId,
      driverId: ride.driver_id,
      fareAmount,
      pickupName,
      dropName,
    });

    // Invalidate ride cache
    await redis.del(`rides:search:*`);

    res.status(201).json({ message: 'Seat booked successfully', booking });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BookRide]', err.message);
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  } finally {
    client.release(); // always release the connection back to the pool
  }
});

// ─────────────────────────────────────
// PATCH /rides/:rideId/start — Driver starts the ride
// ─────────────────────────────────────
router.patch('/:rideId/start', async (req, res) => {
  const { rideId } = req.params;
  const driverId = req.user.id;

  try {
    const result = await pool.query(
      `UPDATE rides SET status = 'in_progress'
       WHERE id = $1 AND driver_id = $2 AND status = 'active'
       RETURNING *`,
      [rideId, driverId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ride not found or not authorized' });
    }

    const ride = result.rows[0];
    const riderResult = await pool.query(
      `SELECT rider_id, rider_email
       FROM bookings
       WHERE ride_id = $1 AND status = 'confirmed'`,
      [rideId]
    );

    for (const rider of riderResult.rows) {
      await publishEvent('ride.started', {
        rideId,
        driverId,
        riderId: rider.rider_id,
        riderEmail: rider.rider_email,
        startedAt: new Date().toISOString(),
      });
    }

    res.json({ message: 'Ride started', ride });
  } catch (err) {
    console.error('[StartRide]', err.message);
    res.status(500).json({ error: 'Failed to start ride' });
  }
});

// ─────────────────────────────────────
// GET /rides/my — Get driver's own rides or rider's bookings
// ─────────────────────────────────────
router.get('/my', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'driver') {
      result = await pool.query(
        `SELECT * FROM rides 
         WHERE driver_id = $1 
         ORDER BY departure_time DESC`,
        [req.user.id]
      );
    } else {
      result = await pool.query(
        `SELECT b.*, r.from_name, r.to_name, 
                r.departure_time, r.driver_id,
                r.price_per_km, r.distance_km as route_distance
         FROM bookings b
         JOIN rides r ON b.ride_id = r.id
         WHERE b.rider_id = $1
         ORDER BY b.created_at DESC`,
        [req.user.id]
      );
    }
    const data = req.user.role === 'rider'
      ? result.rows.map(normalizeBookingDeadline)
      : result.rows;
    res.json({ data });
  } catch (err) {
    console.error('[MyRides]', err.message);
    res.status(500).json({ error: 'Failed to fetch rides' });
  }
});

// GET /rides/booking/:bookingId — get booking details for payment page
// router.get('/booking/:bookingId', async (req, res) => {
//   try {
//     const result = await pool.query(
//       'SELECT * FROM bookings WHERE id = $1 AND rider_id = $2',
//       [req.params.bookingId, req.user.id]
//     );
//     if (result.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
//     res.json({ booking: result.rows[0] });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch booking' });
//   }
// });

// GET /rides/booking/:bookingId — get single booking for payment page
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, r.from_name, r.to_name, r.departure_time, r.driver_id
       FROM bookings b
       JOIN rides r ON b.ride_id = r.id
       WHERE b.id = $1 AND b.rider_id = $2`,
      [req.params.bookingId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ booking: normalizeBookingDeadline(result.rows[0]) });
  } catch (err) {
    console.error('[GetBooking]', err.message);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// GET /rides/:rideId — get single ride detail
router.get('/:rideId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rides WHERE id = $1',
      [req.params.rideId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ride' });
  }
});

module.exports = router;
