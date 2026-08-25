# ALKEM DIABETOLOGY — MEDICO MARKETING ARENA
## Vercel + GitHub Ready Edition

This version is structured specifically for GitHub → Vercel deployment.

### Important
The previous SQLite/Express package is **not suitable for Vercel production persistence** because Vercel Functions have a read-only filesystem except for temporary `/tmp`. This edition uses **Upstash Redis through the Vercel Marketplace** for persistent team data.

Vercel documents that Node.js Functions are deployed from the `/api` directory, and its filesystem is read-only; Vercel recommends a database or managed storage for persistent writes.

## Deploy from GitHub

1. Create a new GitHub repository.
2. Upload the contents of this folder (not the ZIP file itself) to the repository.
3. In Vercel: Add New → Project → Import your GitHub repository.
4. Deploy.

Vercel automatically detects the project and deploys the `/api` serverless function.

## Add persistent storage

After creating the Vercel project:

1. Open the Vercel project.
2. Go to **Storage / Marketplace**.
3. Install **Upstash Redis**.
4. Link the Redis database to this project.
5. Vercel will provide the Redis environment variables.
6. Add:
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
7. Redeploy.

The app expects:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## First login

The admin account is created automatically on the first API call if the Redis store has no users.

Use the exact `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in Vercel.

Immediately change the default credentials from the example values.

## Features
- Player registration/login
- Persistent XP and coins
- Product Master
- Monthly LBL Game Factory
- Timed LBL puzzle
- Accuracy + speed scoring
- Player challenges
- WhatsApp challenge-link sharing
- Cricket Cup
- Answer Cricket: answer quality becomes runs/wickets
- Answer Ludo: the correct answer number becomes the movement number
- Store
- Winner Wall
- Admin statistics

## Ludo rule
The Ludo screen presents six numbered answer choices. The correct answer's number is the number of spaces the token moves.

Example:
- Correct option #4 → move 4 spaces.
- Correct option #6 → move 6 spaces.
- Wrong answer → no move.

## WhatsApp
The app creates a secure challenge token URL and opens a WhatsApp share with that URL. This is a user-initiated share flow. Fully automated outbound WhatsApp notifications require an official WhatsApp Business Platform/API setup.

## Player photos / posters
The current demo keeps the player's photo in browser local storage for the creative experience. For cross-device permanent photo storage, add Vercel Blob or another object-storage provider.

## Medical/marketing content
Replace every demo scientific statement with your approved training content before using it with the team.

## Local development

Install:
```bash
npm install
```

Then:
```bash
npx vercel dev
```

If you use local Redis credentials, put them in `.env.local`.

## Continuous deployment
Once GitHub is connected to Vercel, pushes to the configured production branch can trigger new deployments automatically. Preview deployments can be used for testing changes before production.
