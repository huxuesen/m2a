import { startProxy } from './src/proxy.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
    }
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
}

function parseToolAllowlist(value, fallback = []) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
    }
    if (typeof value === 'string') {
        return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
    }
    if (value === undefined || value === null || value === '') return fallback;
    return fallback;
}

// Default configuration — MIMOCODE prefix for backend, MIMOCODE_PROXY for proxy
const defaultConfig = {
    PORT: parseInt(process.env.MIMOCODE_PROXY_PORT) || 10000,
    API_KEY: '',
    MIMOCODE_SERVER_URL: `http://127.0.0.1:${process.env.MIMOCODE_SERVER_PORT || 10001}`,
    MIMOCODE_SERVER_PASSWORD: process.env.MIMOCODE_SERVER_PASSWORD || '',
    MANAGE_BACKEND: parseBool(process.env.MIMOCODE_PROXY_MANAGE_BACKEND, false),
    MIMOCODE_PATH: 'mimo',
    BIND_HOST: '0.0.0.0',
    DISABLE_TOOLS: true,
    EXTERNAL_TOOLS_MODE: 'proxy-bridge',
    EXTERNAL_TOOLS_CONFLICT_POLICY: 'namespace',
    INTERNAL_WEB_FETCH_ENABLED: parseBool(process.env.MIMOCODE_INTERNAL_WEB_FETCH_ENABLED, false),
    INTERNAL_ALLOWED_TOOLS: parseToolAllowlist(process.env.MIMOCODE_INTERNAL_ALLOWED_TOOLS, []),
    INTERNAL_TOOL_METRICS_ENABLED: parseBool(process.env.MIMOCODE_INTERNAL_TOOL_METRICS_ENABLED, true),
    INTERNAL_TOOL_DISCOVERY_FIXTURE: parseToolAllowlist(process.env.MIMOCODE_TOOL_DISCOVERY_FIXTURE, []),
    HEALTH_DETAILS_ENABLED: parseBool(process.env.MIMOCODE_HEALTH_DETAILS_ENABLED, true),
    HEALTH_DETAILS_REQUIRE_AUTH: parseBool(process.env.MIMOCODE_HEALTH_DETAILS_REQUIRE_AUTH, true),
    METRICS_ENABLED: parseBool(process.env.MIMOCODE_METRICS_ENABLED, false),
    METRICS_REQUIRE_AUTH: parseBool(process.env.MIMOCODE_METRICS_REQUIRE_AUTH, true),
    PROMPT_MODE: process.env.MIMOCODE_PROXY_PROMPT_MODE || 'standard',
    OMIT_SYSTEM_PROMPT: parseBool(process.env.MIMOCODE_PROXY_OMIT_SYSTEM_PROMPT, false),
    AUTO_CLEANUP_CONVERSATIONS: parseBool(process.env.MIMOCODE_PROXY_AUTO_CLEANUP_CONVERSATIONS, false),
    CLEANUP_INTERVAL_MS: parseInt(process.env.MIMOCODE_PROXY_CLEANUP_INTERVAL_MS) || 43200000,
    CLEANUP_MAX_AGE_MS: parseInt(process.env.MIMOCODE_PROXY_CLEANUP_MAX_AGE_MS) || 86400000
};

// Load config from file
const configPath = path.join(__dirname, 'config.json');
let fileConfig = {};

if (fs.existsSync(configPath)) {
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        fileConfig = JSON.parse(content);
        console.log('[Config] Loaded from config.json');
    } catch (err) {
        console.error('[Config] Error parsing config.json:', err.message);
    }
}

