const express = require('express');
const router  = express.Router({ mergeParams: true }); // mergeParams to get rideId
const pool    = require('../db');

// ─────────────────────────────────────
// GET /rides/:rideId/comments
// Public — get all comments for a ride
// ─────────────────────────────────────
router.get('/', async (req, res) => {
  const { rideId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM ride_comments
       WHERE ride_id = $1
       ORDER BY created_at ASC`,
      [rideId]
    );

    // Nest replies under their parent
    const comments = result.rows;
    const topLevel = comments.filter(c => !c.parent_id);
    const nested   = topLevel.map(c => ({
      ...c,
      replies: comments.filter(r => r.parent_id === c.id),
    }));

    res.json({ comments: nested });
  } catch (err) {
    console.error('[GetComments]', err.message);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// ─────────────────────────────────────
// POST /rides/:rideId/comments
// Post a new question or comment
// ─────────────────────────────────────
router.post('/', async (req, res) => {
  const { rideId }  = req.params;
  const { message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ride_comments (ride_id, user_id, user_name, user_role, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [rideId, req.user.id, req.user.name || 'User', req.user.role, message.trim()]
    );
    res.status(201).json({ comment: result.rows[0] });
  } catch (err) {
    console.error('[PostComment]', err.message);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ─────────────────────────────────────
// POST /rides/:rideId/comments/:commentId/reply
// Reply to a comment (1 level deep)
// ─────────────────────────────────────
router.post('/:commentId/reply', async (req, res) => {
  const { rideId, commentId } = req.params;
  const { message }           = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Make sure parent comment exists and belongs to this ride
    const parent = await pool.query(
      `SELECT id, parent_id FROM ride_comments WHERE id = $1 AND ride_id = $2`,
      [commentId, rideId]
    );

    if (parent.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Only 1 level deep — if parent already has a parent, reject
    if (parent.rows[0].parent_id) {
      return res.status(400).json({ error: 'Cannot reply to a reply' });
    }

    const result = await pool.query(
      `INSERT INTO ride_comments (ride_id, user_id, user_name, user_role, parent_id, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [rideId, req.user.id, req.user.name || 'User', req.user.role, commentId, message.trim()]
    );

    res.status(201).json({ reply: result.rows[0] });
  } catch (err) {
    console.error('[PostReply]', err.message);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

module.exports = router;
