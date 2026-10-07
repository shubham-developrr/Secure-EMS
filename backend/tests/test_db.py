from cloud_db_driver import get_db_connection
from datetime import datetime

def test():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Insert a mock paper
    try:
        cursor.execute("INSERT INTO question_papers (subject_code, encrypted_file_path, scheduled_unlock_time) VALUES (%s, %s, %s)", ("TEST", "path", "2026-10-10 10:00:00"))
        conn.commit()
    except:
        conn.conn.rollback()
        
    # 2. Fetch the metadata exactly as server.py does
    cursor.execute("SELECT * FROM question_papers WHERE subject_code = %s", ("TEST",))
    paper_row = cursor.fetchone()
    
    scheduled_time_str = paper_row["scheduled_unlock_time"]
    
    # 4. Verify Time-Lock Window (Simulating server.py lines 551-555)
    try:
        if isinstance(scheduled_time_str, datetime):
            scheduled_time = scheduled_time_str
        else:
            scheduled_time = datetime.strptime(scheduled_time_str, "%Y-%m-%d %H:%M:%S")
    except ValueError as e:
        print("ValueError:", e)
        scheduled_time = datetime.fromisoformat(scheduled_time_str)
    
    print("SUCCESS: Time parsed successfully!")

if __name__ == "__main__":
    test()
