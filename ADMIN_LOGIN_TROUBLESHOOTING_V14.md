# v14 Admin Login Fix

## What changed
- Admin initialization is now separated from full seed data.
- Admin is ensured immediately before login.
- Added GET /api/health to verify Redis/Upstash connectivity without authentication.
- Frontend API calls now time out after 15 seconds instead of leaving "Signing in…" indefinitely.
- Admin login no longer hardcodes admin@team.local; enter the exact ADMIN_EMAIL configured in Vercel.
- Added Test Connection button in the Admin / ABM login modal.

## Live test
Open the portal, click Admin / ABM Login, click Test Connection.
Expected: "Database connected".
If it fails, the message identifies database/environment configuration.
