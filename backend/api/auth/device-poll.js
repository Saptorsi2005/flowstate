/**
 * api/auth/device-poll.js — POST /api/auth/device-poll
 *
 * Polls for Device Code Flow completion.
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const CLIENT_ID = process.env.AUTH0_EXTENSION_CLIENT_ID;

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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { deviceCode } = body ?? {};

    if (!deviceCode) {
        res.status(400).json({ error: 'deviceCode is required' });
        return;
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

        if (data.error === 'authorization_pending' || data.error === 'slow_down') {
            res.status(200).json({ status: 'pending' });
            return;
        }

        if (data.error === 'expired_token') {
            res.status(200).json({ status: 'expired' });
            return;
        }

        if (data.error === 'access_denied') {
            res.status(200).json({ status: 'denied' });
            return;
        }

        if (data.error) {
            console.error('[device-poll] Auth0 error:', data);
            res.status(200).json({
                status: 'error',
                error: data.error_description || data.error,
            });
            return;
        }

        // Approved
        res.status(200).json({
            status: 'approved',
            accessToken: data.access_token,
            expiresIn: data.expires_in,
        });

    } catch (err) {
        console.error('[device-poll] Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
