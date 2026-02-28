/**
 * api/auth/device-start.js — POST /api/auth/device-start
 *
 * Initiates Auth0 Device Authorization Flow for the Chrome extension.
 * The extension can't use redirect_uri-based flows (no browser page to return to).
 * Device Flow is the correct OAuth2 grant for extensions.
 *
 * Flow:
 *   1. Extension calls this endpoint (no auth required)
 *   2. We call Auth0 /oauth/device/code
 *   3. Return device_code, user_code, verification_uri to extension
 *   4. Extension shows user_code in popup + opens verification_uri
 *   5. User logs in on verification page
 *   6. Extension polls /api/auth/device-poll until approved
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const CLIENT_ID = process.env.AUTH0_EXTENSION_CLIENT_ID;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(204).set(CORS_HEADERS).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!AUTH0_DOMAIN || !CLIENT_ID) {
        return res.status(500).set(CORS_HEADERS).json({ error: 'Auth not configured' });
    }

    try {
        const auth0Res = await fetch(`https://${AUTH0_DOMAIN}/oauth/device/code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                scope: 'openid profile email',
                audience: AUTH0_AUDIENCE,
            }),
        });

        const data = await auth0Res.json();

        if (!auth0Res.ok) {
            console.error('[device-start] Auth0 error:', data);
            return res.status(502).set(CORS_HEADERS).json({
                error: data.error_description || 'Auth0 device flow failed',
            });
        }

        // Return only what the extension needs
        return res.status(200).set(CORS_HEADERS).json({
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri_complete ?? data.verification_uri,
            expiresIn: data.expires_in,       // seconds
            interval: data.interval,          // polling interval in seconds
        });

    } catch (err) {
        console.error('[device-start] Error:', err);
        return res.status(500).set(CORS_HEADERS).json({ error: 'Internal server error' });
    }
}
