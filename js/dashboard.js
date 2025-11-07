// Dashboard JavaScript
let currentPage = 'overview';
let userData = null;
let csrfToken = null;

document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    await checkAuth();
    
    // Load initial page
    loadPage('overview');
    
    // Setup event listeners
    setupNavigation();
    setupMobile();
    setupModal();
    setupLogout();
});

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/login.html';
            return;
        }
        
        userData = await response.json();
        
        // Get CSRF token
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        const csrfData = await csrfResponse.json();
        csrfToken = csrfData.csrfToken;
        
        updateUserInfo();
        updateNavigationByRole();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

function updateUserInfo() {
    if (userData) {
        document.getElementById('userName').textContent = `ID: ${userData.userId}`;
        
        // Set role with badge
        const tierBadges = {
            'CEO': '👑 CEO',
            'TK': '⭐ TK',
            'PT': '🏆 PT',
            'OWN': '💎 OWN',
            'ADP': '🎗️ ADP',
            'RESELLER': '🔰 RESELLER'
        };
        
        const tierDisplay = tierBadges[userData.tier] || '👤 Member';
        document.getElementById('userRole').textContent = tierDisplay;
    }
}

function updateNavigationByRole() {
    if (!userData) return;
    
    const tier = userData.tier;
    const isOwner = userData.isOwner;
    
    // Hide/show navigation items based on role
    const navItems = document.querySelectorAll('.nav-item');
    
    const validTiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    
    navItems.forEach(item => {
        const page = item.dataset.page;
        
        // Owner can see everything
        if (isOwner) {
            item.style.display = 'flex';
            return;
        }
        
        // Role-based access
        switch(page) {
            case 'tiers':
            case 'settings':
                // Only owner
                item.style.display = 'none';
                break;
                
            case 'users':
                // Owner or tier >= OWN
                item.style.display = ['CEO', 'TK', 'PT', 'OWN'].includes(tier) ? 'flex' : 'none';
                break;
                
            case 'create-panel':
                // Only users with valid tier (RESELLER or above)
                item.style.display = validTiers.includes(tier) ? 'flex' : 'none';
                break;
                
            default:
                // Overview and Servers - everyone can see
                item.style.display = 'flex';
        }
    });
}

function hasPermission(requiredTier) {
    if (!userData) return false;
    if (userData.isOwner) return true;
    
    const tierHierarchy = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    const userTierIndex = tierHierarchy.indexOf(userData.tier);
    const requiredTierIndex = tierHierarchy.indexOf(requiredTier);
    
    return userTierIndex >= requiredTierIndex;
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.dataset.page;
            
            // Check if item is hidden (no permission)
            if (this.style.display === 'none') {
                showNotification('Anda tiada akses ke halaman ini', 'error');
                return;
            }
            
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            loadPage(page);
        });
    });
}

function setupMobile() {
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.getElementById('sidebar');
    
    mobileToggle.addEventListener('click', function() {
        sidebar.classList.toggle('active');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });
}

function setupModal() {
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modalClose');
    
    modalClose.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        if (confirm('Adakah anda pasti mahu logout?')) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    }
                });
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Logout error:', error);
                window.location.href = '/login.html';
            }
        }
    });
}

async function loadPage(page) {
    currentPage = page;
    const content = document.getElementById('mainContent');
    const pageTitle = document.getElementById('pageTitle');
    
    const titles = {
        'overview': 'Overview',
        'create-panel': 'Create Panel',
        'servers': 'Servers',
        'users': 'Users',
        'tiers': 'Tier System',
        'settings': 'Settings'
    };
    
    pageTitle.textContent = titles[page] || 'Dashboard';
    
    switch(page) {
        case 'overview':
            await loadOverview(content);
            break;
        case 'create-panel':
            loadCreatePanel(content);
            break;
        case 'servers':
            await loadServers(content);
            break;
        case 'users':
            await loadUsers(content);
            break;
        case 'tiers':
            await loadTiers(content);
            break;
        case 'settings':
            loadSettings(content);
            break;
    }
}

