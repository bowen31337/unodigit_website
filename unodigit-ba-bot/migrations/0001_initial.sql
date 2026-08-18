CREATE TABLE leads (
  id                TEXT PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  mobile            TEXT NOT NULL,
  company           TEXT,
  role              TEXT,
  ip_hash           TEXT NOT NULL,
  country           TEXT,
  asn               TEXT,
  user_agent        TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  referrer          TEXT,
  landing_page      TEXT,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  consent_ts        INTEGER
);

CREATE TABLE conversations (
  id                 TEXT PRIMARY KEY,
  lead_id            TEXT REFERENCES leads(id),
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  state              TEXT NOT NULL,
  turn_count         INTEGER NOT NULL DEFAULT 0,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL    NOT NULL DEFAULT 0,
  abandoned_at_state TEXT
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  seq             INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  slots_json      TEXT,
  off_topic       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE briefs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  markdown        TEXT NOT NULL,
  sections_json   TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE quotes (
  id              TEXT PRIMARY KEY,
  brief_id        TEXT NOT NULL REFERENCES briefs(id),
  markdown        TEXT NOT NULL,
  mode            TEXT NOT NULL,
  total_tasks     INTEGER NOT NULL,
  weighted_tasks  REAL NOT NULL,
  rate_aud        REAL NOT NULL,
  low_aud         REAL NOT NULL,
  high_aud        REAL NOT NULL,
  weeks           INTEGER NOT NULL,
  confidence      TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  subsystems_json TEXT,
  valid_until     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE rate_limit (
  ip_hash     TEXT NOT NULL,
  day         TEXT NOT NULL,
  quote_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  type            TEXT NOT NULL,
  payload_json    TEXT,
  created_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_messages_conv_seq ON messages(conversation_id, seq);
CREATE INDEX idx_events_conv ON events(conversation_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_briefs_conv ON briefs(conversation_id);
CREATE INDEX idx_quotes_brief ON quotes(brief_id);
