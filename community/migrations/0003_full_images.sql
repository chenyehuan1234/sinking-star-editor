ALTER TABLE releases ADD COLUMN full_images TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(full_images));
