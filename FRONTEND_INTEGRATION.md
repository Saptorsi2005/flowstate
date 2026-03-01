# FlowState Frontend — Auth0 Integration

This document describes the Auth0 integration for the FlowState React frontend.

## Overview

The frontend is now integrated with:
- **Auth0 Universal Login** for authentication
- **Protected Routes** that require authentication
- **Real data** from the Vercel backend (`/api/dashboard` and `/api/profile`)
- **JWT token-based API calls** to the backend

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `frontend` directory:

```env
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id_here
VITE_AUTH0_AUDIENCE=https://api.flowstate.app
VITE_API_URL=https://your-backend.vercel.app
```

**Important**: The `VITE_AUTH0_CLIENT_ID` must be for a **Single Page Application (SPA)** in Auth0, NOT the device flow client used by the extension.

### 3. Auth0 Configuration

In your Auth0 dashboard:

#### Create SPA Application

1. Go to **Applications** → **Create Application**
2. Name: "FlowState Web Dashboard"
3. Type: **Single Page Application**
4. Settings:
   - **Allowed Callback URLs**: 
     - `http://localhost:5173`
     - `https://your-frontend-domain.com`
   - **Allowed Logout URLs**: 
     - `http://localhost:5173`
     - `https://your-frontend-domain.com`
   - **Allowed Web Origins**: 
     - `http://localhost:5173`
     - `https://your-frontend-domain.com`

#### API Setup

Make sure you have an API configured:
- **Identifier**: `https://api.flowstate.app` (this is your audience)
- **Signing Algorithm**: RS256

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Architecture

### Authentication Flow

1. **Landing Page** (`/`) — Shows login button
2. User clicks "Login/Sign Up" → Redirected to Auth0 Universal Login
3. After authentication → Redirected back to `/home`
4. **Protected Routes** (`/home`, `/profile`) — Require authentication

### API Communication

All API calls include the Auth0 access token:

```javascript
const token = await getAccessTokenSilently();
const response = await fetch(`${API_URL}/api/dashboard`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

The backend verifies the token using `lib/auth.js` and extracts the user's `sub` (Auth0 user ID).

### Key Components

#### `main.jsx`
Wraps the app in `<Auth0Provider>` with required configuration.

#### `ProtectedRoute.jsx`
- Checks if user is authenticated
- Shows loading spinner while checking
- Redirects to login if not authenticated

#### `Landing.jsx`
- Public landing page
- Triggers Auth0 login flow
- Auto-redirects to `/home` if already authenticated

#### `Home.jsx` (Dashboard)
- Fetches data from `/api/dashboard`
- Shows:
  - Today's deep work minutes
  - Completion rate (from todos)
  - Focus score
  - Current streak
  - Weekly performance chart
  - Workspace list

#### `Profile.jsx`
- Fetches data from `/api/profile`
- Shows:
  - User name and email
  - Total workspaces
  - Total deep work hours
  - Today's focus score
  - Current streak
  - Activity heatmap

#### `Sidebar.jsx`
- Shows authenticated user's name (initials)
- Logout button
- Navigation links

## API Endpoints

### GET /api/dashboard

Returns:
```json
{
  "user": {
    "id": "auth0|...",
    "email": "user@example.com",
    "name": "User Name"
  },
  "workspaces": [...],
  "weeklyData": [
    {"day": "Mon", "value": 75, "date": "2026-02-24"},
    ...
  ],
  "stats": {
    "totalWorkspaces": 3,
    "totalSavedTabs": 15,
    "totalDeepWorkMinutes": 240,
    "todayFocusScore": 82,
    "weeklyAverageFocusScore": 78,
    "totalBlockedAttemptsToday": 5,
    "currentStreak": 7,
    "completionRate": 65
  }
}
```

### GET /api/profile

Returns:
```json
{
  "user": {
    "id": "auth0|...",
    "email": "user@example.com",
    "name": "User Name",
    "created_at": "2026-01-15T10:30:00Z"
  },
  "stats": {
    "totalWorkspaces": 3,
    "totalDeepWorkHours": 42,
    "todayFocusScore": 82,
    "currentStreak": 7
  }
}
```

## Important Notes

### 🚨 DO NOT Break Extension

- The extension uses **Device Code Flow** with a different Auth0 client
- The backend still accepts tokens from both clients (same tenant)
- The extension syncs data to the same database tables
- The frontend only **reads** this data

### Token Verification

Both the extension (device flow) and frontend (SPA) tokens are verified by the backend using the same JWKS endpoint:

```javascript
// backend/lib/auth.js
const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);
```

Since both clients are in the same Auth0 tenant and use the same API audience, tokens from both are valid.

### User Identification

Users are identified by their Auth0 `sub` field (e.g., `auth0|abc123`). This same ID is used across:
- Extension sync
- Frontend authentication
- Database queries

## Deployment

### Frontend (Vercel/Netlify)

1. Set environment variables in your hosting platform
2. Deploy the built frontend
3. Add production URLs to Auth0 callback/logout URLs

### Backend

No changes needed! The backend already supports JWT verification and CORS for the frontend.

## Files Modified/Created

### Created:
- `frontend/.env.example` — Environment variable template
- `frontend/src/components/ProtectedRoute.jsx` — Route protection
- `backend/api/profile.js` — User profile endpoint

### Modified:
- `frontend/src/main.jsx` — Added Auth0Provider
- `frontend/src/App.jsx` — Updated routing with protected routes
- `frontend/src/pages/Landing.jsx` — Auth0 login integration
- `frontend/src/pages/Home.jsx` — Real data fetching from `/api/dashboard`
- `frontend/src/pages/Profile.jsx` — Real data fetching from `/api/profile`
- `frontend/src/components/Sidebar.jsx` — Auth0 user info and logout
- `backend/api/dashboard.js` — Enhanced with streak, weekly data, completion rate

### Removed:
- `frontend/src/pages/Login.jsx` — Replaced by Auth0 Universal Login
- `frontend/src/pages/Signup.jsx` — Replaced by Auth0 Universal Login
- `frontend/src/layouts/AuthLayout.jsx` — No longer needed (can be removed if unused)

## Troubleshooting

### "Invalid token" errors
- Verify `VITE_AUTH0_AUDIENCE` matches the backend's `AUTH0_AUDIENCE`
- Check that the SPA client is configured correctly in Auth0

### CORS errors
- Ensure `VITE_API_URL` points to the correct backend URL
- Backend already has CORS headers configured

### Data not loading
- Check browser console for errors
- Verify the backend `/api/dashboard` and `/api/profile` endpoints are accessible
- Ensure user has synced data from the extension first

### Redirect loop
- Check Auth0 callback URLs are correctly configured
- Clear browser cache and cookies

## Next Steps

1. ✅ Set up Auth0 SPA application
2. ✅ Configure environment variables
3. ✅ Deploy frontend
4. ✅ Test authentication flow
5. ✅ Verify data syncing from extension to dashboard
