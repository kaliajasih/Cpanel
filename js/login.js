document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');

    let loginAttempts = 0;
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

    // Check if user is locked out
    const lockoutEnd = localStorage.getItem('lockoutEnd');
    if (lockoutEnd && Date.now() < parseInt(lockoutEnd)) {
        const remainingTime = Math.ceil((parseInt(lockoutEnd) - Date.now()) / 60000);
        showError(`Terlalu banyak percubaan. Sila cuba lagi dalam ${remainingTime} minit.`);
        loginBtn.disabled = true;
        return;
    }

    // Form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Check lockout
        const lockoutEnd = localStorage.getItem('lockoutEnd');
        if (lockoutEnd && Date.now() < parseInt(lockoutEnd)) {
            return;
        }

        const telegramId = document.getElementById('telegramId').value.trim();
        const remember = document.getElementById('remember').checked;

        // Input validation
        if (!telegramId) {
            showError('Sila masukkan ID Telegram anda');
            return;
        }

        if (!/^\d+$/.test(telegramId)) {
            showError('ID Telegram hanya boleh mengandungi nombor');
            return;
        }

        if (telegramId.length < 6 || telegramId.length > 15) {
            showError('ID Telegram tidak sah');
            return;
        }

        loginBtn.classList.add('loading');
        hideError();

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    telegramId: telegramId,
                    remember: remember
                }),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Reset login attempts
                loginAttempts = 0;
                localStorage.removeItem('lockoutEnd');
                
                // Store session info if remember me
                if (remember) {
                    localStorage.setItem('rememberMe', 'true');
                }
                
                // Redirect to dashboard
                window.location.href = '/dashboard.html';
            } else {
                loginAttempts++;
                
                if (loginAttempts >= MAX_ATTEMPTS) {
                    const lockoutEndTime = Date.now() + LOCKOUT_TIME;
                    localStorage.setItem('lockoutEnd', lockoutEndTime.toString());
                    showError('Terlalu banyak percubaan gagal. Akaun dikunci selama 15 minit.');
                    loginBtn.disabled = true;
                } else {
                    const remainingAttempts = MAX_ATTEMPTS - loginAttempts;
                    showError(data.message || `ID Telegram tidak sah. ${remainingAttempts} percubaan lagi.`);
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Ralat sambungan. Sila cuba lagi.');
        } finally {
            loginBtn.classList.remove('loading');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorAlert.style.display = 'flex';
    }

    function hideError() {
        errorAlert.style.display = 'none';
    }

    // Clear lockout if expired
    setInterval(() => {
        const lockoutEnd = localStorage.getItem('lockoutEnd');
        if (lockoutEnd && Date.now() >= parseInt(lockoutEnd)) {
            localStorage.removeItem('lockoutEnd');
            loginBtn.disabled = false;
            hideError();
        }
    }, 1000);
});

function showHelp() {
    alert('📱 Cara dapatkan ID Telegram:\n\n1. Buka bot Telegram\n2. Ketik command: /cekakses\n3. Bot akan tunjukkan ID Telegram anda\n4. Copy ID tersebut dan login di sini\n\n💡 Atau hubungi admin untuk bantuan');
}