// Merge configs: env > file > default
const finalConfig = {
    PORT: parseInt(process.env.MIMOCODE_PROXY_PORT) || parseInt(process.env.PORT) || fileConfig.PORT || defaultConfig.PORT,
    API_KEY: process.env.API_KEY || fileConfig.API_KEY || defaultConfig.API_KEY,
    MIMOCODE_SERVER_URL: process.env.MIMOCODE_SERVER_URL || fileConfig.MIMOCODE_SERVER_URL || defaultConfig.MIMOCODE_SERVER_URL,
    MIMOCODE_SERVER_PASSWORD: process.env.MIMOCODE_SERVER_PASSWORD || fileConfig.MIMOCODE_SERVER_PASSWORD || defaultConfig.MIMOCODE_SERVER_PASSWORD,
    MANAGE_BACKEND: parseBool(process.env.MIMOCODE_PROXY_MANAGE_BACKEND, parseBool(fileConfig.MANAGE_BACKEND, defaultConfig.MANAGE_BACKEND)),
    MIMOCODE_PATH: process.env.MIMOCODE_PATH || fileConfig.MIMOCODE_PATH || defaultConfig.MIMOCODE_PATH,
    BIND_HOST: process.env.BIND_HOST || fileConfig.BIND_HOST || defaultConfig.BIND_HOST,
    DISABLE_TOOLS: parseBool(process.env.MIMOCODE_DISABLE_TOOLS, parseBool(fileConfig.DISABLE_TOOLS, defaultConfig.DISABLE_TOOLS)),
    EXTERNAL_TOOLS_MODE: process.env.MIMOCODE_EXTERNAL_TOOLS_MODE || fileConfig.EXTERNAL_TOOLS_MODE || defaultConfig.EXTERNAL_TOOLS_MODE,
    EXTERNAL_TOOLS_CONFLICT_POLICY: process.env.MIMOCODE_EXTERNAL_TOOLS_CONFLICT_POLICY || fileConfig.EXTERNAL_TOOLS_CONFLICT_POLICY || defaultConfig.EXTERNAL_TOOLS_CONFLICT_POLICY,
    INTERNAL_WEB_FETCH_ENABLED: parseBool(process.env.MIMOCODE_INTERNAL_WEB_FETCH_ENABLED, parseBool(fileConfig.INTERNAL_WEB_FETCH_ENABLED, defaultConfig.INTERNAL_WEB_FETCH_ENABLED)),
    INTERNAL_ALLOWED_TOOLS: parseToolAllowlist(process.env.MIMOCODE_INTERNAL_ALLOWED_TOOLS, parseToolAllowlist(fileConfig.INTERNAL_ALLOWED_TOOLS, defaultConfig.INTERNAL_ALLOWED_TOOLS)),
    INTERNAL_TOOL_METRICS_ENABLED: parseBool(process.env.MIMOCODE_INTERNAL_TOOL_METRICS_ENABLED, parseBool(fileConfig.INTERNAL_TOOL_METRICS_ENABLED, defaultConfig.INTERNAL_TOOL_METRICS_ENABLED)),
    INTERNAL_TOOL_DISCOVERY_FIXTURE: parseToolAllowlist(process.env.MIMOCODE_TOOL_DISCOVERY_FIXTURE, parseToolAllowlist(fileConfig.INTERNAL_TOOL_DISCOVERY_FIXTURE, defaultConfig.INTERNAL_TOOL_DISCOVERY_FIXTURE)),
    HEALTH_DETAILS_ENABLED: parseBool(process.env.MIMOCODE_HEALTH_DETAILS_ENABLED, parseBool(fileConfig.HEALTH_DETAILS_ENABLED, defaultConfig.HEALTH_DETAILS_ENABLED)),
    HEALTH_DETAILS_REQUIRE_AUTH: parseBool(process.env.MIMOCODE_HEALTH_DETAILS_REQUIRE_AUTH, parseBool(fileConfig.HEALTH_DETAILS_REQUIRE_AUTH, defaultConfig.HEALTH_DETAILS_REQUIRE_AUTH)),
    METRICS_ENABLED: parseBool(process.env.MIMOCODE_METRICS_ENABLED, parseBool(fileConfig.METRICS_ENABLED, defaultConfig.METRICS_ENABLED)),
    METRICS_REQUIRE_AUTH: parseBool(process.env.MIMOCODE_METRICS_REQUIRE_AUTH, parseBool(fileConfig.METRICS_REQUIRE_AUTH, defaultConfig.METRICS_REQUIRE_AUTH)),
    USE_ISOLATED_HOME: parseBool(process.env.MIMOCODE_USE_ISOLATED_HOME, parseBool(fileConfig.USE_ISOLATED_HOME, false)),
    REQUEST_TIMEOUT_MS: parseInt(process.env.MIMOCODE_PROXY_REQUEST_TIMEOUT_MS) || fileConfig.REQUEST_TIMEOUT_MS || 180000,
    DEBUG: parseBool(process.env.MIMOCODE_PROXY_DEBUG, parseBool(fileConfig.DEBUG, false)),
    ZEN_API_KEY: process.env.MIMOCODE_ZEN_API_KEY || fileConfig.ZEN_API_KEY || '',
    PROMPT_MODE: process.env.MIMOCODE_PROXY_PROMPT_MODE || fileConfig.PROMPT_MODE || defaultConfig.PROMPT_MODE,
    OMIT_SYSTEM_PROMPT: parseBool(process.env.MIMOCODE_PROXY_OMIT_SYSTEM_PROMPT, parseBool(fileConfig.OMIT_SYSTEM_PROMPT, defaultConfig.OMIT_SYSTEM_PROMPT)),
    AUTO_CLEANUP_CONVERSATIONS: parseBool(process.env.MIMOCODE_PROXY_AUTO_CLEANUP_CONVERSATIONS, parseBool(fileConfig.AUTO_CLEANUP_CONVERSATIONS, defaultConfig.AUTO_CLEANUP_CONVERSATIONS)),
    CLEANUP_INTERVAL_MS: parseInt(process.env.MIMOCODE_PROXY_CLEANUP_INTERVAL_MS) || fileConfig.CLEANUP_INTERVAL_MS || defaultConfig.CLEANUP_INTERVAL_MS,
    CLEANUP_MAX_AGE_MS: parseInt(process.env.MIMOCODE_PROXY_CLEANUP_MAX_AGE_MS) || fileConfig.CLEANUP_MAX_AGE_MS || defaultConfig.CLEANUP_MAX_AGE_MS
};

