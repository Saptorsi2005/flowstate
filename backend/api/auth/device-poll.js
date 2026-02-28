/**
 * api/auth/device-poll.js — POST /api/auth/device-poll
 *
 * Extension polls this endpoint every `interval` seconds (from device-start response)
 * to check if the user has completed login on the verification page.
 *
 * Responses:
 *   { status: 'pending' }                   — User hasn't approved yet
 *   { status: 'approved', accessToken: ... } — User approved, JWT ready
 *   { status: 'expired' }                   — device_code timed out
 *   { status: 'error', error: ... }         — Something went wrong
 *
 * The extension stores the accessToken in chrome.storage.local as `syncJwt`.
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const CLIENT_ID = process.env.AUTH0_EXTENSION_CLIENT_ID;

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

    const { deviceCode } = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

    if (!deviceCode) {
        return res.status(400).set(CORS_HEADERS).json({ error: 'deviceCode is required' });
    }

    try {
        const auth0Res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
        });

        const data = await auth0Res.json();

        // Still waiting for user to approve
        if (data.error === 'authorization_pending') {
            return res.status(200).set(CORS_HEADERS).json({ status: 'pending' });
        }

        // Polling too fast (extension should use interval from device-start)
        if (data.error === 'slow_down') {
            return res.status(200).set(CORS_HEADERS).json({ status: 'pending' });
        }

        // Device code expired — user took too long
        if (data.error === 'expired_token') {
            return res.status(200).set(CORS_HEADERS).json({ status: 'expired' });
        }

        // User denied access
        if (data.error === 'access_denied') {
            return res.status(200).set(CORS_HEADERS).json({ status: 'denied' });
        }

        // Any other Auth0 error
        if (data.error) {
            console.error('[device-poll] Auth0 error:', data);
            return res.status(200).set(CORS_HEADERS).json({
                status: 'error',
                error: data.error_description || data.error,
            });
        }

        // ✅ Approved — return the access token
        return res.status(200).set(CORS_HEADERS).json({
            status: 'approved',
            accessToken: data.access_token,
            expiresIn: data.expires_in,
        });

    } catch (err) {
        console.error('[device-poll] Error:', err);
        return res.status(500).set(CORS_HEADERS).json({ error: 'Internal server error' });
    }
}
