import os
import sqlite3
from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2.extras import DictCursor
except ImportError:
    psycopg2 = None
    DictCursor = None

# Force loading keys directly from root monorepo config
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))


class SQLiteCompatRow:
    def __init__(self, row: sqlite3.Row):
        self._row = row
        self._dict = dict(row)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._row[key]
        return self._dict.get(key)

    def get(self, key, default=None):
        return self._dict.get(key, default)

    def keys(self):
        return self._dict.keys()


class SQLiteFallbackCursor:
    def __init__(self, conn: sqlite3.Connection):
        self.cursor = conn.cursor()

    def _normalize_query(self, query: str) -> str:
        q = query.replace("%s", "?")
        return q

    def execute(self, query, params=None):
        q = self._normalize_query(query)
        if params:
            self.cursor.execute(q, params)
        else:
            self.cursor.execute(q)
        return self

    def executemany(self, query, params_list):
        q = self._normalize_query(query)
        self.cursor.executemany(q, params_list)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        return SQLiteCompatRow(row) if row is not None else None

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [SQLiteCompatRow(r) for r in rows] if rows else []

    @property
    def lastrowid(self):
        return self.cursor.lastrowid


class SQLiteFallbackConnection:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path, timeout=15.0, isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA busy_timeout=15000;")
        self.row_factory = sqlite3.Row

    def cursor(self):
        return SQLiteFallbackCursor(self.conn)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


class CloudDBCursor:
    def __init__(self, conn):
        self.cursor = conn.cursor(cursor_factory=DictCursor)

    def execute(self, query, params=None):
        pg_query = query.replace("?", "%s")
        pg_query = pg_query.replace("INSERT OR IGNORE INTO", "INSERT INTO")
        pg_query = pg_query.replace("INSERT OR REPLACE INTO", "INSERT INTO")

        # Suppress legacy SQLite schema mutations dynamically
        upp = pg_query.strip().upper()
        if upp.startswith("PRAGMA") or upp.startswith("ALTER TABLE") or upp.startswith("CREATE TABLE"):
            self.last_suppressed = True
            return self

        self.last_suppressed = False
        if params:
            self.cursor.execute(pg_query, params)
        else:
            self.cursor.execute(pg_query)
        return self

    def executemany(self, query, params_list):
        pg_query = query.replace("?", "%s")
        self.cursor.executemany(pg_query, params_list)
        return self

    def fetchone(self):
        if getattr(self, 'last_suppressed', False):
            return None
        row = self.cursor.fetchone()
        return row

    def fetchall(self):
        if getattr(self, 'last_suppressed', False):
            return []
        rows = self.cursor.fetchall()
        return rows if rows else []

    @property
    def lastrowid(self):
        return None


class CloudDBConnection:
    def __init__(self, dsn):
        self.conn = psycopg2.connect(dsn)
        self.row_factory = None

    def cursor(self):
        return CloudDBCursor(self.conn)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


_SQLITE_BOOTSTRAPPED = False


def _get_sqlite_fallback_connection():
    global _SQLITE_BOOTSTRAPPED
    import db_config
    db_path = db_config.get_db_path("exam_system.db")
    if not _SQLITE_BOOTSTRAPPED:
        _SQLITE_BOOTSTRAPPED = True
        try:
            import database_setup
            import insert_sample_data
            database_setup.initialize_database()
            insert_sample_data.insert_sample_data()
        except Exception:
            pass
    return SQLiteFallbackConnection(db_path)


def get_db_connection():
    testing = os.getenv("TESTING") == "1"
    dsn = os.getenv("DATABASE_URL") if testing else (os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL"))

    if dsn and dsn.startswith(("postgres://", "postgresql://")) and psycopg2 is not None:
        return CloudDBConnection(dsn)

    return _get_sqlite_fallback_connection()
