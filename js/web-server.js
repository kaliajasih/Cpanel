const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

// Import settings from bot
const settings = require('./settings');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ==================== SECURITY MIDDLEWARE ====================

// Helmet - Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting - Anti brute force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { success: false, message: 'Terlalu banyak percubaan login. Sila cuba sebentar lagi.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { success: false, message: 'Terlalu banyak permintaan. Sila perlahan.' },
});

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Session configuration
app.use(session({
    secret: settings.sessionSecret || 'change-this-secret-key-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    }
}));

// Static files
app.use(express.static('public'));

// ==================== CSRF PROTECTION ====================

// Generate CSRF token
function generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
}

// CSRF middleware for state-changing routes
function csrfProtection(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = req.session.csrfToken;
    
    if (!token || !sessionToken || token !== sessionToken) {
        return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    }
    
    next();
}

// Route to get CSRF token
app.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
    }
    res.json({ csrfToken: req.session.csrfToken });
});

// ==================== AUTHENTICATION MIDDLEWARE ====================

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized' });
}

function isOwner(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const owners = Array.isArray(settings.owner) ? settings.owner : [settings.owner];
    if (owners.includes(req.session.userId.toString())) {
        return next();
    }
    
    return res.status(403).json({ success: false, message: 'Forbidden: Owner access required' });
}

// ==================== DATABASE HELPER FUNCTIONS ====================

function loadJSON(filename) {
    try {
        const filePath = path.join(__dirname, 'database', filename);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
    }
    return [];
}

