const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists BEFORE using it
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Explicitly serve uploads

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

// Diagnostic endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        version: '1.0.2',
        uploadsConfigured: true,
        uploadsDirExists: fs.existsSync(uploadDir),
        timestamp: new Date().toISOString()
    });
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
        cb(null, 'uploads/')
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
app.post('/api/visitors/upload', upload.single('ticketFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // visitorForm uses FormData with these field names:
    // name, phone, email, referralCode, originCity, travelDate
    const { name, phone, email, referralCode, originCity, travelDate } = req.body;
    const filename = req.file.filename;

    // VALIDATION: Check if referral code exists in locals table
    db.get("SELECT id FROM locals WHERE referral_code = ?", [referralCode], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: "Database error" });
        }

        if (!row) {
            // Invalid code: Delete the uploaded file to save space and return error
            fs.unlink(path.join(uploadDir, filename), (err) => {
                if (err) console.error("Error deleting file:", err);
            });
            return res.status(400).json({ success: false, error: "Invalid referral code. Please ask your friend for a valid code." });
        }

        // Code matches, proceed to save visitor
        const stmt = db.prepare(`INSERT INTO visitors 
            (name, phone, email, referral_code_used, origin_city, travel_date, ticket_filename) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`);

        stmt.run([name, phone, email, referralCode, originCity, travelDate, filename], function (err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
