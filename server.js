const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists BEFORE using it
// Use /data volume (same as database) for persistence on Railway
const uploadDir = process.env.UPLOAD_DIR || (process.env.DB_PATH ? '/data/uploads' : './uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware to redirect non-www to www for SEO consistency
app.use((req, res, next) => {
    const host = req.get('host');

    // In production, redirect backpack.city to www.backpack.city
    if (host === 'backpack.city') {
        return res.redirect(301, `https://www.backpack.city${req.url}`);
    }

    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory
app.use('/uploads', express.static(uploadDir)); // Serve uploads from persistent volume

// Clean URL Routes
app.get('/visitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'visitor.html'));
});

app.get('/local-referral', (req, res) => {
    res.sendFile(path.join(__dirname, 'local-referral.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms.html'));
});

// 1. Diagnostics & Health
const startTime = new Date().toISOString();
let requestLogs = [];
function addLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(entry);
    requestLogs.push(entry);
    if (requestLogs.length > 100) requestLogs.shift(); // Keep last 100
}

// Diagnostic endpoint
app.get('/api/health', (req, res) => {
    addLog("Health check requested");
    // Check DB
    db.get("SELECT count(*) as count FROM locals", (err, row) => {
        const dbStatus = err ? `Error: ${err.message}` : `OK (${row ? row.count : 0} locals)`;

        // Check Disk Write
        let diskStatus = 'Checking...';
        try {
            const testFile = path.join(uploadDir, `test-${Date.now()}.txt`);
            fs.writeFileSync(testFile, 'write-test');
            fs.unlinkSync(testFile);
            diskStatus = 'Writable';
        } catch (e) {
            diskStatus = `Not Writable: ${e.message}`;
        }

        res.json({
            status: 'Online',
            startTime,
            timestamp: new Date().toISOString(),
            checks: {
                database: dbStatus,
                uploadDir: uploadDir,
                diskWrite: diskStatus
            },
            logs: requestLogs.slice(-10) // Send last 10 logs
        });
    });
});

// Mock upload to test DB/Disk without Multer
app.get('/api/debug/test-db-write', (req, res) => {
    addLog("DEBUG: Starting test DB write...");
    const testCode = 'BP-DEBUG-' + Math.floor(Math.random() * 1000);
    const stmt = db.prepare("INSERT INTO locals (name, phone, email, pincode, referral_code) VALUES (?, ?, ?, ?, ?)");
    stmt.run(['Test User', '0000', 'test@test.com', '000', testCode], function (err) {
        if (err) {
            addLog(`DEBUG ERROR: DB Write failed: ${err.message}`);
            return res.status(500).json({ success: false, error: err.message });
        }
        addLog(`DEBUG: DB Write success, ID: ${this.lastID}`);
        // Cleanup
        db.run("DELETE FROM locals WHERE id = ?", [this.lastID]);
        res.json({ success: true, message: "DB Write is fast", code: testCode });
    });
    stmt.finalize();
});

// Database Setup
const dbPath = process.env.DB_PATH || './backpack.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        db.serialize(() => {
            // Locals Table
            db.run(`CREATE TABLE IF NOT EXISTS locals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                phone TEXT,
                email TEXT,
                pincode TEXT,
                referral_code TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Visitors Table
            db.run(`CREATE TABLE IF NOT EXISTS visitors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                phone TEXT,
                email TEXT,
                referral_code_used TEXT,
                origin_city TEXT,
                travel_date TEXT,
                return_date TEXT,
                ticket_filename TEXT,
                verification_status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Initial Admin User (Mock auth for MVP, or just hardcoded in route)
        });
    }
});

// Multer Setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        // Sanitize filename and prepend timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Routes

// 1. Locals: Register & Generate Referral Code
app.post('/api/locals/register', (req, res) => {
    const { name, phone, email, pincode } = req.body;

    // Validate pincode for Bangalore
    if (!pincode || !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ success: false, error: 'Invalid pincode format. Must be 6 digits.' });
    }

    const pincodeNum = parseInt(pincode);
    const isValidBangalore =
        (pincodeNum >= 560001 && pincodeNum <= 560300) || // Primary Bangalore range
        (pincodeNum >= 561000 && pincodeNum <= 561999) || // Extended range 1
        (pincodeNum >= 562000 && pincodeNum <= 562999);   // Extended range 2

    if (!isValidBangalore) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Bangalore pincode. Must be in range 560001-560300, 561xxx, or 562xxx.'
        });
    }

    // Simple code generation: BP-RANDOM
    const code = 'BP-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const stmt = db.prepare("INSERT INTO locals (name, phone, email, pincode, referral_code) VALUES (?, ?, ?, ?, ?)");
    stmt.run([name, phone, email, pincode, code], function (err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({
            success: true,
            referral_code: code
        });
    });
    stmt.finalize();
});

