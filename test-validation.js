// Test the validation endpoint
const testCode = process.argv[2] || 'BP-DC102K';

console.log(`Testing validation for code: "${testCode}"\n`);

fetch('http://localhost:3000/api/validate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: testCode })
})
    .then(res => res.json())
    .then(result => {
        console.log('Response:', result);
        if (result.valid) {
            console.log('✅ Code is marked as VALID');
        } else {
            console.log('❌ Code is marked as INVALID');
        }
    })
    .catch(err => {
        console.error('Error:', err.message);
    });
