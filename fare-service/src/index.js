require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ─────────────────────────────────────
// POST /fare/calculate
// Called by Ride Service when a rider books a seat
// Calculates fare based on rider's actual road distance
// ─────────────────────────────────────
app.post('/fare/calculate', async (req, res) => {
  const { distanceKm, pricePerKm } = req.body;

  if (!distanceKm || !pricePerKm) {
    return res.status(400).json({ error: 'distanceKm and pricePerKm are required' });
  }

  try {
    // Get platform fee from DB config
    const config = await pool.query('SELECT * FROM fare_config ORDER BY id DESC LIMIT 1');
    const platformFee = config.rows[0]?.platform_fee || 1.00;

    const baseFare   = parseFloat((distanceKm * pricePerKm).toFixed(2));
    const totalFare  = parseFloat((baseFare + platformFee).toFixed(2));

    // Log the fare calculation
    await pool.query(
      `INSERT INTO fare_logs (booking_id, distance_km, price_per_km, base_fare, platform_fee, total_fare)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['temp-' + Date.now(), distanceKm, pricePerKm, baseFare, platformFee, totalFare]
    );

    res.json({
      distanceKm,
      pricePerKm,
      baseFare,
      platformFee,
      totalFare,
    });
  } catch (err) {
    console.error('[FareCalc]', err.message);
    res.status(500).json({ error: 'Fare calculation failed' });
  }
});

// ─────────────────────────────────────
// GET /fare/config — Get current fare config
// ─────────────────────────────────────
app.get('/fare/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fare_config ORDER BY id DESC LIMIT 1');
    res.json({ config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fare config' });
  }
});

// ─────────────────────────────────────
// GET /fare/estimate?distanceKm=50&fuelPrice=96&mileage=18
// Used by frontend to show estimate before booking
// ─────────────────────────────────────
app.get('/fare/estimate', async (req, res) => {
  const { distanceKm, fuelPrice, mileage } = req.query;

  if (!distanceKm || !fuelPrice || !mileage) {
    return res.status(400).json({ error: 'distanceKm, fuelPrice and mileage are required' });
  }

  const pricePerKm = parseFloat(fuelPrice) / parseFloat(mileage);
  const baseFare   = parseFloat((distanceKm * pricePerKm).toFixed(2));
  const totalFare  = parseFloat((baseFare + 1).toFixed(2)); // +1 platform fee

  res.json({ distanceKm: parseFloat(distanceKm), pricePerKm: parseFloat(pricePerKm.toFixed(2)), baseFare, totalFare });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'fare-service' }));

const start = async () => {
  await pool.query('SELECT 1');
  console.log('[DB] Fare DB connected');
  app.listen(process.env.PORT || 3003, () => {
    console.log(`[Fare Service] Running on port ${process.env.PORT || 3003}`);
  });
};

start().catch(err => { console.error(err.message); process.exit(1); });
