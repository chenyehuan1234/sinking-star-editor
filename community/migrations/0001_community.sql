CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  recovery TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts(id),
  expires TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_account ON sessions(account);

CREATE TRIGGER revoke_sessions AFTER UPDATE OF password, recovery ON accounts
BEGIN
  DELETE FROM sessions WHERE account = NEW.id;
END;

CREATE TABLE works (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts(id),
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  active INTEGER NOT NULL DEFAULT 1,
  latest TEXT
) STRICT;
CREATE INDEX works_recent ON works(active, updated DESC, id DESC);

CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  work TEXT NOT NULL REFERENCES works(id),
  previous TEXT,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  manifest TEXT NOT NULL CHECK(json_valid(manifest)),
  search_root TEXT NOT NULL,
  search_levels TEXT NOT NULL CHECK(json_valid(search_levels)),
  scope TEXT NOT NULL CHECK(scope IN ('project','group','level')),
  bytes INTEGER NOT NULL CHECK(bytes > 0),
  cover TEXT,
  previews TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(previews)),
  image_bytes INTEGER NOT NULL DEFAULT 0 CHECK(image_bytes >= 0),
  UNIQUE(work, version)
) STRICT;

CREATE TABLE reports (
  work TEXT NOT NULL REFERENCES works(id),
  visitor TEXT NOT NULL,
  note TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(work, visitor)
) STRICT;

CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK(value >= 0)
) STRICT;

CREATE TABLE storage_usage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  value INTEGER NOT NULL,
  CONSTRAINT community_storage_limit CHECK(value BETWEEN 0 AND 891289600)
) STRICT;
INSERT INTO storage_usage(id, value) VALUES (1, 0);

-- The manifest becomes visible only when the complete release and its quota charge commit.
CREATE TRIGGER release_guard BEFORE INSERT ON releases
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM works WHERE id = NEW.work AND active = 1 AND latest IS NEW.previous
  ) THEN RAISE(ABORT, 'community_stale_release') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM releases WHERE work = NEW.work AND version = NEW.version
  ) THEN RAISE(ABORT, 'community_duplicate_version') END;
END;

CREATE TRIGGER publish_release AFTER INSERT ON releases
BEGIN
  UPDATE storage_usage SET value = value + NEW.bytes + NEW.image_bytes WHERE id = 1;
  UPDATE works SET latest = NEW.id, updated = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.work;
END;

CREATE TRIGGER count_release_images AFTER UPDATE OF image_bytes ON releases
BEGIN
  UPDATE storage_usage SET value = value + NEW.image_bytes - OLD.image_bytes WHERE id = 1;
END;
