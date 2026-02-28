/**
 * lib/auth.js — Auth0 JWT verification using JWKS
 *
 * Uses `jose` (pure ESM, works in Vercel Edge Runtime).
 * JWKs are fetched and cached automatically by `createRemoteJWKSet`.
 * No Auth0 SDK needed — raw JWT verification only.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
    console.warn('[FlowState Auth] AUTH0_DOMAIN or AUTH0_AUDIENCE not set');
}

// JWKS is cached in module scope — only fetched once per Edge Runtime instance
let _JWKS = null;
function getJWKS() {
    if (!_JWKS) {
        _JWKS = createRemoteJWKSet(
            new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
        );
    }
    return _JWKS;
}

/**
 * Verify an Authorization: Bearer <token> header.
 * Returns the decoded JWT payload on success.
 * Throws on invalid/expired token.
 *
 * @param {Request} req - Vercel/Fetch API Request object
 * @returns {Promise<{sub: string, email?: string}>}
 */
export async function verifyRequest(req) {
    const authHeader = req.headers.get
        ? req.headers.get('authorization')        // Fetch API (Edge)
        : req.headers['authorization'];           // Node.js IncomingMessage

    if (!authHeader?.startsWith('Bearer ')) {
        throw new AuthError('Missing or malformed Authorization header', 401);
    }

    const token = authHeader.slice(7);

    try {
        const { payload } = await jwtVerify(token, getJWKS(), {
            audience: AUTH0_AUDIENCE,
            issuer: `https://${AUTH0_DOMAIN}/`,
        });

        return {
            sub: payload.sub,              // e.g. "auth0|abc123"
            email: payload.email ?? null,
        };
    } catch (err) {
        if (err.code === 'ERR_JWT_EXPIRED') {
            throw new AuthError('Token expired', 401);
        }
        throw new AuthError(`Invalid token: ${err.message}`, 401);
    }
}

/**
 * Structured auth error with HTTP status code.
 */
export class AuthError extends Error {
    constructor(message, status = 401) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
    }
}

/**
 * CORS preflight handler — call at top of every API route.
 * Returns a Response for OPTIONS requests, or null for other methods.
 */
export function handleCors(req) {
    const origin = req.headers.get
        ? req.headers.get('origin')
        : req.headers['origin'];

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Checksum',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return corsHeaders; // Caller merges these into their response headers
}
