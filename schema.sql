DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    age INTEGER DEFAULT NULL,
    province TEXT DEFAULT NULL,
    city TEXT DEFAULT NULL,
    region TEXT DEFAULT NULL,
    gender TEXT DEFAULT NULL,
    photo_file_id TEXT DEFAULT NULL,
    category TEXT DEFAULT NULL,
    search_scope TEXT DEFAULT NULL,
    status TEXT DEFAULT 'idle',
    partner_id BIGINT DEFAULT NULL,
    profile_step TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);