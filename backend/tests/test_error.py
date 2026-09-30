import requests
import json
import socket

def test_api():
    try:
        payload = {
            "subject_code": "CS101",
            "paper_text": "Sample Diagnostic Request Payload",
            "delay_seconds": 10,
            "uploader_username": "controller_verma"
        }
        res = requests.post("http://127.0.0.1:8000/api/admin/upload-paper", json=payload)
        print("STATUS:", res.status_code)
        
        try:
            print("JSON RESPONSE:", res.json())
        except Exception:
            print("RAW TEXT ERROR (Traceback):", res.text[:2000])
    except Exception as e:
        print(f"Request failed entirely: {e}")

if __name__ == "__main__":
    test_api()