// 2. Visitors: Upload Ticket
app.post('/api/visitors/upload', (req, res, next) => {
    addLog("POST /api/visitors/upload: Request received");

    // Manual timeout for the upload stream
    const uploadTimeout = setTimeout(() => {
        addLog("POST /api/visitors/upload: Multer processing TIMEOUT reached (10s)");
    }, 10000);

    // Wrap multer in a standard middleware to catch upstream errors (like disk full, limits)
    upload.single('ticketFile')(req, res, (err) => {
        clearTimeout(uploadTimeout);
        if (err) {
            addLog(`POST /api/visitors/upload: Multer error: ${err.message}`);
            return res.status(400).json({ success: false, error: `Upload failed: ${err.message}` });
        }
        addLog("POST /api/visitors/upload: Multer finished parsing");
        next();
    });
}, (req, res) => {
    // If we're here, Multer succeeded (or failed silently but next() was called)
    // visitorForm uses FormData with these field names:
    // name, phone, email, referralCode, originCity, travelDate, returnDate (optional)
    const { name, phone, email, referralCode, originCity, travelDate, returnDate } = req.body;
    addLog(`POST /api/visitors/upload: Validating code ${referralCode} for ${name}`);

    if (!req.file) {
        addLog("POST /api/visitors/upload: No file in request");
        return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    const filename = req.file.filename;

    // Validate required fields
    if (!name || !phone || !email || !referralCode || !originCity || !travelDate) {
        addLog("POST /api/visitors/upload: Validation failed (missing fields)");
        // Clean up uploaded file
        fs.unlink(path.join(uploadDir, filename), (err) => {
            if (err) console.error("Error deleting file:", err);
        });
        return res.status(400).json({
            success: false,
            error: 'Missing fields.'
        });
    }

    // VALIDATION: Check if referral code exists in locals table
    db.get("SELECT id FROM locals WHERE referral_code = ?", [referralCode], (err, row) => {
        if (err) {
            addLog(`POST /api/visitors/upload: DB error during validation: ${err.message}`);
            return res.status(500).json({ success: false, error: "DB Error" });
        }

        if (!row) {
            addLog(`POST /api/visitors/upload: Invalid code result for ${referralCode}`);
            // Invalid code: Delete the uploaded file to save space and return error
            fs.unlink(path.join(uploadDir, filename), (err) => {
                if (err) console.error("Error deleting file:", err);
            });
            return res.status(400).json({
                success: false,
                error: "Invalid code"
            });
        }

        addLog("POST /api/visitors/upload: Code valid, inserting visitor...");
        // Code matches, proceed to save visitor
        const stmt = db.prepare(`INSERT INTO visitors 
            (name, phone, email, referral_code_used, origin_city, travel_date, return_date, ticket_filename) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

        stmt.run([name, phone, email, referralCode, originCity, travelDate, returnDate || null, filename], function (err) {
            if (err) {
                addLog(`POST /api/visitors/upload: DB insertion error: ${err.message}`);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            addLog(`POST /api/visitors/upload: Success! ID: ${this.lastID}`);
            res.json({
                success: true,
                message: 'Ticket uploaded successfully'
            });
        });
        stmt.finalize();
    });
});

// 3. Admin: Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt - User: ${username}, Pass: ${password}`); // DEBUG LOG

    // Hardcoded credentials for MVP
    if (username === 'admin' && password === 'admin123') {
        console.log('Login Success'); // DEBUG LOG
        res.json({ success: true });
    } else {
        console.log('Login Failed'); // DEBUG LOG
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// 4. Admin: Get Verifications
app.get('/api/admin/verifications', (req, res) => {
    db.all("SELECT * FROM visitors ORDER BY created_at DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 5. Admin: Get Locals
app.get('/api/admin/locals', (req, res) => {
    db.all("SELECT * FROM locals ORDER BY created_at DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 6. Common: Validate Referral Code
app.post('/api/validate-code', (req, res) => {
    const { code } = req.body;
    db.get("SELECT * FROM locals WHERE referral_code = ?", [code], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    });
});

// 7. Admin: Verify Action
app.post('/api/admin/verify-action', (req, res) => {
    const { visitorId, action } = req.body; // action: 'approve' or 'reject'
    const status = action === 'approve' ? 'approved' : 'rejected';

    db.run("UPDATE visitors SET verification_status = ? WHERE id = ?", [status, visitorId], function (err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({
            success: true,
            visitor_msg: `Visitor with ID ${visitorId} was ${status}.`
        });
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled app error:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error (Logged)' });
});

// Process-level error handlers to prevent crashes
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
    // In production, you might want to exit, but for debugging we'll keep it alive if possible or let Railway restart it
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Uploads directory: ${uploadDir}`);
    console.log(`Database path: ${dbPath}`);
});
