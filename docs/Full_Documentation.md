# 🛡️ Secure EMS — Complete Technical & Architectural Documentation

> **An automated, end-to-end secure examination paper distribution, venue accreditation, candidate biometric verification, and locked-down anti-cheat candidate kiosk platform.**

---

## 📖 1. Executive Overview

**Secure-EMS** is a high-security, cryptographically hardened Examination Management System designed to solve critical vulnerabilities in centralized examination workflows (e.g., university finals, recruitment tests). Traditional examination methods suffer from physical paper leaks, early unauthorized access, venue impersonation, and hall cheating. 

Secure-EMS mitigates these risks using a combination of **Two-Stage Double Cryptographic Encryption**, **Split-Key Authority (Two-Person Rule)**, **Server-Enforced Time-Lock Release Windows**, **Dynamic Forensic Watermarking**, **Blockchain Immutable Auditing**, and **Kiosk Browser Lockdown**.

---

## 🏛️ 2. System Architecture

The system follows a client-server architecture built on a modern tech stack.

### Technology Stack
- **Frontend Layer:** React 19, Vite 8, Vanilla CSS3 (Slate/Cyan/Emerald glassmorphism theme).
- **Backend API Layer:** Python 3.10+, FastAPI (with Uvicorn).
- **Database Layer:** SQLite 3 (`exam_system.db` for state, `blockchain_ledger.db` for immutable audit logs).
- **Security & Cryptography:** `Fernet` (AES-128-CBC) with Custom XOR fallback, SHA-256 Hashing.
- **Reporting & Artifacts:** ReportLab (for PDF generation).

### Deployment Architecture
- The backend is a standard REST API serving React frontend static files or acting as an API gateway.
- A multi-terminal routing architecture in `App.jsx` handles different entry points (terminals) based on URL hostname/hash patterns.

---

## 🔐 3. Core Security Features ("Technics")

Secure-EMS implements advanced security techniques to ensure the integrity of the examination process.

1. **Two-Stage Double Encryption**
   Plaintext question papers are encrypted sequentially using **Admin Key A** and **Supervisor Key B**. Both keys are required to decrypt the ciphertext (`.enc` payload), effectively requiring cooperation between the Exam Controller (Admin) and Venue Supervisor.
   
2. **Split-Key Authority (Two-Person Rule)**
   Paper decryption is impossible by a single party. It requires both the **Admin Token** and **Supervisor Cryptographic PIN** simultaneously at the venue.
   
3. **Server Time-Lock Engine**
   Automated server clock validation checks the `scheduled_unlock_time` in the database. Access attempts prior to this scheduled window are hard-blocked with an HTTP 403 `TIME_LOCK_SECURITY_BLOCK`.
   
4. **Dynamic Forensic Watermarking**
   Print dispatches embed dynamic watermarks (e.g., `CTR-101 | Timestamp | Client IP`) on every physical page to prevent unauthorized photography and trace distribution leaks.
   
5. **Blockchain Immutable Audit Ledger**
   All critical actions (paper uploads, authentication failures, decryption attempts, print dispatches, and anti-cheat violations) are hashed and chained (SHA-256). These are stored in `blockchain_ledger.db` ensuring that the audit trail is append-only and cryptographically verifiable for tampering.
   
6. **Student Kiosk Browser Lockdown (Anti-Cheat)**
   The Student Terminal disables context menus (right-click), copy-paste (`Ctrl+C/V`), print screen, and developer tools. Window blur, tab switching, or losing focus instantly triggers a `FOCUS_LOSS` security violation alert sent to the Supervisor.
   
7. **Biometric Verification**
   The Verification Terminal captures webcam snapshots of candidates at the hall entrance, calculates facial match confidence scores, and issues a single-use clearance token to allow examination entry.
   
8. **Venue Accreditation & MAC Binding**
   Exam venues must be registered with authorized MAC addresses and receive digital accreditation certificates to connect to the central server.
   
9. **Adaptive Rate Limiting (Brute-Force Shield)**
   A backend rate limiter tracks failed authentication/PIN attempts per IP and Center Code, enforcing temporary 15-minute lockouts upon 5 consecutive failures.

---

## 💻 4. Frontend Application & Terminals

The React frontend utilizes a multi-portal approach managed within `src/App.jsx`.

### 1. `ExamDashboard.jsx` (Master Command Hub)
- **Role:** Central oversight dashboard for system administrators.
- **Features:** Displays global system metrics, active countdowns for upcoming exams, cryptographic status, and a real-time streaming view of the immutable audit logs.

### 2. `AdminTerminal.jsx` (Exam Controller Portal)
- **Role:** Portal for Examination Controllers to manage papers.
- **Features:** Allows uploading of plaintext papers, triggering the two-stage double encryption, setting automated time-lock schedules, managing split keys, and dispatching AI Agent schedulers.

### 3. `SupervisorTerminal.jsx` (Center Supervisor Portal)
- **Role:** The gateway at the physical exam venue.
- **Features:** Facilitates the dual-key decryption process once the time-lock window opens. Manages dynamic watermarked printing dispatch and provides a live monitoring console of active student kiosks.

