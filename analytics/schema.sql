-- Usage log (D1). Applied by deploy.mjs on every deploy; every statement is idempotent.
-- events: one row per thing that happened. at = the device's clock (events recorded offline arrive later), recv = when
-- the collector received it, ip/country/region/city/asn/org/ua = the request that delivered it (from Cloudflare's edge).
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  eid TEXT NOT NULL UNIQUE,
  at INTEGER NOT NULL,
  recv INTEGER NOT NULL,
  dev TEXT NOT NULL,
  sid TEXT,
  usr TEXT,
  app TEXT,
  t TEXT NOT NULL,
  path TEXT,
  data TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  org TEXT,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
CREATE INDEX IF NOT EXISTS events_dev ON events (dev, at);
CREATE INDEX IF NOT EXISTS events_t ON events (t, at);
CREATE INDEX IF NOT EXISTS events_ip ON events (ip);
-- devices: one row per browser (the random id site/track.js keeps in localStorage). usr comes from a named link
-- (?u=name); label is set from the dashboard and wins over usr. ctx is the latest device context (screen, model, …).
CREATE TABLE IF NOT EXISTS devices (
  dev TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  usr TEXT,
  label TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  org TEXT,
  ua TEXT,
  ctx TEXT
);
CREATE INDEX IF NOT EXISTS devices_seen ON devices (last_seen);
