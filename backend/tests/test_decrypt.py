import requests

def test_api():
    try:
        payload = {
            "username": "controller_verma",
            "center_code": "CTR-101",
            "subject_code": "CS101",
            "pin": "246810",
            "admin_token": "admin"
        }
        res = requests.post("http://127.0.0.1:8000/api/decrypt", json=payload)
        print("STATUS:", res.status_code)
        
        try:
            print("JSON RESPONSE:", res.json())
        except Exception:
            print("RAW TEXT ERROR (Traceback):", res.text[:2000])
    except Exception as e:
        print(f"Request failed entirely: {e}")

if __name__ == "__main__":
    test_api()
