import sqlite3

def check_db():
    conn = sqlite3.connect('exam_system.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print('Tables in exam_system.db:', tables)
    
    print("\n--- Checking student_verifications table ---")
    cursor.execute("SELECT roll_number, seat_id, center_code, facial_match_confidence, status FROM student_verifications;")
    students = cursor.fetchall()
    if len(students) == 0:
        print("No student verifications found yet.")
    else:
        print("Recent student verifications:")
        for s in students:
            print(f"Roll No: {s[0]}, Seat: {s[1]}, Center: {s[2]}, Confidence: {s[3]}%, Status: {s[4]}")
    
    conn.close()

    try:
        conn = sqlite3.connect('blockchain_ledger.db')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print('Tables in blockchain_ledger.db:', tables)
        
        cursor.execute("PRAGMA table_info(blocks);")
        columns = cursor.fetchall()
        print('Columns in blocks table:', columns)

        cursor.execute("SELECT * FROM blocks;")
        rows = cursor.fetchall()
        print('Rows in blocks:', len(rows))
        if len(rows) > 0:
            print('Latest row:', rows[-1])
        conn.close()
    except Exception as e:
        print("Error checking blockchain:", e)

if __name__ == '__main__':
    check_db()
