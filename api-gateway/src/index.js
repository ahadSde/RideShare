require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createClient } = require('redis');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', err => console.error('[Redis]', err.message));
redis.connect().then(() => console.log('[Redis] Gateway cache connected'));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

const services = {
  auth:    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
  ride:    process.env.RIDE_SERVICE_URL    || 'http://localhost:3002',
  fare:    process.env.FARE_SERVICE_URL    || 'http://localhost:3003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004',
};

const proxy = (target, pathRewrite) => createProxyMiddleware({
  target,
  changeOrigin: true,
  pathRewrite,
  on: {
    error: (err, req, res) => {
      res.status(502).json({ error: 'Service unavailable' });
    },
  },
});

app.use('/api/auth',    proxy(services.auth,    { '^/api/auth':    '/auth'    }));
app.use('/api/rides',   proxy(services.ride,    { '^/api/rides':   '/rides'   }));
app.use('/api/fare',    proxy(services.fare,    { '^/api/fare':    '/fare'    }));
app.use('/api/payment', proxy(services.payment, { '^/api/payment': '/payment' }));

app.get('/health', (req, res) => res.json({ gateway: 'ok' }));

app.listen(process.env.PORT || 3000, () => {
  console.log(`[API Gateway] Running on port ${process.env.PORT || 3000}`);
});