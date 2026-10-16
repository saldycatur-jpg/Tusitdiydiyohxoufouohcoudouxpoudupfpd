// ============================================================================
// KEMI // PLAY AI AUTH BACKEND
// Verifikasi auth token → return script content ke client
// ============================================================================

const express = require('express');
const crypto  = require('crypto');

const app = express();
app.set('trust proxy', 1);           // Render duduk di belakang proxy
app.use(express.json({ limit: '10kb' }));

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;

// Daftar token valid (dipisah koma di env var).
// Contoh: TOKENS="KEMI-2026-AAAA,KEMI-2026-BBBB,DEMO-TRIAL"
const VALID_TOKENS = (process.env.TOKENS || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

// URL raw github tempat script AI disimpan (SERVER-SIDE ONLY)
const AI_SCRIPT_URL = process.env.AI_SCRIPT_URL ||
    'https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/play_ai.lua';

// Kalau false, client dapat script content langsung.
// Kalau true, client dapat URL (kurang aman — hanya untuk debugging).
const RETURN_URL_MODE = process.env.RETURN_URL_MODE === 'true';

// Cache script content supaya tidak hammer github tiap request
let cachedScript = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;     // 1 menit

// ===== RATE LIMITER (in-memory per-IP) =====
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;   // 1 menit
const RATE_MAX       = 15;          // max request per IP per window

function rateLimitCheck(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > RATE_WINDOW_MS) {
        rateLimitMap.set(ip, { start: now, count: 1 });
        return true;
    }
    if (entry.count >= RATE_MAX) return false;
    entry.count++;
    return true;
}

// Cleanup rate-limit map tiap 5 menit (biar tidak leak)
setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of rateLimitMap) {
        if (now - e.start > RATE_WINDOW_MS * 2) rateLimitMap.delete(ip);
    }
}, 5 * 60 * 1000);

// ===== SCRIPT FETCH (dengan cache) =====
async function getScriptContent() {
    const now = Date.now();
    if (cachedScript && now - cacheTime < CACHE_TTL_MS) {
        return cachedScript;
    }
    const res = await fetch(AI_SCRIPT_URL, {
        headers: { 'User-Agent': 'KEMI-PlayAI-Auth/1.0' }
    });
    if (!res.ok) {
        throw new Error('Source fetch failed: ' + res.status);
    }
    const text = await res.text();
    if (!text || text.length < 10) {
        throw new Error('Source content empty');
    }
    cachedScript = text;
    cacheTime = now;
    return text;
}

// ===== CONSTANT-TIME TOKEN COMPARISON =====
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

function isTokenValid(token) {
    if (!token) return false;
    for (const t of VALID_TOKENS) {
        if (safeCompare(t, token)) return true;
    }
    return false;
}

// ===== ROUTES =====
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'KEMI-PlayAI-Auth', version: '1.0.0' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', ts: Date.now() });
});

app.post('/verify', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // Rate limit
    if (!rateLimitCheck(ip)) {
        return res.status(429).json({
            valid: false,
            error: 'Rate limit exceeded. Try again in a minute.'
        });
    }

    const { token } = req.body || {};

    if (!token || typeof token !== 'string') {
        return res.status(400).json({
            valid: false,
            error: 'Token required'
        });
    }

    if (!isTokenValid(token)) {
        console.log(`[AUTH-FAIL] ip=${ip} token=${token.slice(0, 6)}***`);
        return res.status(401).json({
            valid: false,
            error: 'Invalid auth token'
        });
    }

    // Token valid → siapkan response
    try {
        if (RETURN_URL_MODE) {
            console.log(`[AUTH-OK-URL] ip=${ip} token=${token.slice(0, 6)}***`);
            return res.json({
                valid: true,
                script_url: AI_SCRIPT_URL
            });
        }

        const script = await getScriptContent();
        console.log(`[AUTH-OK] ip=${ip} token=${token.slice(0, 6)}*** size=${script.length}`);
        return res.json({
            valid: true,
            script: script
        });
    } catch (e) {
        console.error('[SCRIPT-FETCH-ERR]', e.message);
        return res.status(500).json({
            valid: false,
            error: 'Failed to retrieve script'
        });
    }
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`KEMI-PlayAI-Auth listening on port ${PORT}`);
    console.log(`  Tokens loaded: ${VALID_TOKENS.length}`);
    console.log(`  Return URL mode: ${RETURN_URL_MODE}`);
});
