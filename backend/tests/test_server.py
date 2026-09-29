import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import server

client = TestClient(server.app)


def test_decrypt_rejects_missing_admin_token():
    response = client.post(
        "/api/decrypt",
        json={
            "username": "supervisor_center1",
            "center_code": "CTR-101",
            "subject_code": "MATH-210",
            "pin": "246810",
            "admin_token": "",
        },
    )
    assert response.status_code == 403
    assert "Admin Token (Key A) missing" in response.json()["detail"]


def test_decrypt_rejects_invalid_pin():
    response = client.post(
        "/api/decrypt",
        json={
            "username": "supervisor_center1",
            "center_code": "CTR-101",
            "subject_code": "MATH-210",
            "pin": "wrong-pin",
            "admin_token": "CTRL-KEY-999",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Incorrect supervisor cryptographic PIN."


def test_audit_logs_route_returns_json():
    response = client.get("/api/audit-logs")

    assert response.status_code == 200
    assert "audit_logs" in response.json()


def test_student_paper_rejects_missing_roll():
    response = client.post(
        "/api/student/paper",
        json={
            "roll_number": "",
            "seat_id": "DESK-42",
            "center_code": "CTR-101",
            "subject_code": "MATH-201",
        },
    )
    assert response.status_code == 403
    assert "Student Roll Number is required" in response.json()["detail"]


def test_student_security_alert_logging():
    response = client.post(
        "/api/student/security-alert",
        json={
            "roll_number": "2026-CS-042",
            "seat_id": "DESK-42",
            "center_code": "CTR-101",
            "subject_code": "MATH-201",
            "violation_type": "TAB_SWITCH_DETECTED",
            "details": "Student switched away from active kiosk window",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "recorded"


def test_student_paper_rejects_unuploaded_subject():
    response = client.post(
        "/api/student/paper",
        json={
            "roll_number": "2026-CS-999",
            "seat_id": "DESK-99",
            "center_code": "CTR-101",
            "subject_code": "NONEXISTENT-999",
        },
    )
    assert response.status_code == 404
    assert "No question paper has been uploaded" in response.json()["detail"]


def test_student_paper_time_lock_schedule_verification():
    # 1. Upload a paper with 1-hour delay in unlock time
    upload_res = client.post(
        "/api/admin/upload-paper",
        json={
            "subject_code": "TEST-FUTURE-101",
            "paper_text": "CONFIDENTIAL EXAM QUESTIONS\nQ1. Test future question?",
            "delay_seconds": 3600,
        },
    )
    assert upload_res.status_code == 200

    # 2. Attempt early student kiosk fetch -> must return 403 Forbidden
    early_fetch = client.post(
        "/api/student/paper",
        json={
            "roll_number": "2026-CS-101",
            "seat_id": "DESK-01",
            "center_code": "CTR-101",
            "subject_code": "TEST-FUTURE-101",
        },
    )
    assert early_fetch.status_code == 403
    assert "scheduled for unlock at" in early_fetch.json()["detail"]

    # 3. Upload a paper ready immediately (0 second delay)
    upload_now = client.post(
        "/api/admin/upload-paper",
        json={
            "subject_code": "TEST-NOW-101",
            "paper_text": "CONFIDENTIAL EXAM QUESTIONS\nQ1. Immediate question?",
            "delay_seconds": -5,
        },
    )
    assert upload_now.status_code == 200

    # 4. Fetch immediately ready paper -> must return 200 OK with exact uploaded text as-is
    now_fetch = client.post(
        "/api/student/paper",
        json={
            "roll_number": "2026-CS-101",
            "seat_id": "DESK-01",
            "center_code": "CTR-101",
            "subject_code": "TEST-NOW-101",
        },
    )
    assert now_fetch.status_code == 200
    assert now_fetch.json()["content"] == "CONFIDENTIAL EXAM QUESTIONS\nQ1. Immediate question?"


def test_decrypt_dual_key_paper_success():
    res = client.post(
        "/api/decrypt",
        json={
            "username": "supervisor_center1",
            "center_code": "CTR-101",
            "subject_code": "MATH-210",
            "pin": "246810",
            "admin_token": "ESNvPpFSPmy-aVdzN-flAhclqYxx0esE0MddouDtM4U=",
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "success"
    assert "content" in res.json()


def test_verify_student_persists_and_retrieves_captured_image():
    test_roll = "2026-TEST-VERIFY-88"
    sample_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    # 1. Post verification with image
    verify_res = client.post(
        "/api/verify-student",
        json={
            "roll_number": test_roll,
            "seat_id": "DESK-88",
            "center_code": "CTR-101",
            "captured_image_base64": sample_b64
        }
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True
    assert verify_res.json()["captured_image_base64"] == sample_b64

    # 2. Retrieve verification photo via GET API
    get_res = client.get(f"/api/student/verification/{test_roll}")
    assert get_res.status_code == 200
    assert get_res.json()["verified"] is True
    assert get_res.json()["captured_image_base64"] == sample_b64
def test_ai_agent_schedule_and_supervisor_publish_flow():
    # 1. AI Agent schedules an exam
    sched_res = client.post(
        "/api/schedule-exam",
        json={
            "center_code": "CTR-101",
            "exam_date": "2026-08-26",
            "exam_time": "10:00 AM",
            "subject_code": "TEST-AI-101",
            "duration_mins": 180,
            "scheduled_by": "AI_AGENT_SCHEDULER"
        }
    )
    assert sched_res.status_code == 200
    assert sched_res.json()["status"] == "SUCCESS"

    # 2. Supervisor fetches scheduled exams for center CTR-101
    sup_sched_res = client.get("/api/supervisor/scheduled-exams?center_code=CTR-101")
    assert sup_sched_res.status_code == 200
    exams = sup_sched_res.json()["scheduled_exams"]
    assert any(e["subject_code"] == "TEST-AI-101" for e in exams)

    # 3. Supervisor publishes paper to student app
    pub_res = client.post(
        "/api/supervisor/publish-paper",
        json={
            "center_code": "CTR-101",
            "subject_code": "TEST-AI-101",
            "supervisor_username": "supervisor_center1"
        }
    )
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "SUCCESS"
    assert "publish_token" in pub_res.json()

def test_audit_ledger_integrity_verification():
    res = client.get("/api/audit-logs/verify-integrity")
    assert res.status_code == 200
    assert res.json()["status"] == "VERIFIED"
    assert res.json()["audit_chain_valid"] is True

def test_zkp_challenge_response_generation():
    res = client.post(
        "/api/auth/challenge",
        json={
            "center_code": "CTR-101",
            "username": "supervisor_center1"
        }
    )
    assert res.status_code == 200
    assert res.json()["status"] == "SUCCESS"
    assert "nonce" in res.json()
    assert "challenge_token" in res.json()

def test_pqc_hybrid_key_wrapper_and_ram_zeroization():
    from secure_exam_core import PQCHybridKeyWrapper, zeroize_memory
    key_info = PQCHybridKeyWrapper.wrap_key_pqc("sample-encryption-key-256")
    assert "hybrid_ciphertext" in key_info
    assert key_info["pqc_algorithm"] == "ML-KEM-1024-KYBER-HYBRID"

    buf = bytearray(b"SENSITIVE_QUESTION_PAPER_TEXT")
    zeroize_memory(buf)
    assert all(b == 0 for b in buf)