async function loadOverview(content) {
    try {
        const stats = await apiRequest('/api/dashboard/stats');
        
        const tierColors = {
            'CEO': 'red',
            'TK': 'yellow',
            'PT': 'blue',
            'OWN': 'green',
            'ADP': 'blue',
            'RESELLER': 'green'
        };
        
        const tierColor = tierColors[userData.tier] || 'blue';
        
        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon blue">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <div class="stat-value">${stats.servers || 0}</div>
                        <div class="stat-label">Total Servers</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon green">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <div class="stat-value">${stats.users || 0}</div>
                        <div class="stat-label">Total Users</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon yellow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <div class="stat-value">${userData.access?.length || 0}</div>
                        <div class="stat-label">Your Access</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon ${tierColor}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </div>
                    <div class="stat-details">
                        <div class="stat-value" style="font-size: 20px;">${userData.tier || 'Member'}</div>
                        <div class="stat-label">Your Tier</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🎯 Quick Actions</h3>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    ${['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'].includes(userData.tier) ? '<button class="btn btn-primary" onclick="loadPage(\'create-panel\')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>Create Panel</button>' : ''}
                    <button class="btn btn-secondary" onclick="loadPage('servers')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        </svg>
                        View Servers
                    </button>
                    ${hasPermission('OWN') ? '<button class="btn btn-secondary" onclick="loadPage(\'users\')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path></svg>Manage Users</button>' : ''}
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">👤 Your Information</h3>
                </div>
                <div style="display: grid; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; padding: 12px; background: var(--off-white); border-radius: 10px;">
                        <span style="color: var(--text-light); font-weight: 500;">Telegram ID:</span>
                        <span style="font-weight: 600; color: var(--text-dark);">${userData.userId}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 12px; background: var(--off-white); border-radius: 10px;">
                        <span style="color: var(--text-light); font-weight: 500;">Tier:</span>
                        <span class="badge badge-${tierColor === 'red' ? 'error' : tierColor === 'yellow' ? 'warning' : 'success'}">${userData.tier || 'Member'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 12px; background: var(--off-white); border-radius: 10px;">
                        <span style="color: var(--text-light); font-weight: 500;">Server Access:</span>
                        <span style="font-weight: 600; color: var(--text-dark);">${userData.access?.join(', ').toUpperCase() || 'None'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 12px; background: var(--off-white); border-radius: 10px;">
                        <span style="color: var(--text-light); font-weight: 500;">Owner Status:</span>
                        <span style="font-weight: 600; color: ${userData.isOwner ? 'var(--success)' : 'var(--text-light)'};">${userData.isOwner ? '✅ Yes' : '❌ No'}</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="card"><p style="color: var(--error);">Error loading overview: ${error.message}</p></div>`;
    }
}

function loadCreatePanel(content) {
    const validTiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    
    if (!validTiers.includes(userData.tier)) {
        content.innerHTML = '<div class="card"><p style="color: var(--error);">❌ Anda perlu tier (RESELLER atau lebih tinggi) untuk membuat panel. Hubungi admin.</p></div>';
        return;
    }
    
    const availableServers = userData.access || [];
    
    if (availableServers.length === 0) {
        content.innerHTML = '<div class="card"><p style="color: var(--error);">❌ Anda tiada akses ke mana-mana server. Hubungi admin.</p></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Create New Panel</h3>
                <span class="badge badge-success">Tier: ${userData.tier}</span>
            </div>
            <form id="createPanelForm">
                <div class="form-group">
                    <label for="panelName">Panel Name</label>
                    <input type="text" id="panelName" class="form-control" placeholder="Enter panel name (alphanumeric only)" pattern="[a-zA-Z0-9_]+" required>
                    <small style="color: var(--text-light); font-size: 12px; margin-top: 4px; display: block;">Only letters, numbers and underscore allowed</small>
                </div>
                
                <div class="form-group">
                    <label for="panelServer">Server</label>
                    <select id="panelServer" class="form-control" required>
                        <option value="">Select server...</option>
                        ${availableServers.map(srv => `<option value="${srv}">${srv.toUpperCase()}</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="panelRAM">RAM</label>
                    <select id="panelRAM" class="form-control" required>
                        <option value="1024">1GB</option>
                        <option value="2048">2GB</option>
                        <option value="3072">3GB</option>
                        <option value="4096">4GB</option>
                        <option value="5120">5GB</option>
                        <option value="10240">10GB</option>
                        <option value="0">Unlimited</option>
                    </select>
                </div>
                
                <button type="submit" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Create Panel
                </button>
            </form>
        </div>
    `;
    
    document.getElementById('createPanelForm').addEventListener('submit', handleCreatePanel);
}

async function handleCreatePanel(e) {
    e.preventDefault();
    
    const name = document.getElementById('panelName').value.trim();
    const server = document.getElementById('panelServer').value;
    const ram = document.getElementById('panelRAM').value;
    
    if (!name || !server) {
        showNotification('Sila isi semua field', 'error');
        return;
    }
    
    try {
        const result = await apiRequest('/api/panel/create', {
            method: 'POST',
            body: JSON.stringify({ name, server, ram })
        });
        
        showNotification('Panel berjaya dibuat!', 'success');
        document.getElementById('createPanelForm').reset();
        
        // Show modal with panel details
        showPanelModal(result.panel);
    } catch (error) {
        showNotification(error.message || 'Gagal membuat panel', 'error');
    }
}

function showPanelModal(panel) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = '✅ Panel Created Successfully';
    modalBody.innerHTML = `
        <div style="background: var(--light-blue); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <h4 style="color: var(--primary-blue); margin-bottom: 15px;">📋 Panel Details</h4>
            <div style="display: grid; gap: 10px;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-light);">Username:</span>
                    <strong>${panel.username}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-light);">Password:</span>
                    <strong style="color: var(--error);">${panel.password}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-light);">Email:</span>
                    <strong>${panel.email}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-light);">Server:</span>
                    <strong>${panel.server.toUpperCase()}</strong>
                </div>
            </div>
        </div>
        <p style="color: var(--warning); font-size: 14px;">⚠️ Simpan maklumat ini! Password tidak akan ditunjukkan lagi.</p>
    `;
    
    modal.classList.add('active');
}

async function loadServers(content) {
    try {
        const servers = await apiRequest('/api/servers/list');
        
        let html = '<div class="card"><div class="table-container"><table><thead><tr>';
        html += '<th>Server</th><th>Domain</th><th>Status</th><th>Users</th><th>Actions</th>';
        html += '</tr></thead><tbody>';
        
        if (servers && servers.length > 0) {
            servers.forEach(server => {
                html += `<tr>
                    <td><strong>${server.name}</strong></td>
                    <td>${server.domain}</td>
                    <td><span class="badge badge-${server.status === 'active' ? 'success' : 'error'}">${server.status}</span></td>
                    <td>${server.users || 0}</td>
                    <td>
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="viewServerDetails('${server.name}', '${server.domain}', '${server.status}', ${server.users})">👁️ View</button>
                    </td>
                </tr>`;
            });
        } else {
            html += '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">No servers found</td></tr>';
        }
        
        html += '</tbody></table></div></div>';
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<div class="card"><p style="color: var(--error);">Error loading servers: ${error.message}</p></div>`;
    }
}

