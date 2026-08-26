# v15 Admin Login Diagnostic

v15 fixes the specific failure mode where Admin login stays on “Signing in…” because the API waits on Redis before returning.

## Changes
- `/api/health` is evaluated BEFORE database seed and admin initialization.
- Redis GET/SET operations have a 7-second server-side timeout.
- Test Connection now displays database/admin configuration status in the login modal.
- Admin Login calls health first and autofills the configured ADMIN_EMAIL.
- Login still uses ADMIN_EMAIL / ADMIN_PASSWORD from Vercel.

## Interpretation
- `Database connected` → KV is reachable; Admin login should return a credential error quickly if the email/password is wrong.
- `Database environment variables are missing` → add KV_REST_API_URL and KV_REST_API_TOKEN (or STORAGE_KV_REST_API_URL / STORAGE_KV_REST_API_TOKEN) to Vercel Production.
- `Redis GET ... timed out` → the configured Upstash URL/token is incorrect or unreachable.
- `Invalid credentials` → database works; fix ADMIN_EMAIL/ADMIN_PASSWORD.
