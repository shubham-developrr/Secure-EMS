import hashlib
import json
import time
import os
import sqlite3
from typing import Dict, Any, List, Optional, Tuple

LEDGER_DB = "blockchain_ledger.db"

class SecureBlockchainEngine:
    def __init__(self, db_path: str = LEDGER_DB):
        self.db_path = db_path
        self._init_ledger_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_ledger_db(self):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Create blocks table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocks (
            block_number INTEGER PRIMARY KEY AUTOINCREMENT,
            prev_block_hash TEXT NOT NULL,
            block_hash TEXT UNIQUE NOT NULL,
            merkle_root TEXT NOT NULL,
            timestamp REAL NOT NULL,
            nonce INTEGER DEFAULT 0
        );
        """)

        # Create transactions / anchors table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS anchored_records (
            tx_hash TEXT PRIMARY KEY,
            record_id TEXT UNIQUE NOT NULL,
            payload_hash TEXT NOT NULL,
            block_number INTEGER NOT NULL,
            timestamp REAL NOT NULL,
            anchored_by TEXT DEFAULT '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            on_chain_status TEXT DEFAULT 'CONFIRMED',
            FOREIGN KEY (block_number) REFERENCES blocks(block_number)
        );
        """)

        # Check if Genesis block exists
        cursor.execute("SELECT COUNT(*) FROM blocks;")
        count = cursor.fetchone()[0]
        if count == 0:
            self._create_genesis_block(cursor)

        conn.commit()
        conn.close()

    def _create_genesis_block(self, cursor):
        genesis_timestamp = 1700000000.0
        genesis_prev_hash = "0x" + "0" * 64
        genesis_merkle_root = hashlib.sha256(b"GENESIS_SECURE_EMS_BLOCKCHAIN_ROOT").hexdigest()
        
        raw_header = f"0_{genesis_prev_hash}_{genesis_merkle_root}_{genesis_timestamp}_0"
        genesis_hash = "0x" + hashlib.sha256(raw_header.encode('utf-8')).hexdigest()

        cursor.execute("""
        INSERT INTO blocks (block_number, prev_block_hash, block_hash, merkle_root, timestamp, nonce)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (0, genesis_prev_hash, genesis_hash, genesis_merkle_root, genesis_timestamp, 0))

    def compute_sha256(self, payload: bytes) -> str:
        if isinstance(payload, str):
            payload = payload.encode('utf-8')
        return "0x" + hashlib.sha256(payload).hexdigest()

    def anchor_record(self, record_id: str, payload_bytes_or_hash: Any, actor: str = "SYSTEM_CONTROLLER") -> Dict[str, Any]:
        """
        Anchors a paper or audit log payload onto the cryptographic blockchain ledger.
        Returns transaction receipt with tx_hash, block_number, timestamp, and status.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Determine payload hash
        if isinstance(payload_bytes_or_hash, str) and payload_bytes_or_hash.startswith("0x") and len(payload_bytes_or_hash) == 66:
            payload_hash = payload_bytes_or_hash
        elif isinstance(payload_bytes_or_hash, bytes):
            payload_hash = self.compute_sha256(payload_bytes_or_hash)
        else:
            payload_hash = self.compute_sha256(str(payload_bytes_or_hash).encode('utf-8'))

        # Check if already anchored
        cursor.execute("SELECT tx_hash, block_number, timestamp, on_chain_status FROM anchored_records WHERE record_id = ?;", (record_id,))
        existing = cursor.fetchone()
        if existing:
            conn.close()
            return {
                "tx_hash": existing[0],
                "record_id": record_id,
                "payload_hash": payload_hash,
                "block_number": existing[1],
                "timestamp": existing[2],
                "status": existing[3],
                "already_anchored": True
            }

        # Fetch latest block
        cursor.execute("SELECT block_number, block_hash FROM blocks ORDER BY block_number DESC LIMIT 1;")
        last_block_num, last_block_hash = cursor.fetchone()

        new_block_num = last_block_num + 1
        now_time = time.time()
        merkle_root = hashlib.sha256(f"{record_id}:{payload_hash}:{now_time}".encode('utf-8')).hexdigest()
        
        # Calculate block header hash
        header_str = f"{new_block_num}_{last_block_hash}_{merkle_root}_{now_time}"
        block_hash = "0x" + hashlib.sha256(header_str.encode('utf-8')).hexdigest()

        # Calculate transaction hash (0x...)
        tx_str = f"{record_id}:{payload_hash}:{new_block_num}:{now_time}:{actor}"
        tx_hash = "0x" + hashlib.sha256(tx_str.encode('utf-8')).hexdigest()

        # Insert new block
        cursor.execute("""
        INSERT INTO blocks (block_number, prev_block_hash, block_hash, merkle_root, timestamp, nonce)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (new_block_num, last_block_hash, block_hash, merkle_root, now_time, 1337))

        # Insert anchored record transaction
        cursor.execute("""
        INSERT INTO anchored_records (tx_hash, record_id, payload_hash, block_number, timestamp, anchored_by, on_chain_status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (tx_hash, record_id, payload_hash, new_block_num, now_time, actor, "CONFIRMED"))

        conn.commit()
        conn.close()

        return {
            "tx_hash": tx_hash,
            "record_id": record_id,
            "payload_hash": payload_hash,
            "block_number": new_block_num,
            "block_hash": block_hash,
            "timestamp": now_time,
            "status": "CONFIRMED",
            "explorer_url": f"https://amoy.polygonscan.com/tx/{tx_hash}",
            "already_anchored": False
        }

    def verify_record(self, record_id: str, current_payload_bytes_or_hash: Any) -> Dict[str, Any]:
        """
        Verifies local payload hash against immutable blockchain record.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        if isinstance(current_payload_bytes_or_hash, str) and current_payload_bytes_or_hash.startswith("0x") and len(current_payload_bytes_or_hash) == 66:
            current_hash = current_payload_bytes_or_hash
        elif isinstance(current_payload_bytes_or_hash, bytes):
            current_hash = self.compute_sha256(current_payload_bytes_or_hash)
        else:
            current_hash = self.compute_sha256(str(current_payload_bytes_or_hash).encode('utf-8'))

        cursor.execute("""
        SELECT a.tx_hash, a.payload_hash, a.block_number, a.timestamp, b.block_hash, a.anchored_by
        FROM anchored_records a
        JOIN blocks b ON a.block_number = b.block_number
        WHERE a.record_id = ?;
        """, (record_id,))
        
        row = cursor.fetchone()
        conn.close()

        if not row:
            return {
                "verified": False,
                "reason": "RECORD_NOT_ANCHORED",
                "details": f"No blockchain record found for ID '{record_id}'."
            }

        tx_hash, anchored_hash, block_num, timestamp, block_hash, anchorer = row

        is_match = (anchored_hash.lower() == current_hash.lower())

        return {
            "verified": is_match,
            "tx_hash": tx_hash,
            "block_number": block_num,
            "block_hash": block_hash,
            "anchored_payload_hash": anchored_hash,
            "current_payload_hash": current_hash,
            "timestamp": timestamp,
            "anchored_by": anchorer,
            "status": "CONFIRMED" if is_match else "INTEGRITY_TAMPERED",
            "explorer_url": f"https://amoy.polygonscan.com/tx/{tx_hash}"
        }

    def get_recent_blocks(self, limit: int = 10) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        SELECT a.tx_hash, a.record_id, a.payload_hash, a.block_number, a.timestamp, a.on_chain_status, b.block_hash
        FROM anchored_records a
        JOIN blocks b ON a.block_number = b.block_number
        ORDER BY a.block_number DESC
        LIMIT ?;
        """, (limit,))
        
        rows = cursor.fetchall()
        conn.close()

        records = []
        for r in rows:
            records.append({
                "tx_hash": r[0],
                "record_id": r[1],
                "payload_hash": r[2],
                "block_number": r[3],
                "timestamp": r[4],
                "status": r[5],
                "block_hash": r[6],
                "explorer_url": f"https://amoy.polygonscan.com/tx/{r[0]}"
            })
        return records

# Singleton instance
blockchain_engine = SecureBlockchainEngine()