async function loadUsers(content) {
    if (!hasPermission('OWN')) {
        content.innerHTML = '<div class="card"><p style="color: var(--error);">❌ Anda tiada permission untuk lihat halaman ini.</p></div>';
        return;
    }
    
    try {
        const usersData = await apiRequest('/api/users/list');
        
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">👥 User Management</h3>
                    ${userData.isOwner ? '<button class="btn btn-primary btn-sm" onclick="showAddUserModal()">➕ Add User</button>' : ''}
                </div>
                
                <div class="stats-grid" style="margin-bottom: 20px;">
                    <div class="stat-card">
                        <div class="stat-icon blue">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                            </svg>
                        </div>
                        <div class="stat-details">
                            <div class="stat-value">${usersData.total || 0}</div>
                            <div class="stat-label">Total Users</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon green">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </div>
                        <div class="stat-details">
                            <div class="stat-value">${usersData.withTier || 0}</div>
                            <div class="stat-label">With Tier</div>
                        </div>
                    </div>
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>User ID</th>
                                <th>Tier</th>
                                <th>Server Access</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersData.users && usersData.users.length > 0 ? usersData.users.map(user => `
                                <tr>
                                    <td><strong>${user.id}</strong></td>
                                    <td>${user.tier ? `<span class="badge badge-success">${user.tier}</span>` : '<span class="badge">No Tier</span>'}</td>
                                    <td>${user.access.join(', ').toUpperCase() || 'None'}</td>
                                    <td><span class="badge badge-${user.isOwner ? 'error' : 'success'}">${user.isOwner ? 'Owner' : 'User'}</span></td>
                                    <td>
                                        ${!user.isOwner && userData.isOwner ? `
                                            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px; margin-right: 5px;" onclick="editUser('${user.id}', '${user.tier || ''}', ${JSON.stringify(JSON.stringify(user.access))})">✏️ Edit</button>
                                            <button class="btn" style="padding: 6px 12px; font-size: 12px; background: var(--error); color: white;" onclick="deleteUser('${user.id}')">🗑️</button>
                                        ` : '<span style="color: var(--text-light); font-size: 12px;">-</span>'}
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">No users found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="card"><p style="color: var(--error);">Error: ${error.message}</p></div>`;
    }
}

async function loadTiers(content) {
    if (!userData.isOwner) {
        content.innerHTML = '<div class="card"><p style="color: var(--error);">❌ Hanya owner boleh akses halaman ini.</p></div>';
        return;
    }
    
    try {
        const tiersData = await apiRequest('/api/tiers/list');
        
        const tierGroups = {};
        const allTiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
        
        allTiers.forEach(tier => {
            tierGroups[tier] = [];
        });
        
        Object.entries(tiersData.tiers || {}).forEach(([userId, userObj]) => {
            if (userObj && userObj.tier) {
                if (!tierGroups[userObj.tier]) {
                    tierGroups[userObj.tier] = [];
                }
                tierGroups[userObj.tier].push(userId);
            } else if (Array.isArray(userObj)) {
                if (!tierGroups[userId]) {
                    tierGroups[userId] = userObj;
                }
            }
        });
        
        const nonEmptyTiers = Object.entries(tierGroups).filter(([tierName, users]) => users.length > 0);
        
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🏆 Tier System Management</h3>
                </div>
                
                <div style="display: grid; gap: 15px;">
                    ${nonEmptyTiers.length > 0 ? nonEmptyTiers.map(([tierName, users]) => {
                        const tierColors = {
                            'CEO': 'red',
                            'TK': 'yellow', 
                            'PT': 'blue',
                            'OWN': 'green',
                            'ADP': 'blue',
                            'RESELLER': 'green'
                        };
                        const color = tierColors[tierName] || 'blue';
                        
                        return `
                            <div class="card" style="background: var(--off-white); padding: 20px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div class="stat-icon ${color}" style="width: 48px; height: 48px;">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 style="margin-bottom: 4px; color: var(--text-dark);">${tierName}</h4>
                                            <p style="color: var(--text-light); font-size: 14px;">${users.length} users</p>
                                        </div>
                                    </div>
                                    <span class="badge badge-${color === 'red' ? 'error' : color === 'yellow' ? 'warning' : 'success'}">${users.length} Users</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                    ${users.map(userId => `
                                        <span style="background: var(--white); padding: 6px 12px; border-radius: 8px; font-size: 13px; color: var(--text-dark);">
                                            ${userId}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="card" style="background: var(--off-white); padding: 20px; text-align: center;"><p style="color: var(--text-light);">No tiers configured yet</p></div>'}
                </div>
                
                <div style="margin-top: 20px; padding: 16px; background: var(--light-blue); border-radius: 12px;">
                    <h4 style="color: var(--primary-blue); margin-bottom: 10px;">📋 Tier Hierarchy</h4>
                    <p style="color: var(--text-dark); font-size: 14px;">
                        <strong>RESELLER</strong> → <strong>ADP</strong> → <strong>OWN</strong> → <strong>PT</strong> → <strong>TK</strong> → <strong>CEO</strong>
                    </p>
                    <p style="color: var(--text-light); font-size: 13px; margin-top: 8px;">
                        💡 Higher tier = More permissions. Manage tiers using bot commands.
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="card"><p style="color: var(--error);">Error: ${error.message}</p></div>`;
    }
}

async function loadSettings(content) {
    if (!userData.isOwner) {
        content.innerHTML = '<div class="card"><p style="color: var(--error);">❌ Hanya owner boleh akses halaman ini.</p></div>';
        return;
    }
    
    try {
        const settingsData = await apiRequest('/api/settings/info');
        
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⚙️ System Settings</h3>
                </div>
                
                <div style="display: grid; gap: 20px;">
                    <!-- Server Configuration -->
                    <div>
                        <h4 style="margin-bottom: 15px; color: var(--text-dark);">🌐 Server Configuration</h4>
                        <div style="display: grid; gap: 12px;">
                            ${['srv1', 'srv2', 'srv3'].map((srv, index) => {
                                const server = settingsData.servers[srv];
                                return `
                                    <div style="padding: 16px; background: var(--off-white); border-radius: 12px; border-left: 4px solid ${server.active ? 'var(--success)' : 'var(--error)'};">
                                        <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 8px;">
                                            <strong style="color: var(--text-dark);">Server ${index + 1}</strong>
                                            <span class="badge badge-${server.active ? 'success' : 'error'}">${server.active ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        <div style="font-size: 13px; color: var(--text-light);">
                                            <div>🌐 Domain: ${server.domain || 'Not configured'}</div>
                                            <div>🔑 API Key: ${server.hasApiKey ? '✅ Configured' : '❌ Not set'}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <!-- Bot Information -->
                    <div>
                        <h4 style="margin-bottom: 15px; color: var(--text-dark);">🤖 Bot Information</h4>
                        <div style="padding: 16px; background: var(--light-blue); border-radius: 12px;">
                            <div style="display: grid; gap: 10px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-light);">Bot Name:</span>
                                    <strong>${settingsData.botInfo.name}</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-light);">Version:</span>
                                    <strong>${settingsData.botInfo.version}</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-light);">Owner:</span>
                                    <strong>${settingsData.botInfo.owner}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Security Settings -->
                    <div>
                        <h4 style="margin-bottom: 15px; color: var(--text-dark);">🔒 Security Status</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                            <div style="padding: 16px; background: var(--off-white); border-radius: 12px; text-align: center;">
                                <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
                                <div style="font-weight: 600; color: var(--text-dark);">CSRF Protection</div>
                                <div style="font-size: 12px; color: var(--success);">✅ Enabled</div>
                            </div>
                            <div style="padding: 16px; background: var(--off-white); border-radius: 12px; text-align: center;">
                                <div style="font-size: 32px; margin-bottom: 8px;">⏱️</div>
                                <div style="font-weight: 600; color: var(--text-dark);">Rate Limiting</div>
                                <div style="font-size: 12px; color: var(--success);">✅ Active</div>
                            </div>
                            <div style="padding: 16px; background: var(--off-white); border-radius: 12px; text-align: center;">
                                <div style="font-size: 32px; margin-bottom: 8px;">🔐</div>
                                <div style="font-weight: 600; color: var(--text-dark);">Session Security</div>
                                <div style="font-size: 12px; color: var(--success);">✅ Secure</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Quick Actions -->
                    <div>
                        <h4 style="margin-bottom: 15px; color: var(--text-dark);">⚡ Quick Actions</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
                            <button class="btn btn-secondary" onclick="alert('Use bot command: /cekserver')">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                                Refresh Status
                            </button>
                            <button class="btn btn-secondary" onclick="alert('Server configuration can be updated using bot commands')">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                Configure
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="card"><p style="color: var(--error);">Error: ${error.message}</p></div>`;
    }
}

async function apiRequest(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': csrfToken
        }
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Request failed');
    }
    
    return response.json();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'var(--success)' : 'var(--error)'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function deleteUser(userId) {
    if (!confirm(`Adakah anda pasti mahu delete user ${userId}?\n\nIni akan remove:\n- Tier\n- Server access\n\nGunakan bot untuk delete panel di Pterodactyl.`)) {
        return;
    }
    
    try {
        await apiRequest('/api/users/delete', {
            method: 'POST',
            body: JSON.stringify({ userId })
        });
        
        showNotification('User berjaya didelete!', 'success');
        loadPage('users');
    } catch (error) {
        showNotification(error.message || 'Gagal delete user', 'error');
    }
}

async function editUser(userId, currentTier, currentAccessStr) {
    const currentAccess = JSON.parse(currentAccessStr);
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    const tiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    const servers = ['srv1', 'srv2', 'srv3'];
    
    modalTitle.textContent = `Edit User: ${userId}`;
    modalBody.innerHTML = `
        <form id="editUserForm">
            <div class="form-group">
                <label>Tier</label>
                <select id="editTier" class="form-control">
                    <option value="">No Tier</option>
                    ${tiers.map(t => `<option value="${t}" ${t === currentTier ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label>Server Access</label>
                ${servers.map(srv => `
                    <label style="display: block; margin-bottom: 8px;">
                        <input type="checkbox" id="access_${srv}" ${currentAccess.includes(srv) ? 'checked' : ''}>
                        <span style="margin-left: 8px;">${srv.toUpperCase()}</span>
                    </label>
                `).join('')}
            </div>
            
            <button type="submit" class="btn btn-primary">💾 Save Changes</button>
        </form>
    `;
    
    modal.classList.add('active');
    
    document.getElementById('editUserForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const tier = document.getElementById('editTier').value;
        const access = servers.filter(srv => document.getElementById(`access_${srv}`).checked);
        
        try {
            await apiRequest('/api/users/update', {
                method: 'POST',
                body: JSON.stringify({ userId, tier, access })
            });
            
            showNotification('User berjaya diupdate!', 'success');
            modal.classList.remove('active');
            loadPage('users');
        } catch (error) {
            showNotification(error.message || 'Gagal update user', 'error');
        }
    };
}

function showAddUserModal() {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    const tiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    const servers = ['srv1', 'srv2', 'srv3'];
    
    modalTitle.textContent = '➕ Add New User';
    modalBody.innerHTML = `
        <form id="addUserForm">
            <div class="form-group">
                <label>Telegram User ID</label>
                <input type="text" id="newUserId" class="form-control" placeholder="Enter Telegram ID" pattern="[0-9]+" required>
                <small style="color: var(--text-light); font-size: 12px; margin-top: 4px; display: block;">User's Telegram ID (numbers only)</small>
            </div>
            
            <div class="form-group">
                <label>Tier</label>
                <select id="newTier" class="form-control">
                    <option value="">No Tier</option>
                    ${tiers.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label>Server Access</label>
                ${servers.map(srv => `
                    <label style="display: block; margin-bottom: 8px;">
                        <input type="checkbox" id="new_access_${srv}">
                        <span style="margin-left: 8px;">${srv.toUpperCase()}</span>
                    </label>
                `).join('')}
            </div>
            
            <button type="submit" class="btn btn-primary">➕ Add User</button>
        </form>
    `;
    
    modal.classList.add('active');
    
    document.getElementById('addUserForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const userId = document.getElementById('newUserId').value.trim();
        const tier = document.getElementById('newTier').value;
        const access = servers.filter(srv => document.getElementById(`new_access_${srv}`).checked);
        
        if (!userId || !/^\d+$/.test(userId)) {
            showNotification('Please enter valid Telegram ID (numbers only)', 'error');
            return;
        }
        
        try {
            await apiRequest('/api/users/update', {
                method: 'POST',
                body: JSON.stringify({ userId, tier, access })
            });
            
            showNotification('User berjaya ditambah!', 'success');
            modal.classList.remove('active');
            loadPage('users');
        } catch (error) {
            showNotification(error.message || 'Gagal tambah user', 'error');
        }
    };
}

function viewServerDetails(name, domain, status, users) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `🖥️ ${name} Details`;
    modalBody.innerHTML = `
        <div style="display: grid; gap: 15px;">
            <div style="padding: 16px; background: var(--off-white); border-radius: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: var(--text-light);">Domain:</span>
                    <strong style="color: var(--primary-blue);">${domain}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: var(--text-light);">Status:</span>
                    <span class="badge badge-${status === 'active' ? 'success' : 'error'}">${status}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-light);">Total Users:</span>
                    <strong>${users}</strong>
                </div>
            </div>
            
            <div style="padding: 16px; background: var(--light-blue); border-radius: 12px;">
                <h4 style="color: var(--primary-blue); margin-bottom: 10px;">Quick Actions</h4>
                <div style="display: grid; gap: 8px;">
                    <a href="${domain}" target="_blank" class="btn btn-primary" style="text-decoration: none; text-align: center;">
                        🌐 Open Panel
                    </a>
                    <button class="btn btn-secondary" onclick="alert('Use bot command: /listuser to view all users')">
                        👥 View Users
                    </button>
                </div>
            </div>
            
            <div style="padding: 12px; background: var(--warning-light, #fff3cd); border-left: 4px solid var(--warning); border-radius: 8px;">
                <p style="color: var(--text-dark); font-size: 13px; margin: 0;">
                    💡 <strong>Tip:</strong> Use bot commands untuk manage panel users dan resources.
                </p>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}
