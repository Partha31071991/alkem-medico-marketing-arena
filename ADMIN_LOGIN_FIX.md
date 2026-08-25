# v13 Admin Login Fix

## Root cause
The previous seed logic created the Admin account only when the Redis users list was empty. If any Player registered first, the Admin account was never created.

## Fix
Every API request now ensures the configured `ADMIN_EMAIL` account exists and has role `admin`. The configured `ADMIN_PASSWORD` is applied to that account.

## Vercel variables
Set these in Production (and Preview if needed):
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Recommended example:
`ADMIN_EMAIL=admin@team.local`
`ADMIN_PASSWORD=<your private 8+ character password>`

Do not put the password in the frontend or GitHub.

## Login
Use the new **Admin / ABM Login** button. It opens the sign-in form. Enter the exact `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in Vercel.

## Important
After deploying v13, open the site in an Incognito window or clear the old `arena_token` from the browser if a previous session is cached.
