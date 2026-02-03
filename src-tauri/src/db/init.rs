//! Database initialization and migration

use rusqlite::{Connection, Result};
use std::path::Path;

const CURRENT_SCHEMA_VERSION: i32 = 2;

/// Initialize the database with tables and indexes
pub fn init_db(conn: &Connection) -> Result<()> {
    // Create schema_version table first
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    // Check current version
    let current_version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    if current_version < CURRENT_SCHEMA_VERSION {
        run_migrations(conn, current_version)?;
    }

    Ok(())
}

/// Run database migrations from current version to latest
fn run_migrations(conn: &Connection, from_version: i32) -> Result<()> {
    if from_version < 1 {
        migrate_v1(conn)?;
    }
    if from_version < 2 {
        migrate_v2(conn)?;
    }

    Ok(())
}

/// Version 1: Initial schema
fn migrate_v1(conn: &Connection) -> Result<()> {
    // Songs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS songs (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            artist          TEXT NOT NULL DEFAULT '未知艺术家',
            album           TEXT NOT NULL DEFAULT '未知专辑',
            duration        REAL NOT NULL DEFAULT 0.0,
            file_path       TEXT NOT NULL,
            file_size       INTEGER NOT NULL DEFAULT 0,
            is_hr           INTEGER DEFAULT 0,
            is_sq           INTEGER DEFAULT 0,
            cover_url       TEXT,
            source_type     TEXT NOT NULL DEFAULT 'local',
            server_id       TEXT,
            server_song_id  TEXT,
            stream_info     TEXT,
            file_modified   INTEGER,
            created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    // Stream servers table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS stream_servers (
            id              TEXT PRIMARY KEY,
            server_type     TEXT NOT NULL,
            server_name     TEXT NOT NULL,
            server_url      TEXT NOT NULL,
            username        TEXT NOT NULL,
            password        TEXT NOT NULL,
            access_token    TEXT,
            user_id         TEXT,
            enabled         INTEGER NOT NULL DEFAULT 1,
            created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    // Scan configs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS scan_configs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            directories     TEXT NOT NULL,
            skip_short      INTEGER DEFAULT 1,
            min_duration    REAL DEFAULT 60.0,
            last_scan_at    INTEGER
        )",
        [],
    )?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_source ON songs(source_type)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_server ON songs(server_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)",
        [],
    )?;

    // Record version
    conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [1])?;

    Ok(())
}

/// Version 2: Add cover_hash column for cached covers
fn migrate_v2(conn: &Connection) -> Result<()> {
    // Add cover_hash column to songs table
    conn.execute(
        "ALTER TABLE songs ADD COLUMN cover_hash TEXT",
        [],
    )?;

    // Create cover_cache table for tracking cached covers
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cover_cache (
            hash            TEXT PRIMARY KEY,
            mid_path        TEXT,
            original_path   TEXT,
            file_size       INTEGER DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
        [],
    )?;

    // Create index for cover_hash lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_cover_hash ON songs(cover_hash)",
        [],
    )?;

    // Record version
    conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [2])?;

    Ok(())
}

/// Open or create a database at the given path
pub fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // Enable foreign keys and WAL mode for better performance
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -64000;"
    )?;

    init_db(&conn)?;

    Ok(conn)
}
