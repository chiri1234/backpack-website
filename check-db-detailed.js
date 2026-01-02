const sqlite3 = require('sqlite3').verbose();
const dbPath = process.env.DB_PATH || './backpack.db';
const db = new sqlite3.Database(dbPath);

console.log(`\n=== Database Path: ${dbPath} ===\n`);

const searchCode = 'BP-DC102K';

// 1. Exact match
console.log(`1. Searching for EXACT match: "${searchCode}"`);
db.get("SELECT * FROM locals WHERE referral_code = ?", [searchCode], (err, row) => {
    if (err) {
        console.error('   Error:', err);
    } else if (row) {
        console.log('   ✅ FOUND exact match:', row);
    } else {
        console.log('   ❌ NOT FOUND with exact match');
    }

    // 2. Case-insensitive search
    console.log(`\n2. Searching for CASE-INSENSITIVE match:`);
    db.get("SELECT * FROM locals WHERE UPPER(referral_code) = UPPER(?)", [searchCode], (err, row) => {
        if (err) {
            console.error('   Error:', err);
        } else if (row) {
            console.log('   ✅ FOUND (case-insensitive):', row);
        } else {
            console.log('   ❌ NOT FOUND (case-insensitive)');
        }

        // 3. Partial match (contains)
        console.log(`\n3. Searching for codes containing "DC102":`);
        db.all("SELECT * FROM locals WHERE referral_code LIKE '%DC102%'", [], (err, rows) => {
            if (err) {
                console.error('   Error:', err);
            } else if (rows.length > 0) {
                console.log(`   ✅ FOUND ${rows.length} similar code(s):`);
                rows.forEach(r => console.log(`      - ${r.referral_code}: ${r.name} (${r.phone})`));
            } else {
                console.log('   ❌ No similar codes found');
            }

            // 4. Show ALL locals
            console.log(`\n4. ALL Referral Codes in Database:`);
            db.all("SELECT id, name, phone, referral_code, created_at FROM locals ORDER BY id DESC", [], (err, rows) => {
                if (err) {
                    console.error('   Error:', err);
                } else {
                    console.log(`   Total: ${rows.length} entries`);
                    rows.forEach((r, i) => {
                        console.log(`   ${i + 1}. ${r.referral_code} - ${r.name} (${r.phone}) [ID: ${r.id}]`);
                    });
                }

                // 5. Check visitors table to see if code was used
                console.log(`\n5. Checking if "${searchCode}" was USED by any visitor:`);
                db.all("SELECT * FROM visitors WHERE referral_code_used = ?", [searchCode], (err, visitors) => {
                    if (err) {
                        console.error('   Error:', err);
                    } else if (visitors.length > 0) {
                        console.log(`   ✅ Code was USED by ${visitors.length} visitor(s):`);
                        visitors.forEach(v => console.log(`      - ${v.name} (${v.email})`));
                    } else {
                        console.log('   ℹ️  Code has NOT been used yet');
                    }

                    db.close();
                    console.log('\n=== Check Complete ===\n');
                });
            });
        });
    });
});
