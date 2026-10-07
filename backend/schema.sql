CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

CREATE TABLE IF NOT EXISTS exam_centers (
    center_id SERIAL PRIMARY KEY,
    center_code TEXT UNIQUE NOT NULL,
    center_name TEXT NOT NULL,
    authorized_device_mac TEXT UNIQUE NOT NULL,
    is_locked_down BOOLEAN DEFAULT TRUE,
    pin_hash TEXT
);

CREATE TABLE IF NOT EXISTS question_papers (
    paper_id SERIAL PRIMARY KEY,
    subject_code TEXT NOT NULL,
    encrypted_file_path TEXT NOT NULL,
    scheduled_unlock_time TIMESTAMP NOT NULL,
    encryption_key TEXT,
    admin_key TEXT,
    supervisor_key TEXT,
    blockchain_tx_hash TEXT,
    paper_hash TEXT,
    on_chain_status TEXT,
    uploaded_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INTEGER,
    center_id INTEGER,
    action_type TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    previous_hash TEXT,
    current_hash TEXT,
    blockchain_tx_hash TEXT,
    on_chain_status TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (center_id) REFERENCES exam_centers(center_id)
);

CREATE TABLE IF NOT EXISTS student_verifications (
    verification_id SERIAL PRIMARY KEY,
    roll_number TEXT UNIQUE NOT NULL,
    seat_id TEXT,
    center_code TEXT,
    captured_image_base64 TEXT,
    clearance_token TEXT,
    facial_match_confidence REAL,
    status TEXT DEFAULT 'VERIFIED',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scheduled_exams (
    schedule_id TEXT PRIMARY KEY,
    center_code TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    exam_time TEXT DEFAULT '10:00 AM',
    subject_code TEXT NOT NULL,
    duration_mins INTEGER DEFAULT 180,
    scheduled_by TEXT DEFAULT 'AI_AGENT_SCHEDULER',
    status TEXT DEFAULT 'SCHEDULED',
    supervisor_unlocked_at TIMESTAMP,
    unlocked_by_user TEXT,
    hall_publish_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description) VALUES 
('ADMIN', 'System Administrator with full management privileges'),
('CONTROLLER', 'Examination Controller responsible for paper upload and scheduling'),
('SUPERVISOR', 'Center Supervisor responsible for unlocking and printing at exam venues')
ON CONFLICT DO NOTHING;
