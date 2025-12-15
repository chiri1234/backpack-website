document.addEventListener('DOMContentLoaded', () => {
    // --- Shared: Navigation Logic ---

    // Smooth scrolling for anchor links (Only on index page)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#') && targetId.length > 1) {
                // Check if we are on index page or need to redirect
                if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/' && window.location.pathname !== '') {
                    // Let default link behavior happen to go to home page anchor
                    return;
                }

                e.preventDefault();
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // Mobile Navigation Toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // --- Page Specific Logic ---

    // 1. Local Renewal Page Logic
    const localForm = document.getElementById('localForm');
    if (localForm) {
        // Pincode validation
        const pincodeInput = document.getElementById('pincode');
        if (pincodeInput) {
            pincodeInput.addEventListener('input', (e) => {
                const pincode = e.target.value;

                // Remove existing validation message
                const existingMsg = pincodeInput.parentNode.querySelector('.pincode-validation-msg');
                if (existingMsg) existingMsg.remove();

                // Only validate if 6 digits entered
                if (pincode.length === 6) {
                    const pincodeNum = parseInt(pincode);
                    const isValidBangalore =
                        (pincodeNum >= 560001 && pincodeNum <= 560300) || // Primary Bangalore range
                        (pincodeNum >= 561000 && pincodeNum <= 561999) || // Extended range 1
                        (pincodeNum >= 562000 && pincodeNum <= 562999);   // Extended range 2

                    const msg = document.createElement('small');
                    msg.classList.add('pincode-validation-msg');
                    msg.style.display = 'block';
                    msg.style.marginTop = '5px';

                    if (isValidBangalore) {
                        msg.innerText = "✅ Valid Bangalore pincode";
                        msg.style.color = "green";
                    } else {
                        msg.innerText = "❌ Invalid Bangalore pincode";
                        msg.style.color = "red";
                    }
                    pincodeInput.parentNode.appendChild(msg);
                }
            });
        }

        localForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = localForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Generating...';
            btn.disabled = true;

            const data = {
                name: document.getElementById('name').value,
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value,
                pincode: document.getElementById('pincode').value
            };

            try {
                const res = await fetch('/api/locals/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();

                if (result.success) {
                    localForm.classList.add('hidden');
                    document.getElementById('resultArea').classList.remove('hidden');
                    document.getElementById('generatedCode').innerText = result.referral_code;

                    // Setup WhatsApp Share
                    const msg = `Use my referral code ${result.referral_code} to get Backpack discounts when you visit Bangalore.`;
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                    document.getElementById('whatsappBtn').onclick = () => window.open(whatsappUrl, '_blank');

                    // Copy functionality
                    document.getElementById('copyBtn').onclick = () => {
                        navigator.clipboard.writeText(result.referral_code);
                        alert('Code copied!');
                    };
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Something went wrong. Please try again.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // 2. Visitor Upload Page Logic
    const visitorForm = document.getElementById('visitorForm');
    if (visitorForm) {
        // File input label update
        const fileInput = document.getElementById('ticketFile');
        fileInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || "Choose File...";
            e.target.nextElementSibling.innerText = fileName;
        });

        // Referral Code Validation
        const referralInput = document.getElementById('referralCode');
        const submitBtn = visitorForm.querySelector('button');

        referralInput.addEventListener('blur', async () => {
            const code = referralInput.value.trim().toUpperCase();
            if (code.length < 3) return; // Wait for at least some input

            try {
                const res = await fetch('/api/validate-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: code })
                });
                const result = await res.json();

                // Clear previous messages if any
                const existingMsg = referralInput.parentNode.querySelector('.validation-msg');
                if (existingMsg) existingMsg.remove();

                const msg = document.createElement('small');
                msg.classList.add('validation-msg');
                msg.style.display = 'block';
                msg.style.marginTop = '5px';

                if (result.valid) {
                    msg.innerText = "✅ Valid Code";
                    msg.style.color = "green";
                    submitBtn.disabled = false;
                } else {
                    msg.innerText = "❌ Invalid Code";
                    msg.style.color = "red";
                    // Optional: Disable submit or just warn
                    // submitBtn.disabled = true; 
                }
                referralInput.parentNode.appendChild(msg);

            } catch (err) {
                console.error("Validation error", err);
            }
        });

        visitorForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = visitorForm.querySelector('button');
            btn.innerText = 'Uploading...';
            btn.disabled = true;

            const formData = new FormData(visitorForm);

            try {
                const res = await fetch('/api/visitors/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();

                if (result.success) {
                    visitorForm.classList.add('hidden');
                    document.getElementById('successMessage').classList.remove('hidden');
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Failed to upload ticket. Server might be down.');
            } finally {
                btn.innerText = 'Submit for Verification';
                btn.disabled = false;
            }
        });
    }

    // 3. Admin Dashboard Logic
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        // Login Logic
        const triggerLogin = async () => {
            const user = document.getElementById('adminUser').value;
            const pass = document.getElementById('adminPass').value;

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: pass })
                });
                const result = await res.json();

                if (result.success) {
                    loginOverlay.classList.add('hidden');
                    document.getElementById('adminDashboard').classList.remove('hidden');
                    loadDashboardData();
                    loadLocalsData();
                } else {
                    document.getElementById('loginError').classList.remove('hidden');
                }
            } catch (err) {
                console.error(err);
            }
        };

        document.getElementById('adminLoginBtn').addEventListener('click', triggerLogin);

        // Enter Key Support
        ['adminUser', 'adminPass'].forEach(id => {
            document.getElementById(id).addEventListener('keypress', (e) => {
                if (e.key === 'Enter') triggerLogin();
            });
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.location.reload();
        });

        // Tabs Logic
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Hide all contents
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                // Show target
                const targetId = tab.getAttribute('data-tab') + 'Tab';
                document.getElementById(targetId).classList.remove('hidden');
            });
        });
    }

    // Load Admin Data (Visitors)
    async function loadDashboardData() {
        try {
            const res = await fetch('/api/admin/verifications');
            const data = await res.json();
            const tbody = document.getElementById('verificationTableBody');
            tbody.innerHTML = '';

            data.forEach(row => {
                const tr = document.createElement('tr');

                const statusBadge = `<span class="badge badge-${row.verification_status}">${row.verification_status}</span>`;

                let actions = '-';
                if (row.verification_status === 'pending') {
                    // Use data attributes for safety
                    const cleanName = row.name.replace(/"/g, '&quot;');
                    const cleanPhone = row.phone.replace(/"/g, '&quot;');

                    actions = `
                        <button class="btn-approve verify-btn" 
                            data-id="${row.id}" 
                            data-action="approve" 
                            data-name="${cleanName}" 
                            data-phone="${cleanPhone}">Approve</button>
                        <button class="btn-reject verify-btn" 
                            data-id="${row.id}" 
                            data-action="reject">Reject</button>
                    `;
                } else if (row.verification_status === 'approved') {
                    // Add WhatsApp Message button for approved users
                    let phone = row.phone.replace(/\D/g, '');
                    if (phone.length === 10) phone = '91' + phone;
                    const msg = `Hello ${row.name}, your Backpack verification is successful! Enjoy Bangalore!`;
                    const waLink = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
                    actions = `<a href="${waLink}" target="_blank" class="btn-approve" style="text-decoration:none;">📱 Message</a>`;
                }

                // Calculate travel date validity (±7 days from today)
                const travelDate = new Date(row.travel_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate day comparison
                travelDate.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((travelDate - today) / (1000 * 60 * 60 * 24));
                const isValidWindow = Math.abs(diffDays) <= 7;

                // Create date display with indicator
                let dateDisplay = row.travel_date;
                if (isValidWindow) {
                    dateDisplay = `<span class="date-valid">🟢 ${row.travel_date}</span>`;
                } else {
                    dateDisplay = `<span class="date-invalid">🔴 ${row.travel_date}</span><br><small style="color: #d32f2f;">(${diffDays > 0 ? '+' : ''}${diffDays} days)</small>`;
                }

                tr.innerHTML = `
                    <td>
                        <strong>${row.name}</strong><br>
                        <small>${row.phone}</small>
                    </td>
                    <td>${row.referral_code_used || 'N/A'}</td>
                    <td>${row.origin_city}</td>
                    <td>${dateDisplay}</td>
                    <td><a href="/uploads/${row.ticket_filename}" target="_blank" style="text-decoration:underline; color:blue;">View Ticket</a></td>
                    <td>${statusBadge}</td>
                    <td>${actions}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to load admin data', err);
        }
    }

    // --- Helper Functions ---

    // Verification Logic (Hoisted)
    async function verifyAction(id, action, name = '', phone = '') {
        if (!confirm(`Are you sure you want to ${action} this request?`)) return;

        // Open window immediately to bypass popup blocker (for approve action)
        let waWindow = null;
        if (action === 'approve' && phone) {
            waWindow = window.open('', '_blank');
            if (waWindow) {
                waWindow.document.write('Loading WhatsApp...');
            }
        }

        try {
            const res = await fetch('/api/admin/verify-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitorId: id, action: action })
            });
            const result = await res.json();
            if (result.success) {
                alert(result.visitor_msg || result.msg || `Visitor ${action}d!`);

                // WhatsApp Automation on Approve
                if (action === 'approve' && phone && waWindow) {
                    let cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits

                    // Logic: If phone is 10 digits (e.g. 9876543210), assume India (+91)
                    if (cleanPhone.length === 10) {
                        cleanPhone = '91' + cleanPhone;
                    }

                    const message = `Hello ${name}, your Backpack verification is successful! Here is your discount code. Enjoy Bangalore!`;
                    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

                    // Force location update
                    waWindow.location.assign(whatsappUrl);
                } else if (waWindow) {
                    waWindow.close(); // Close if logic falls through (unlikely)
                }

                loadDashboardData(); // Refresh table
            } else {
                alert('Error: ' + result.error);
                if (waWindow) waWindow.close(); // Close on error
            }
        } catch (err) {
            console.error(err);
            if (waWindow) waWindow.close(); // Close on network error
        }
    }

    // --- Event Listeners ---

    // Event Delegation for Verification Buttons
    const tableBody = document.getElementById('verificationTableBody');
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.verify-btn');
            if (!btn) return;

            const id = btn.dataset.id;
            const action = btn.dataset.action;
            const name = btn.dataset.name || '';
            const phone = btn.dataset.phone || '';

            verifyAction(id, action, name, phone);
        });
    }

    // Load Locals Data
    async function loadLocalsData() {
        try {
            const res = await fetch('/api/admin/locals');
            const data = await res.json();
            const tbody = document.getElementById('localsTableBody');
            tbody.innerHTML = '';

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.name}</td>
                    <td>${row.phone}</td>
                    <td>${row.email}</td>
                    <td>${row.pincode || 'N/A'}</td>
                    <td><strong>${row.referral_code}</strong></td>
                    <td>${new Date(row.created_at).toLocaleDateString()}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to load locals data', err);
        }
    }

    // Expose for debugging if needed
    window.verifyAction = verifyAction;
});
