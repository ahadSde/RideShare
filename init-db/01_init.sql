-- Fresh bootstrap for the full Carpool project.
-- This single file creates every database, table, extension, and index
-- required by the current codebase. No follow-up migration file is needed.

-- Default database extensions used while creating child databases.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────
-- Auth Service DB
-- ─────────────────────────────────────
CREATE DATABASE auth_db;
\connect auth_db;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(10) NOT NULL CHECK (role IN ('driver', 'rider')),
  phone      VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────
-- Ride Service DB
-- ─────────────────────────────────────
CREATE DATABASE ride_db;
\connect ride_db;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE IF NOT EXISTS rides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL,
  driver_email    VARCHAR(150),
  from_name       VARCHAR(255) NOT NULL,
  to_name         VARCHAR(255) NOT NULL,
  from_location   GEOGRAPHY(POINT, 4326) NOT NULL,
  to_location     GEOGRAPHY(POINT, 4326) NOT NULL,
  route_path      GEOGRAPHY(LINESTRING, 4326),
  distance_km     NUMERIC(8,2) NOT NULL,
  duration_min    INTEGER NOT NULL,
  seats_total     INTEGER NOT NULL,
  seats_available INTEGER NOT NULL,
  price_per_km    NUMERIC(6,2) NOT NULL,
  departure_time  TIMESTAMP NOT NULL,
  status          VARCHAR(20) DEFAULT 'active'
                  CHECK (status IN ('active', 'in_progress', 'completed', 'cancelled')),
  description     TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id          UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id         UUID NOT NULL,
  rider_email      VARCHAR(150),
  pickup_name      VARCHAR(255) NOT NULL,
  drop_name        VARCHAR(255) NOT NULL,
  pickup_location  GEOGRAPHY(POINT, 4326) NOT NULL,
  drop_location    GEOGRAPHY(POINT, 4326) NOT NULL,
  distance_km      NUMERIC(8,2) NOT NULL,
  fare_amount      NUMERIC(8,2) NOT NULL,
  status           VARCHAR(20) DEFAULT 'requested'
                   CHECK (status IN (
                     'requested',
                     'approved',
                     'payment_pending',
                     'confirmed',
                     'expired',
                     'rejected',
                     'cancelled',
                     'completed'
                   )),
  queue_position   INTEGER DEFAULT 0,
  approved_at      TIMESTAMP,
  payment_deadline TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  user_name   VARCHAR(100) NOT NULL,
  user_role   VARCHAR(10) NOT NULL,
  parent_id   UUID REFERENCES ride_comments(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_from ON rides USING GIST (from_location);
CREATE INDEX IF NOT EXISTS idx_rides_to ON rides USING GIST (to_location);
CREATE INDEX IF NOT EXISTS idx_rides_route ON rides USING GIST (route_path);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_driver_status ON rides(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_departure_time ON rides(departure_time);

CREATE INDEX IF NOT EXISTS idx_bookings_ride ON bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_rider ON bookings(rider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_deadline ON bookings(payment_deadline);

CREATE INDEX IF NOT EXISTS idx_comments_ride ON ride_comments(ride_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON ride_comments(parent_id);

-- ─────────────────────────────────────
-- Fare Service DB
-- ─────────────────────────────────────
CREATE DATABASE fare_db;
\connect fare_db;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fare_config (
  id           SERIAL PRIMARY KEY,
  fuel_price   NUMERIC(6,2) DEFAULT 96.00,
  avg_mileage  NUMERIC(6,2) DEFAULT 18.00,
  platform_fee NUMERIC(6,2) DEFAULT 1.00,
  updated_at   TIMESTAMP DEFAULT NOW()
);

INSERT INTO fare_config (fuel_price, avg_mileage, platform_fee)
SELECT 96.00, 18.00, 1.00
WHERE NOT EXISTS (
  SELECT 1 FROM fare_config
);

CREATE TABLE IF NOT EXISTS fare_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   TEXT NOT NULL,
  distance_km  NUMERIC(8,2) NOT NULL,
  price_per_km NUMERIC(6,2) NOT NULL,
  base_fare    NUMERIC(8,2) NOT NULL,
  platform_fee NUMERIC(6,2) NOT NULL,
  total_fare   NUMERIC(8,2) NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fare_logs_booking ON fare_logs(booking_id);

-- ─────────────────────────────────────
-- Payment Service DB
-- ─────────────────────────────────────
CREATE DATABASE payment_db;
\connect payment_db;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL,
  rider_id            UUID NOT NULL,
  amount              NUMERIC(8,2) NOT NULL,
  razorpay_order_id   VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature  VARCHAR(255),
  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
