ALTER TABLE releases ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags));
CREATE INDEX works_published ON works(active, created DESC, id DESC);