// Validate required configuration
if (!finalConfig.MIMOCODE_PATH) {
    console.error('[Error] MIMOCODE_PATH is not set. Please configure it in config.json or environment variable.');
    process.exit(1);
}

// Check if mimo is available
import { execSync } from 'child_process';
try {
    execSync(`"${finalConfig.MIMOCODE_PATH}" --version`, { stdio: 'ignore' });
} catch (e) {
    console.warn(`[Warning] Cannot verify MiMoCode installation: ${finalConfig.MIMOCODE_PATH}`);
    console.warn('[Warning] Please ensure MiMoCode is installed:');
    console.warn('  npm install -g @mimo-ai/cli');
    console.warn('  Linux/macOS: curl -fsSL https://mimo.xiaomi.com/install | bash');
    console.warn('[Warning] Or specify the full path in config.json:');
    console.warn('  { "MIMOCODE_PATH": "/path/to/mimo" }');
}

console.log('[Config] Starting MiMoCode2API with configuration:');
console.log(`  - Port: ${finalConfig.PORT}`);
console.log(`  - Bind Host: ${finalConfig.BIND_HOST}`);
console.log(`  - Backend: ${finalConfig.MIMOCODE_SERVER_URL}`);
console.log(`  - Backend Password: ${finalConfig.MIMOCODE_SERVER_PASSWORD ? 'Configured' : 'Not configured'}`);
console.log(`  - MiMoCode Path: ${finalConfig.MIMOCODE_PATH}`);
console.log(`  - API Key: ${finalConfig.API_KEY ? 'Configured' : 'Not configured (no auth)'}`);
console.log(`  - Disable Tools: ${finalConfig.DISABLE_TOOLS ? 'Yes' : 'No'}`);
console.log(`  - External Tools Mode: ${finalConfig.EXTERNAL_TOOLS_MODE}`);
console.log(`  - Prompt Mode: ${finalConfig.PROMPT_MODE}`);
console.log(`  - Debug: ${finalConfig.DEBUG ? 'Yes' : 'No'}`);

// Start the proxy
try {
    const proxy = startProxy(finalConfig);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n[Shutdown] Received SIGINT, shutting down gracefully...');
        proxy.killBackend();
        proxy.server.close(() => {
            console.log('[Shutdown] Server closed');
            process.exit(0);
        });
    });
    
    process.on('SIGTERM', () => {
        console.log('\n[Shutdown] Received SIGTERM, shutting down gracefully...');
        proxy.killBackend();
        proxy.server.close(() => {
            console.log('[Shutdown] Server closed');
            process.exit(0);
        });
    });
} catch (error) {
    console.error('[Fatal] Failed to start proxy:', error.message);
    process.exit(1);
}