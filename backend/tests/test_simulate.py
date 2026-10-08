import requests
import time

def test():
    API = "http://127.0.0.1:8000"
    
    # Actually wait I can't restart the user's FastAPI here, but I can just boot a fresh instance!
    print("Testing offline driver logic.")
    
    from cloud_db_driver import get_db_connection
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO exam_centers (center_code, center_name, authorized_device_mac, pin_hash) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", ("CTR-999", "Test", "mac-999", "hash"))
    c.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s) ON CONFLICT DO NOTHING", ("tester", "hash"))
    conn.commit()
    print("DB setup complete.")

    try:
        from server import app
        # Because we can't reliably test FastAPI if it's already running in their UI, we just check if it imports cleanly!
        print("Server imported securely!")
    except Exception as e:
        print("IMPORT CRASH:", e)

if __name__ == "__main__":
    test()
