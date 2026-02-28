# FlowState Backend

Backend API for FlowState — a passive analytics mirror for the Chrome extension.

## Stack
- **Runtime**: Vercel Serverless Functions (Node.js 20)
- **Database**: Neon Postgres (`@neondatabase/serverless`)
- **Auth**: Auth0 JWKS JWT verification (`jose`)
- **No WebSockets, no persistent server**

## Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in DATABASE_URL, AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_EXTENSION_CLIENT_ID
```

### 3. Run database migration
```bash
npm run migrate
```

### 4. Run locally
```bash
npm run dev
# Starts Vercel dev server at http://localhost:3000
```

### 5. Deploy to Vercel
```bash
npx vercel --prod
```

## Auth0 Setup

1. Go to [Auth0 Dashboard](https://manage.auth0.com)
2. Create a new **API** with identifier `https://api.flowstate.app`
3. Create a **Native Application** (for the Chrome extension Device Flow)
   - Enable "Device Code" grant type
   - Copy `Client ID` → `AUTH0_EXTENSION_CLIENT_ID`
4. Create a **Single Page Application** (for the React dashboard)
   - Set Allowed Callback URLs to your frontend domain
   - Use the same API audience

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/sync` | JWT | Ingest workspace + session + block data from extension |
| `GET`  | `/api/dashboard` | JWT | Fetch dashboard data for React frontend |
| `POST` | `/api/auth/device-start` | None | Start Auth0 Device Flow |
| `POST` | `/api/auth/device-poll` | None | Poll for Device Flow completion |

## Architecture Guarantees

- ✅ Extension works **100% offline** — backend is optional
- ✅ All writes are **idempotent** (upserts + checksum dedup)
- ✅ Backend **never writes back** to the extension
- ✅ Extension's `chrome.storage.local` remains source of truth
- ✅ Sync failures are silent — extension queues and retries
