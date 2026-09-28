import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_pdf(filename="Secure_EMS_Beginner_Technology_Guide.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Modern Palette
    primary_color = colors.HexColor("#0f172a") # Dark Slate 900
    accent_blue = colors.HexColor("#0284c7")   # Cyan 600
    purple_accent = colors.HexColor("#7c3aed") # Purple 600
    emerald_color = colors.HexColor("#059669") # Emerald 600
    amber_color = colors.HexColor("#d97706")   # Amber 600
    text_dark = colors.HexColor("#1e293b")     # Slate 800
    bg_light = colors.HexColor("#f8fafc")      # Slate 50
    border_color = colors.HexColor("#cbd5e1")  # Slate 300

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=purple_accent,
        spaceAfter=10
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6
    )

    subsection_heading = ParagraphStyle(
        'SubSectionHeading',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=accent_blue,
        spaceBefore=8,
        spaceAfter=4
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=text_dark,
        spaceAfter=5
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=text_dark
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        textColor=primary_color
    )

    story = []

    # Title & Header
    story.append(Paragraph("🛡️ SECURE-EMS: COMPLETE TECHNOLOGY STACK & BEGINNER'S GUIDE", title_style))
    story.append(Paragraph("A Comprehensive Breakdown of All Technologies, Architecture, Components, & File Functions", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=purple_accent, spaceAfter=8))

    # Executive Overview
    story.append(Paragraph("1. Executive Overview & System Purpose", section_heading))
    story.append(Paragraph(
        "<b>Secure-EMS (Secure Examination Management System)</b> is a state-of-the-art software platform built to prevent examination paper leaks, "
        "impersonation, unauthorized early decryption, and exam hall cheating in central university and recruitment testing centers. "
        "It achieves zero-trust security through <b>2-Stage Nested Double Encryption</b>, <b>Split-Key Multi-Party Authority</b>, <b>Automated Time-Lock Release Windows</b>, "
        "<b>Biometric Candidate Verification</b>, <b>Locked-down Kiosk Anti-Cheat Pings</b>, and an <b>Immutable Blockchain Audit Ledger</b>.",
        body_style
    ))

    # Section 2: Technology Stack Breakdown
    story.append(Paragraph("2. Technologies Used & What They Do (Beginner's Guide)", section_heading))

    tech_modules = [
        ("🎨 Frontend Technologies (User Interface)", [
            ("React 19", "A modern JavaScript library for building component-based, single-page web user interfaces. It manages UI state dynamically across terminals without full page reloads."),
            ("Vite 8", "A lightning-fast frontend development server and bundler. It uses native ES modules to compile React code instantaneously during development and build optimized bundles for production."),
            ("Vanilla CSS3", "Modern CSS styling introducing sleek glassmorphism, responsive grid/flexbox layouts, dark mode aesthetic (Slate/Cyan/Emerald palette), and custom micro-animations."),
            ("Canvas / PDF.js", "Integrated visual document viewers (<code>PdfCanvasViewer.jsx</code> & <code>ImagePaperViewer.jsx</code>) that render encrypted question paper pages securely inside locked student kiosks.")
        ]),
        ("⚡ Backend Technologies (Server API & Business Logic)", [
            ("FastAPI", "A high-performance Python web framework used to build RESTful API endpoints (handling uploads, decryptions, biometrics, schedules, and audit streaming)."),
            ("Python Cryptography (Fernet)", "Enforces AES-128-CBC encryption and SHA-256 HMAC authentication. It implements the <b>2-Stage Double Encryption engine</b> where papers are encrypted with Admin Key A and Supervisor Key B."),
            ("Security Rate Limiter", "An in-memory brute-force defense engine (<code>SecurityRateLimiter</code>) that tracks invalid PIN/key attempts per IP/Center and locks out attackers for 15 minutes after 5 failures.")
        ]),
        ("⛓️ Blockchain & Verification Engine", [
            ("Solidity 0.8.20", "A smart contract programming language. The contract <code>contracts/AuditLedger.sol</code> defines on-chain functions (<code>anchorLog</code> & <code>verifyLog</code>) to store cryptographic payload hashes."),
            ("Secure Blockchain Engine", "A Python engine (<code>secure_blockchain_engine.py</code>) implementing SHA-256 block header chaining, block timestamping, Merkle roots, local ledger persistence, and Polygon Amoy testnet Web3 transaction receipts (`0x...`).")
        ]),
        ("🗄️ Database & Storage", [
            ("SQLite 3", "A lightweight, zero-configuration relational database engine (<code>exam_system.db</code> & <code>blockchain_ledger.db</code>) with foreign keys enabled, storing users, centers, papers, audit logs, and candidate biometrics.")
        ]),
        ("🧪 Quality Assurance & Reporting", [
            ("Vitest & RTL", "Modern testing frameworks used to write automated unit and component integration tests for React terminals."),
            ("ReportLab", "A Python library used to programmatically generate professional PDF documents (like this master tech guide).")
        ])
    ]

    for category_title, items in tech_modules:
        story.append(Paragraph(category_title, subsection_heading))
        for tech_name, tech_desc in items:
            story.append(Paragraph(f"• <b>{tech_name}:</b> {tech_desc}", body_style))
        story.append(Spacer(1, 2))

    # Section 3: Detailed File & Section Mapping Table
    story.append(Paragraph("3. Detailed File & Section Mapping Table", section_heading))
    story.append(Paragraph("This table maps every major file in the project to its technology, target section, and specific function:", body_style))

    table_data = [
        [
            Paragraph("File Name & Path", table_header_style),
            Paragraph("Technology Used", table_header_style),
            Paragraph("System Section / Terminal", table_header_style),
            Paragraph("Detailed Function & Responsibility", table_header_style)
        ],
        [
            Paragraph("<code>server.py</code>", table_cell_bold),
            Paragraph("FastAPI, Python Cryptography", table_cell_style),
            Paragraph("Backend API Core", table_cell_style),
            Paragraph("Main server running API routes for uploads, 2-stage decryptions, biometrics, scheduling, time-locks, and audit logging.", table_cell_style)
        ],
        [
            Paragraph("<code>secure_blockchain_engine.py</code>", table_cell_bold),
            Paragraph("Python, SHA-256, Web3 RPC", table_cell_style),
            Paragraph("Blockchain Layer", table_cell_style),
            Paragraph("Cryptographic block engine that anchors SHA-256 payload digests on-chain and generates `0x...` transaction receipts.", table_cell_style)
        ],
        [
            Paragraph("<code>contracts/AuditLedger.sol</code>", table_cell_bold),
            Paragraph("Solidity 0.8.20", table_cell_style),
            Paragraph("Smart Contract", table_cell_style),
            Paragraph("Smart contract deployed to Polygon Amoy testnet for decentralized audit trail and paper hash verification.", table_cell_style)
        ],
        [
            Paragraph("<code>database_setup.py</code>", table_cell_bold),
            Paragraph("SQLite 3, Python", table_cell_style),
            Paragraph("Database Layer", table_cell_style),
            Paragraph("Initializes relational tables (`users`, `exam_centers`, `question_papers`, `audit_logs`, `student_verifications`, `scheduled_exams`).", table_cell_style)
        ],
        [
            Paragraph("<code>src/AdminTerminal.jsx</code>", table_cell_bold),
            Paragraph("React 19, Vanilla CSS", table_cell_style),
            Paragraph("Controller Portal", table_cell_style),
            Paragraph("Exam Controller hub to double-encrypt question papers, set time-locks, and view on-chain blockchain transaction receipts.", table_cell_style)
        ],
        [
            Paragraph("<code>src/SupervisorTerminal.jsx</code>", table_cell_bold),
            Paragraph("React 19, Vanilla CSS", table_cell_style),
            Paragraph("Center Supervisor Portal", table_cell_style),
            Paragraph("Supervisor gateway featuring dual-key authorization, <b>On-Chain Integrity Pre-Check</b>, and student kiosk monitoring.", table_cell_style)
        ],
        [
            Paragraph("<code>src/StudentTerminal.jsx</code>", table_cell_bold),
            Paragraph("React 19, HTML5 Fullscreen", table_cell_style),
            Paragraph("Locked Candidate Kiosk", table_cell_style),
            Paragraph("Anti-cheat candidate terminal blocking copy/paste, right-click, F12, tab switching, and streaming 5s heartbeat pings.", table_cell_style)
        ],
        [
            Paragraph("<code>src/VerificationTerminal.jsx</code>", table_cell_bold),
            Paragraph("React 19, WebRTC Webcam API", table_cell_style),
            Paragraph("Biometric Entrance Portal", table_cell_style),
            Paragraph("Captures hall entrance candidate facial snapshots, computes facial match confidence scores, and issues clearance tokens.", table_cell_style)
        ],
        [
            Paragraph("<code>src/ExamDashboard.jsx</code>", table_cell_bold),
            Paragraph("React 19, Vanilla CSS", table_cell_style),
            Paragraph("Master Command Hub", table_cell_style),
            Paragraph("Central navigation dashboard containing the live <b>Blockchain Audit Ledger</b> tab, AI agent scheduler, and audit stream.", table_cell_style)
        ]
    ]

    mapping_table = Table(table_data, colWidths=[120, 95, 105, 220])
    mapping_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_light]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(mapping_table)
    story.append(Spacer(1, 10))

    # Section 4: End-to-End Step-by-Step Execution Workflow
    story.append(Paragraph("4. Step-by-Step Security Workflow (How Everything Works Together)", section_heading))
    
    workflow_steps = [
        ("Step 1: Paper Upload & 2-Stage Double Encryption (Admin Terminal)",
         "The Exam Controller uploads a question paper (PDF or Pagewise Images). The backend generates <b>Key A (Admin Token)</b> and <b>Key B (Supervisor PIN)</b>. "
         "It performs 2-stage double encryption. Next, it computes the paper's SHA-256 digest and anchors it on the <b>Blockchain Ledger</b>, issuing a `0x...` transaction receipt."),

        ("Step 2: Candidate Biometric Verification (Verification Terminal)",
         "At the examination venue entrance, the candidate presents their roll number. The webcam captures a live facial snapshot, calculates a match confidence score, "
         "and issues a single-use entrance clearance token (`PASS-ROLL-TIMESTAMP`)."),

        ("Step 3: Dual-Key Unlocking & On-Chain Pre-Check (Supervisor Terminal)",
         "At the scheduled time, the Supervisor clicks <b>⚡ Run On-Chain Pre-Check</b> to verify that local file hashes match the immutable blockchain record. "
         "Then, both Key A and Key B are entered simultaneously to reconstruct the decryption keys and unlock the exam."),

        ("Step 4: Locked Student Kiosk Execution (Student Terminal)",
         "Candidates log into their kiosk. Browser restrictions enforce fullscreen lockdown (disabling context menus, Ctrl+C/V, print screen, and F12). "
         "Every 5 seconds, a heartbeat ping streams to `/api/student/heartbeat`. Any tab switch triggers an instant `FOCUS_LOSS` violation alert.")
    ]

    for step_title, step_desc in workflow_steps:
        story.append(Paragraph(f"<b>{step_title}</b>", body_style))
        story.append(Paragraph(step_desc, body_style))
        story.append(Spacer(1, 3))

    # Footer
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=border_color, spaceAfter=8))
    story.append(Paragraph(
        "CONFIDENTIAL & INTERNAL DOCUMENTATION — Secure-EMS Technology Guide | Generated for Technical Training",
        ParagraphStyle('Footer', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=7.5, textColor=colors.HexColor("#64748b"), alignment=1)
    ))

    doc.build(story)
    print(f"PDF successfully generated: {filename}")

if __name__ == "__main__":
    generate_pdf()
