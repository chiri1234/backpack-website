const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./backpack.db');
const fs = require('fs');

console.log('=== Checking Database ===\n');

// Check if referral code exists
const code = process.argv[2] || 'BP-DC102K';
let output = '';

db.get("SELECT * FROM locals WHERE referral_code = ?", [code], (err, row) => {
    if (err) {
        output += 'Error: ' + err + '\n';
        console.error('Error:', err);
    } else if (row) {
        output += `✅ Referral code "${code}" EXISTS in database:\n`;
        output += JSON.stringify(row, null, 2) + '\n';
        console.log(`✅ Referral code "${code}" EXISTS`);
        console.log(row);
    } else {
        output += `❌ Referral code "${code}" NOT FOUND in database\n`;
        console.log(`❌ Referral code "${code}" NOT FOUND`);
    }

    // Show all locals
    output += '\n=== All Locals in Database ===\n';
    console.log('\n=== All Locals ===');

    db.all("SELECT * FROM locals ORDER BY created_at DESC LIMIT 10", [], (err, rows) => {
        if (err) {
            output += 'Error: ' + err + '\n';
            console.error('Error:', err);
        } else {
            output += `Total: ${rows.length} locals\n`;
            console.log(`Total: ${rows.length}`);
            rows.forEach(r => {
                output += `- ${r.name} (${r.phone}): ${r.referral_code}\n`;
                console.log(`- ${r.name}: ${r.referral_code}`);
            });
        }

        // Write to file
        fs.writeFileSync('db-check-result.txt', output);
        console.log('\n✅ Results written to db-check-result.txt');
        db.close();
    });
});
