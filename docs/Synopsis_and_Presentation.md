# 🛡️ Secure EMS — Project Synopsis & Presentation Guide

This document is structured specifically for academic submissions, project evaluations, and creating a slide deck presentation. It provides a high-level theoretical framework (Synopsis) followed by a structured slide-by-slide guide (Presentation Outline), and concludes with deep technical specifications.

---

## 📑 PART 1: PROJECT SYNOPSIS

### 1. Project Title
**Secure-EMS: A Cryptographically Hardened, Blockchain-Audited Examination Management System**

### 2. Introduction & Problem Statement
Traditional examination distribution systems rely heavily on physical logistics, making them highly susceptible to security breaches. Key vulnerabilities include:
- **Premature Leaks:** Question papers leaked during transit or physical storage.
- **Venue Impersonation:** Unaccredited centers acting as legitimate exam venues.
- **Single Point of Failure:** A single corrupt official at a venue can open papers early.
- **Candidate Impersonation & Cheating:** Lack of strict biometric checks and digital cheating during computer-based tests.
- **Lack of Accountability:** When a leak occurs, tracing the source is nearly impossible due to the lack of immutable audit trails.

### 3. Proposed Solution
**Secure-EMS** digitizes and secures the entire lifecycle of examination paper distribution and execution. It eliminates physical transit by distributing encrypted digital payloads, ensures that papers can only be opened at the exact scheduled time by authorized personnel, and enforces strict anti-cheat mechanisms on candidate terminals.

### 4. Core Objectives
1. **Zero-Trust Paper Distribution:** Papers remain cryptographically locked until the exact exam start time.
2. **Two-Person Rule Enforcement:** Ensure no single individual can decrypt the question paper.
3. **Immutable Auditing:** Record every action (uploads, logins, decryption attempts) on a tamper-proof blockchain ledger.
4. **Endpoint Security:** Prevent digital cheating by locking down the candidate's browser environment.
5. **Traceability:** Embed dynamic watermarks on any physical prints to instantly trace unauthorized photography back to the source.

### 5. System Architecture & Methodology
Secure-EMS operates on a Client-Server model with a multi-terminal frontend, designed to handle specific roles in the exam lifecycle.

- **Frontend:** React.js (Vite) utilizing a multi-portal routing system for distinct physical terminals (Admin, Supervisor, Student, Verification, Registration).
- **Backend API:** Python (FastAPI) handling cryptographic operations, routing, and database interactions.
- **Database:** SQLite 3 for state management, with a secondary SQLite instance acting as a simulated Blockchain Ledger for immutable logging.
- **Security:** `Fernet` (AES-128-CBC) symmetric encryption, SHA-256 hashing for the blockchain ledger, and adaptive rate limiters.

### 6. Key Security Mechanisms (The "Technics")
- **Two-Stage Double Encryption:** Papers are encrypted first by the Admin, then by the Supervisor.
- **Split-Key Authority:** Decryption requires the Admin's Token AND the Supervisor's PIN simultaneously.
- **Server Time-Lock Engine:** The backend rejects any decryption request made before the `scheduled_unlock_time`.
- **Dynamic Forensic Watermarking:** Physical printouts are dynamically overlaid with the Center Code, Timestamp, and IP Address.
- **Blockchain Audit Ledger:** A SHA-256 hash chain records all events. If a database row is manually altered, the hash chain breaks, immediately signaling tampering.
- **Student Kiosk Lockdown:** The student interface captures keyboard/mouse events, blocking `Ctrl+C/V`, right-clicks, and tracking focus loss (tab switching).
- **Biometric Verification:** Entrance clearance requires a webcam snapshot that is verified to issue a single-use token.

### 7. Future Scope & Enhancements
- Integration with Public Blockchains (e.g., Polygon, Ethereum) via Smart Contracts.
- Upgrading to Post-Quantum Cryptography (PQC) like Kyber-1024.
- Automated AI Proctoring (Real-time WebRTC stream analysis for multiple faces or unauthorized objects).
- Hardware Security Module (HSM) binding for venue accreditation.

---

## 📽️ PART 2: PRESENTATION SLIDES OUTLINE

*Use this section directly to build your PowerPoint / Google Slides presentation.*

### **Slide 1: Title Slide**
- **Title:** Secure-EMS: Cryptographically Hardened Examination System
- **Subtitle:** Eliminating leaks, impersonation, and fraud in central examinations.
- **Presenter Name:** [Your Name]
- **Visuals:** Project Logo or a padlock/shield graphic indicating security.

### **Slide 2: The Problem (Vulnerabilities in Traditional Exams)**
- **Bullet 1:** Physical transit of papers introduces high risk of premature leaks.
- **Bullet 2:** Single points of failure at exam venues (one corrupt official can compromise an exam).
- **Bullet 3:** Inability to trace the source of leaked photographs.
- **Bullet 4:** Digital cheating in standard browser environments (tab switching, copy-paste).
- **Visuals:** Icons representing broken chains, leaked papers, or a warning symbol.

