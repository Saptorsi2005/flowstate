/**
 * api/auth/device-start.js — POST /api/auth/device-start
 *
 * Initiates Auth0 Device Authorization Flow for the Chrome extension.
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const CLIENT_ID = process.env.AUTH0_EXTENSION_CLIENT_ID;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

export default async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!AUTH0_DOMAIN || !CLIENT_ID) {
        res.status(500).json({ error: 'Auth not configured' });
        return;
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
            res.status(502).json({
                error: data.error_description || 'Auth0 device flow failed',
            });
            return;
        }

        res.status(200).json({
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri_complete ?? data.verification_uri,
            expiresIn: data.expires_in,
            interval: data.interval,
        });

    } catch (err) {
        console.error('[device-start] Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
