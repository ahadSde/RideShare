require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const { client: redis } = require('../redis');
const { authenticate } = require('../middleware/auth');
const { publishEvent } = require('../kafka/producer');

const router = express.Router();

const isValidIndianPhone = (value) => {
  if (value === undefined || value === null || value === '') return true;
  const digits = String(value).replace(/\D/g, '');
  return (
    /^[6-9]\d{9}$/.test(digits) ||
    /^91[6-9]\d{9}$/.test(digits)
  );
};

// ─────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['driver', 'rider']).withMessage('Role must be driver or rider'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .custom(isValidIndianPhone)
    .withMessage('Enter a valid 10-digit Indian mobile number'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role, phone } = req.body;

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password — bcrypt with 12 salt rounds
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, phone, created_at`,
      [name, email, hashedPassword, role, phone || null]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Cache user profile in Redis (60 min TTL) — reduces DB hits on repeated /me calls
    await redis.setEx(`user:${user.id}`, 3600, JSON.stringify(user));

    res.status(201).json({
      message: 'Registration successful',
      token,
      user,
    });
  } catch (err) {
    console.error('[Register]', err.message);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ─────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, name, email, password, role, phone, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Cache user in Redis
    const { password: _, ...safeUser } = user;
    await redis.setEx(`user:${user.id}`, 3600, JSON.stringify(safeUser));

    res.json({
      message: 'Login successful',
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('[Login]', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ─────────────────────────────────────
// POST /auth/forgot-password
// Creates a short-lived reset token and sends reset email asynchronously
// ─────────────────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

      await redis.setEx(
        `password-reset:${token}`,
        900,
        JSON.stringify({ userId: user.id, email: user.email })
      );

      await publishEvent('auth.password_reset_requested', {
        email: user.email,
        name: user.name,
        resetLink,
        expiresInMinutes: 15,
      });
    }

    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('[ForgotPassword]', err.message);
    res.status(500).json({ error: 'Server error while processing forgot password request' });
  }
});

// ─────────────────────────────────────
// POST /auth/logout
// Adds token to Redis blacklist — this is how we invalidate JWT tokens
// ─────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.token;
    const decoded = jwt.decode(token);

    // Calculate remaining TTL of the token so we don't keep blacklist entries forever
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.setEx(`blacklist:${token}`, ttl, '1');
    }

    // Remove cached user profile
    await redis.del(`user:${req.user.id}`);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[Logout]', err.message);
    res.status(500).json({ error: 'Server error during logout' });
  }
});

// ─────────────────────────────────────
// GET /auth/me — Get current user profile
// Checks Redis cache first, falls back to DB
// ─────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    // Try Redis cache first
    const cached = await redis.get(`user:${req.user.id}`);
    if (cached) {
      return res.json({ user: JSON.parse(cached), source: 'cache' });
    }

    // Cache miss — fetch from DB
    const result = await pool.query(
      'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    // Re-cache
    await redis.setEx(`user:${user.id}`, 3600, JSON.stringify(user));

    res.json({ user, source: 'db' });
  } catch (err) {
    console.error('[Me]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────
// PATCH /auth/me — Update current user profile
// Allows basic editable profile fields while keeping auth claims stable
// ─────────────────────────────────────
router.patch('/me', authenticate, [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .custom(isValidIndianPhone)
    .withMessage('Enter a valid 10-digit Indian mobile number'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, phone } = req.body;

  if (name === undefined && phone === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = CASE
             WHEN $2::text IS NULL THEN phone
             WHEN $2::text = '' THEN NULL
             ELSE $2
           END
       WHERE id = $3
       RETURNING id, name, email, role, phone, created_at`,
      [name ?? null, phone ?? null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    await redis.setEx(`user:${user.id}`, 3600, JSON.stringify(user));

    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    console.error('[UpdateProfile]', err.message);
    res.status(500).json({ error: 'Server error while updating profile' });
  }
});

// ─────────────────────────────────────
// PATCH /auth/me/password — Change current user password
// ─────────────────────────────────────
router.patch('/me/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  try {
    const result = await pool.query(
      'SELECT id, password FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    await redis.del(`user:${req.user.id}`);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[ChangePassword]', err.message);
    res.status(500).json({ error: 'Server error while changing password' });
  }
});

// ─────────────────────────────────────
// POST /auth/reset-password
// Resets password using a one-time token from Redis
// ─────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, newPassword } = req.body;

  try {
    const stored = await redis.get(`password-reset:${token}`);
    if (!stored) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    const { userId } = JSON.parse(stored);
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    await redis.del(`password-reset:${token}`);
    await redis.del(`user:${userId}`);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[ResetPassword]', err.message);
    res.status(500).json({ error: 'Server error while resetting password' });
  }
});

// ─────────────────────────────────────
// GET /auth/verify — Internal endpoint for other services to verify tokens
// Called by API Gateway and other microservices
// ─────────────────────────────────────
router.get('/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;