function saveJSON(filename, data) {
    try {
        const filePath = path.join(__dirname, 'database', filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving ${filename}:`, error);
        return false;
    }
}

function getUserTier(userId) {
    const tiers = loadJSON('tier.json');
    
    // Check new format: { "userId": { "tier": "CEO" } }
    if (tiers[userId] && tiers[userId].tier) {
        return tiers[userId].tier;
    }
    
    // Check old format: { "CEO": ["userId1", "userId2"] }
    for (const [tier, users] of Object.entries(tiers)) {
        if (Array.isArray(users) && users.includes(userId.toString())) {
            return tier;
        }
    }
    
    return null;
}

function getUserAccess(userId) {
    const access = [];
    ['srv1', 'srv2', 'srv3'].forEach(srv => {
        const users = loadJSON(`servers/${srv}.json`);
        if (users.includes(userId.toString())) {
            access.push(srv);
        }
    });
    return access;
}

function checkUserExists(telegramId) {
    // Check if user has access to any server
    const access = getUserAccess(telegramId);
    if (access.length > 0) {
        return true;
    }
    
    // Check if user is owner
    const owners = Array.isArray(settings.owner) ? settings.owner : [settings.owner];
    if (owners.includes(telegramId.toString())) {
        return true;
    }
    
    // Check if user has tier
    const tier = getUserTier(telegramId);
    if (tier) {
        return true;
    }
    
    return false;
}

// ==================== INPUT VALIDATION & SANITIZATION ====================

const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input
        .replace(/[<>]/g, '') // Remove < >
        .replace(/['";]/g, '') // Remove quotes
        .trim();
};

const validateTelegramId = [
    body('telegramId')
        .trim()
        .isLength({ min: 6, max: 15 })
        .matches(/^[0-9]+$/)
        .withMessage('ID Telegram tidak sah')
];

// ==================== AUTHENTICATION ROUTES ====================

// Login dengan Telegram ID (CSRF not required for login page)
app.post('/api/auth/login', loginLimiter, validateTelegramId, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'ID Telegram tidak sah' });
    }

    const { telegramId, remember } = req.body;
    const sanitizedId = sanitizeInput(telegramId);
    
    try {
        // Check if user exists in bot database
        if (!checkUserExists(sanitizedId)) {
            return res.status(401).json({ 
                success: false, 
                message: 'ID Telegram tidak terdaftar. Sila hubungi admin atau gunakan bot untuk register.' 
            });
        }
        
        // Regenerate session to prevent session fixation attacks
        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Ralat pelayan dalaman' });
            }
            
            // Create session
            req.session.userId = sanitizedId;
            req.session.tier = getUserTier(sanitizedId);
            req.session.access = getUserAccess(sanitizedId);
            req.session.csrfToken = generateCSRFToken(); // Generate CSRF token
            
            const owners = Array.isArray(settings.owner) ? settings.owner : [settings.owner];
            req.session.isOwner = owners.includes(sanitizedId);
            
            // Implement remember me properly
            if (remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            } else {
                req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours (default)
            }
            
            res.json({
                success: true,
                message: 'Login berjaya',
                user: {
                    id: sanitizedId,
                    tier: req.session.tier || 'Member',
                    isOwner: req.session.isOwner,
                    access: req.session.access
                }
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Ralat pelayan dalaman' });
    }
});

// Check authentication status
app.get('/api/auth/check', isAuthenticated, (req, res) => {
    res.json({
        authenticated: true,
        userId: req.session.userId,
        username: `User ${req.session.userId}`,
        tier: req.session.tier || getUserTier(req.session.userId),
        isOwner: req.session.isOwner,
        access: req.session.access || getUserAccess(req.session.userId)
    });
});

// Logout (CSRF protected)
app.post('/api/auth/logout', csrfProtection, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout gagal' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Berjaya logout' });
    });
});

// ==================== DASHBOARD API ROUTES ====================

// Get dashboard stats
app.get('/api/dashboard/stats', isAuthenticated, apiLimiter, (req, res) => {
    try {
        const srv1Users = loadJSON('servers/srv1.json');
        const srv2Users = loadJSON('servers/srv2.json');
        const srv3Users = loadJSON('servers/srv3.json');
        const tiers = loadJSON('tier.json');
        
        let totalUsers = new Set([...srv1Users, ...srv2Users, ...srv3Users]).size;
        let totalPanels = 0;
        
        const servers = [
            { domain: settings.domain, apiKey: settings.plta },
            { domain: settings.domain2, apiKey: settings.plta2 },
            { domain: settings.domain3, apiKey: settings.plta3 }
        ].filter(s => s.domain && s.domain !== '-');
        
        res.json({
            servers: servers.length,
            users: totalUsers,
            panels: totalPanels,
            tier: getUserTier(req.session.userId) || 'Member'
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, message: 'Gagal muatkan statistik' });
    }
});

// Get servers list
app.get('/api/servers/list', isAuthenticated, apiLimiter, (req, res) => {
    try {
        const servers = [];
        
        if (settings.domain && settings.domain !== '-') {
            servers.push({
                name: 'Server 1',
                domain: settings.domain,
                status: 'active',
                users: loadJSON('servers/srv1.json').length
            });
        }
        
        if (settings.domain2 && settings.domain2 !== '-') {
            servers.push({
                name: 'Server 2',
                domain: settings.domain2,
                status: 'active',
                users: loadJSON('servers/srv2.json').length
            });
        }
        
        if (settings.domain3 && settings.domain3 !== '-') {
            servers.push({
                name: 'Server 3',
                domain: settings.domain3,
                status: 'active',
                users: loadJSON('servers/srv3.json').length
            });
        }
        
        res.json(servers);
    } catch (error) {
        console.error('Servers list error:', error);
        res.status(500).json({ success: false, message: 'Gagal muatkan senarai server' });
    }
});

// Get users list
app.get('/api/users/list', isAuthenticated, apiLimiter, (req, res) => {
    try {
        if (!req.session.isOwner) {
            const tierHierarchy = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
            const userTierIndex = tierHierarchy.indexOf(req.session.tier);
            if (userTierIndex < 2) { // Below OWN
                return res.status(403).json({ success: false, message: 'Permission denied' });
            }
        }
        
        const allUsers = new Set();
        
        // Get users from servers
        ['srv1', 'srv2', 'srv3'].forEach(srv => {
            const users = loadJSON(`servers/${srv}.json`);
            users.forEach(id => allUsers.add(id));
        });
        
        // Get users from tiers
        const tiers = loadJSON('tier.json');
        Object.values(tiers).forEach(tierUsers => {
            if (Array.isArray(tierUsers)) {
                tierUsers.forEach(id => allUsers.add(id));
            }
        });
        
        const usersList = Array.from(allUsers).map(userId => ({
            id: userId,
            tier: getUserTier(userId),
            access: getUserAccess(userId),
            isOwner: (Array.isArray(settings.owner) ? settings.owner : [settings.owner]).includes(userId)
        }));
        
        res.json({
            success: true,
            total: usersList.length,
            withTier: usersList.filter(u => u.tier).length,
            users: usersList
        });
    } catch (error) {
        console.error('Users list error:', error);
        res.status(500).json({ success: false, message: 'Gagal muatkan senarai user' });
    }
});

// Get tiers list
app.get('/api/tiers/list', isAuthenticated, isOwner, apiLimiter, (req, res) => {
    try {
        const tiers = loadJSON('tier.json');
        res.json({
            success: true,
            tiers: tiers
        });
    } catch (error) {
        console.error('Tiers list error:', error);
        res.status(500).json({ success: false, message: 'Gagal muatkan tier' });
    }
});

// Delete user
app.post('/api/users/delete', isAuthenticated, csrfProtection, isOwner, apiLimiter, [
    body('userId').trim().notEmpty()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'User ID tidak sah' });
    }
    
    try {
        const { userId } = req.body;
        
        // Remove from tier.json
        const tiers = loadJSON('tier.json');
        if (tiers[userId]) {
            delete tiers[userId];
            saveJSON('tier.json', tiers);
        }
        
        // Remove from all servers
        ['srv1', 'srv2', 'srv3'].forEach(srv => {
            const users = loadJSON(`servers/${srv}.json`);
            const filtered = users.filter(id => id !== userId);
            saveJSON(`servers/${srv}.json`, filtered);
        });
        
        res.json({ success: true, message: 'User berjaya didelete' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Gagal delete user' });
    }
});

// Update user
app.post('/api/users/update', isAuthenticated, csrfProtection, isOwner, apiLimiter, [
    body('userId').trim().notEmpty(),
    body('tier').optional().isIn(['', 'RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO']),
    body('access').isArray()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Data tidak sah' });
    }
    
    try {
        const { userId, tier, access } = req.body;
        
        // Update tier
        const tiers = loadJSON('tier.json');
        if (tier) {
            if (!tiers[userId]) {
                tiers[userId] = {
                    tier: tier,
                    createdAt: new Date().toISOString(),
                    adpCreated: {}
                };
            } else {
                tiers[userId].tier = tier;
            }
        } else {
            // Remove tier
            if (tiers[userId]) {
                delete tiers[userId];
            }
        }
        saveJSON('tier.json', tiers);
        
        // Update server access
        ['srv1', 'srv2', 'srv3'].forEach(srv => {
            let users = loadJSON(`servers/${srv}.json`);
            
            // Remove user first
            users = users.filter(id => id !== userId);
            
            // Add back if has access
            if (access.includes(srv)) {
                users.push(userId);
            }
            
            saveJSON(`servers/${srv}.json`, users);
        });
        
        res.json({ success: true, message: 'User berjaya diupdate' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, message: 'Gagal update user' });
    }
});

// Get settings info
app.get('/api/settings/info', isAuthenticated, isOwner, apiLimiter, (req, res) => {
    try {
        const servers = {
            srv1: {
                domain: settings.domain,
                active: settings.domain && settings.domain !== '-',
                hasApiKey: settings.plta && settings.plta !== '-'
            },
            srv2: {
                domain: settings.domain2,
                active: settings.domain2 && settings.domain2 !== '-',
                hasApiKey: settings.plta2 && settings.plta2 !== '-'
            },
            srv3: {
                domain: settings.domain3,
                active: settings.domain3 && settings.domain3 !== '-',
                hasApiKey: settings.plta3 && settings.plta3 !== '-'
            }
        };
        
        const botInfo = {
            name: settings.namaBot || 'Bot',
            version: settings.versisc || '1.0',
            owner: settings.namaOwner || 'Owner'
        };
        
        res.json({
            success: true,
            servers,
            botInfo
        });
    } catch (error) {
        console.error('Settings info error:', error);
        res.status(500).json({ success: false, message: 'Gagal muatkan settings' });
    }
});

// Create panel (CSRF protected)
app.post('/api/panel/create', isAuthenticated, csrfProtection, apiLimiter, [
    body('name').trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
    body('server').isIn(['srv1', 'srv2', 'srv3']),
    body('ram').isInt({ min: 0 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Data tidak sah' });
    }
    
    // Check if user has valid tier
    const validTiers = ['RESELLER', 'ADP', 'OWN', 'PT', 'TK', 'CEO'];
    if (!validTiers.includes(req.session.tier)) {
        return res.status(403).json({ 
            success: false, 
            message: 'Anda perlu tier (RESELLER atau lebih tinggi) untuk membuat panel' 
        });
    }

    const { name, server, ram } = req.body;
    const userId = req.session.userId;
    const sanitizedName = sanitizeInput(name);
    
    try {
        // Check user access
        const access = getUserAccess(userId);
        if (!access.includes(server)) {
            return res.status(403).json({ success: false, message: 'Tiada akses ke server ini' });
        }
        
        // Get server config
        const serverMap = {
            srv1: { domain: settings.domain, apiKey: settings.plta },
            srv2: { domain: settings.domain2, apiKey: settings.plta2 },
            srv3: { domain: settings.domain3, apiKey: settings.plta3 }
        };
        
        const srv = serverMap[server];
        if (!srv || srv.domain === '-' || !srv.apiKey) {
            return res.status(400).json({ success: false, message: 'Server tidak dikonfigurasi' });
        }
        
        // Check if username exists
        const checkRes = await axios.get(`${srv.domain}/api/application/users?filter[username]=${sanitizedName}`, {
            headers: {
                'Authorization': `Bearer ${srv.apiKey}`,
                'Accept': 'Application/vnd.pterodactyl.v1+json'
            }
        });
        
        if (checkRes.data.data.length > 0) {
            return res.status(400).json({ success: false, message: 'Username sudah wujud' });
        }
        
        // Create user on Pterodactyl
        const password = sanitizedName + Math.random().toString(36).slice(-4);
        const email = `${sanitizedName}@panel.com`;
        
        const createRes = await axios.post(`${srv.domain}/api/application/users`, {
            username: sanitizedName,
            email,
            first_name: sanitizedName,
            last_name: 'User',
            password,
            root_admin: false
        }, {
            headers: {
                'Authorization': `Bearer ${srv.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'Application/vnd.pterodactyl.v1+json'
            }
        });
        
        const user = createRes.data.attributes;
        
        res.json({
            success: true,
            message: 'Panel berjaya dibuat',
            panel: {
                id: user.id,
                username: user.username,
                email: user.email,
                password,
                server
            }
        });
    } catch (error) {
        console.error('Create panel error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Gagal membuat panel' });
    }
});

// ==================== DEFAULT ROUTE ====================

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Tidak dijumpai' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, message: 'Ralat pelayan dalaman' });
});

// ==================== START SERVER ====================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`🔒 Security features enabled: Helmet, Rate Limiting, Input Validation`);
    console.log(`📱 Access at: http://localhost:${PORT}`);
    console.log(`🔑 Login menggunakan ID Telegram anda`);
});
