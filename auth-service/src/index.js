require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const { connectRedis } = require('./redis');
const pool = require('./db');
const authRoutes = require('./routes/auth.routes');

const app = express();
app.use(express.json());

// ── Rate limiting (prevents brute force on login)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/auth/login', limiter);
app.use('/auth/register', limiter);

// ── Routes
app.use('/auth', authRoutes);

// ── Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// ── Start
const start = async () => {
  try {
    await connectRedis();
    await pool.query('SELECT 1'); // test DB connection
    console.log('[DB] PostgreSQL connected');
    app.listen(process.env.PORT, () => {
      console.log(`[Auth Service] Running on port ${process.env.PORT}`);
    });
  } catch (err) {
    console.error('[Startup Error]', err.message);
    process.exit(1);
  }
};

start();