### **Slide 3: Our Solution: Secure-EMS Overview**
- **Bullet 1:** Digital, encrypted paper distribution replacing physical transit.
- **Bullet 2:** Cryptographic Time-Locks ensuring papers open *only* when the exam starts.
- **Bullet 3:** Multi-terminal architecture tailored for Controllers, Supervisors, and Students.
- **Visuals:** High-level flow chart showing Admin -> Cloud -> Exam Venue.

### **Slide 4: Key Security Pillar 1 - Split-Key Cryptography**
- **Title:** The Two-Person Rule
- **Content:** The question paper undergoes **Two-Stage Double Encryption**. 
- **Mechanism:** To decrypt the paper, both the **Admin Token (Key A)** AND the **Supervisor PIN (Key B)** are required simultaneously. Neither party can unlock the paper alone.
- **Visuals:** Graphic of two different keys unlocking a single vault.

### **Slide 5: Key Security Pillar 2 - Time-Locks & Blockchain Auditing**
- **Time-Lock Engine:** Backend chronometer actively blocks any decryption requests made before the scheduled exam time, returning a `403 SECURITY BLOCK`.
- **Immutable Ledger:** Every single action (uploads, failed PINs, decryptions) is hashed using SHA-256 and chained into a blockchain ledger.
- **Visuals:** A clock crossed with a padlock, alongside a visual representation of a blockchain (connected blocks).

### **Slide 6: Key Security Pillar 3 - Kiosk Lockdown & Watermarking**
- **Anti-Cheat Kiosk:** The Student Terminal disables right-click, `Ctrl+C/V`, DevTools, and tracks window focus loss. Violations instantly ping the Supervisor dashboard.
- **Dynamic Watermarking:** If an exam center prints the paper, dynamic watermarks (Center Code, Timestamp, IP) are embedded on the page to trace leaks.
- **Visuals:** A crossed-out eye or "No Copy" icon, alongside an example of a watermarked paper.

### **Slide 7: System Architecture & Tech Stack**
- **Frontend:** React 19, Vite 8, Vanilla CSS (Glassmorphism UI).
- **Backend:** Python, FastAPI.
- **Database:** SQLite 3 (Dual databases: State DB + Blockchain Ledger DB).
- **Cryptography:** `Fernet` (AES-128-CBC) and SHA-256.
- **Visuals:** Tech stack logos (React, Python, SQLite).

### **Slide 8: Workflow Demonstration**
- **Step 1:** Controller uploads and double-encrypts the paper.
- **Step 2:** Exam Center registers and binds hardware MAC address.
- **Step 3:** Students arrive and complete Biometric Verification.
- **Step 4:** At exactly T-0, Supervisor and Admin apply dual keys to unlock.
- **Step 5:** Students take the exam in the locked-down kiosk.
- **Visuals:** A 5-step horizontal timeline or chevron diagram.

### **Slide 9: Future Scope & Enhancements**
- **Bullet 1:** Migration to True Public Blockchain (e.g., Polygon testnet).
- **Bullet 2:** Integration of Post-Quantum Cryptography (PQC).
- **Bullet 3:** AI-powered live video proctoring via WebRTC.
- **Visuals:** Icons representing AI, Quantum Computing, and decentralized networks.

### **Slide 10: Conclusion & Q&A**
- **Summary:** Secure-EMS restores trust in the examination process through cryptography, strict access control, and immutable accountability.
- **Prompt:** "Thank you. Any questions?"

---

## 🛠️ PART 3: IN-DEPTH TECHNICAL DETAILS (APPENDIX)

*(Include these details in your project report or refer to them during technical Q&A)*

### 1. Database Schema
Secure-EMS relies on a normalized relational structure:
- **`roles` / `users`**: RBAC for ADMIN, CONTROLLER, SUPERVISOR.
- **`exam_centers`**: Maps `center_code` to hardware MAC addresses and Supervisor PIN hashes.
- **`question_papers`**: Stores `subject_code`, `scheduled_unlock_time`, and the blockchain transaction hashes (`blockchain_tx_hash`).
- **`audit_logs`**: Stores local copies of the blockchain audit events, tracking `previous_hash` and `current_hash`.

### 2. The Blockchain Ledger (`blockchain_ledger.db`)
Implemented in `secure_blockchain_engine.py`:
- Contains a `blocks` table with `prev_block_hash`, `block_hash`, and `merkle_root`.
- Contains an `anchored_records` table linking specific system payloads (like an uploaded question paper) to a cryptographic block, ensuring absolute data immutability.

### 3. API Endpoints (FastAPI)
- `POST /api/admin/upload-paper`: Executes 2-stage encryption, anchors to blockchain, schedules time-lock.
- `POST /api/decrypt`: The critical gateway. Verifies Two-Person Rule, verifies time-lock, performs dual-layer decryption.
- `GET /api/audit-logs/verify-integrity`: Recalculates the entire SHA-256 hash chain from the Genesis block to detect any manual database tampering.
- `POST /api/student/paper`: Issues the exam paper to a student terminal (subject to time-lock).

### 4. Anti-Brute-Force Rate Limiter
Implemented in the backend, the `SecurityRateLimiter` tracks failed PIN attempts by IP and Center Code. 5 consecutive failures result in a 900-second (15-minute) cryptographic lockout, preventing brute-force PIN guessing.