### 4. `StudentTerminal.jsx` (Locked Candidate Kiosk)
- **Role:** The testing interface for candidates.
- **Features:** Displays the decrypted paper (via `PdfCanvasViewer` or `ImagePaperViewer`). Enforces strict browser restrictions (anti-cheat) and streams a live heartbeat/status ping to the server every 5 seconds.

### 5. `VerificationTerminal.jsx` (Candidate Biometric Portal)
- **Role:** Entrance security portal.
- **Features:** Captures candidate webcam photos, matches them against registered databases, and issues clearance tokens.

### 6. `CenterRegistrationTerminal.jsx` (Venue Accreditation Portal)
- **Role:** Onboarding interface for new exam venues.
- **Features:** Registers center details, binds MAC hardware credentials, and issues digital accreditation certificates.

---

## 🗄️ 5. Database Schema & State Management

Secure-EMS uses two SQLite databases:

### `exam_system.db` (Primary State)
- **`roles` / `users`**: Manages RBAC (Role-Based Access Control) for ADMIN, CONTROLLER, and SUPERVISOR roles.
- **`exam_centers`**: Stores venue details, MAC bindings, and Supervisor PIN hashes.
- **`question_papers`**: Stores paper metadata, scheduled time-locks, split keys (Admin & Supervisor), and blockchain transaction hashes. The actual encrypted content is saved as `.enc` files on disk.
- **`scheduled_exams`**: Manages the examination schedules, unlock states, and tokens.
- **`student_verifications`**: Stores biometric clearance tokens and facial match scores.
- **`audit_logs`**: Stores a local copy of the chained audit events.

### `blockchain_ledger.db` (Immutable Ledger)
Managed by `secure_blockchain_engine.py`:
- **`blocks`**: Stores the cryptographic blocks (number, hashes, merkle roots).
- **`anchored_records`**: Stores transactions (papers, audit logs) anchored to a specific block, mapping `record_id` to its `tx_hash` and `payload_hash`.

---

## 🔌 6. REST API Reference

Key FastAPI backend endpoints located in `server.py`:

- `POST /api/admin/upload-paper`: Handles paper text input, performs 2-stage encryption, anchors the hash to the blockchain, and schedules the time-lock.
- `GET /api/admin/papers`: Retrieves registered paper metadata.
- `POST /api/decrypt`: The critical decryption gateway. Verifies Two-Person Rule (Admin Token + Supervisor PIN), enforces the Time-Lock window, and returns the decrypted paper content.
- `POST /api/print`: Dispatches securely watermarked print jobs for physical exam centers.
- `POST /api/student/paper`: Fetches the paper for a student kiosk (enforces time-lock).
- `GET /api/audit-logs`: Streams the recent audit logs.
- `GET /api/audit-logs/verify-integrity`: Iterates through the cryptographic hash chain of the audit ledger to detect tampering or data manipulation.
- `POST /api/blockchain/verify-paper`: Verifies the integrity of a stored `.enc` paper against its original anchored blockchain hash.

---

## 🚀 7. Future Prospects & Improvements

While Secure-EMS is highly secure, there are clear avenues for future growth and enterprise scaling:

1. **True Public Blockchain Integration:**
   - *Current:* Uses a simulated, local SQLite-based blockchain ledger (`blockchain_ledger.db`).
   - *Future:* Anchor merkle roots to a public testnet/mainnet (e.g., Polygon Amoy, Ethereum) using smart contracts (`contracts/`) to provide decentralized, publicly verifiable trust.
2. **Advanced Post-Quantum Cryptography (PQC):**
   - *Current:* Uses standard AES-128-CBC (`Fernet`) and SHA-256.
   - *Future:* Fully implement lattice-based Key Encapsulation Mechanisms (KEMs) like Kyber-1024 to future-proof against quantum decryption attacks.
3. **Automated AI Proctoring:**
   - *Current:* Client-side browser restrictions and basic webcam capture.
   - *Future:* Integrate real-time WebRTC video streaming with AI models (e.g., YOLO, MediaPipe) to detect multiple faces, absence of the candidate, or unauthorized devices in the candidate's environment.
4. **Cloud Migration & Scalability:**
   - *Current:* Local SQLite databases and local `.enc` file storage.
   - *Future:* Migrate to PostgreSQL/MySQL for high concurrency, use AWS S3 / Azure Blob Storage for encrypted payload storage, and manage keys using a centralized Key Management Service (KMS).
5. **Real-time WebSockets:**
   - *Current:* Student kiosks use standard HTTP polling (heartbeats) every 5 seconds.
   - *Future:* Implement WebSockets (via FastAPI) for instantaneous, low-overhead bi-directional communication between Student Kiosks and Supervisor Terminals.
6. **Hardware Security Modules (HSM):**
   - *Future:* Bind the MAC accreditation and key decryption processes directly to TPM/HSM modules on authorized center hardware to prevent device spoofing.
