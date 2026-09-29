import sqlite3
import hashlib
import sys
import os

DB_NAME = "exam_system.db"


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def create_admin_user(username: str, password: str, role_name: str = "ADMIN"):
    if not os.path.exists(DB_NAME):
        from database_setup import initialize_database
        initialize_database()

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Ensure role exists
    cursor.execute("SELECT role_id FROM roles WHERE UPPER(role_name) = UPPER(?)", (role_name,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("INSERT INTO roles (role_name, description) VALUES (?, ?)", (role_name.upper(), f"{role_name.upper()} Role"))
        conn.commit()
        cursor.execute("SELECT role_id FROM roles WHERE UPPER(role_name) = UPPER(?)", (role_name,))
        row = cursor.fetchone()
    
    role_id = row[0] if row else 1
    pwd_hash = hash_password(password)

    cursor.execute("""
    INSERT INTO users (username, password_hash, role_id)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
        password_hash=excluded.password_hash,
        role_id=excluded.role_id,
        is_active=1;
    """, (username, pwd_hash, role_id))

    conn.commit()
    conn.close()
    print(f"[SUCCESS] User '{username}' successfully registered/updated with role '{role_name.upper()}'.")


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        user = sys.argv[1]
        pwd = sys.argv[2]
        role = sys.argv[3] if len(sys.argv) > 3 else "ADMIN"
        create_admin_user(user, pwd, role)
    else:
        print("Usage: python add_admin.py <username> <password> [ROLE]")
        print("Example: python add_admin.py admin_john SecretPass123 ADMIN")
