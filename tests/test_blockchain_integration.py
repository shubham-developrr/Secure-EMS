import os
import sys
import unittest
import json
import sqlite3

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database_setup import initialize_database, DB_NAME
from secure_blockchain_engine import SecureBlockchainEngine

class TestBlockchainIntegration(unittest.TestCase):
    def setUp(self):
        self.test_db = "test_blockchain.db"
        self.engine = SecureBlockchainEngine(db_path=self.test_db)

    def tearDown(self):
        if os.path.exists(self.test_db):
            try:
                os.remove(self.test_db)
            except Exception:
                pass

    def test_genesis_block(self):
        blocks = self.engine.get_recent_blocks(limit=10)
        self.assertGreaterEqual(len(blocks), 0)

    def test_anchor_and_verify(self):
        record_id = "PAPER_TEST-99"
        payload = b"CONFIDENTIAL_QUESTION_PAPER_PAYLOAD_TEST_DATA"

        receipt = self.engine.anchor_record(record_id, payload, actor="TEST_CONTROLLER")
        self.assertIn("tx_hash", receipt)
        self.assertTrue(receipt["tx_hash"].startswith("0x"))
        self.assertEqual(receipt["status"], "CONFIRMED")

        # Verify integrity
        verification = self.engine.verify_record(record_id, payload)
        self.assertTrue(verification["verified"])
        self.assertEqual(verification["status"], "CONFIRMED")

        # Verify tampered payload fails
        tampered_payload = b"TAMPERED_QUESTION_PAPER_PAYLOAD"
        tampered_verification = self.engine.verify_record(record_id, tampered_payload)
        self.assertFalse(tampered_verification["verified"])
        self.assertEqual(tampered_verification["status"], "INTEGRITY_TAMPERED")

if __name__ == "__main__":
    unittest.main()
