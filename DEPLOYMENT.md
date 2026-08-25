# 10-minute GitHub → Vercel deployment

## A. GitHub

Create a repository such as:
`alkem-medico-marketing-arena`

Upload these files/folders:
- `api/`
- `public/`
- `package.json`
- `vercel.json`
- `.env.example`
- `.gitignore`
- `README.md`

Do NOT upload `.env` or real passwords.

## B. Vercel

Import the GitHub repository from:
https://vercel.com/new

Leave the project root as `/`.

## C. Persistent database

In the Vercel project, open Storage / Marketplace and add **Upstash Redis**.

The app uses:
`KV_REST_API_URL`
`KV_REST_API_TOKEN`

## D. Environment variables

Add:
`JWT_SECRET` = a long random secret
`ADMIN_EMAIL` = your admin email
`ADMIN_PASSWORD` = your private admin password

Redeploy after saving variables.

## E. Open your Vercel URL

The result will be a normal web link you can share with your team.

## F. WhatsApp challenge

Player A:
Battle → select player → Challenge

The browser opens WhatsApp with a challenge URL.

Player B:
Tap link → login → return to challenge.

## G. Monthly LBL

Admin → Master → create monthly LBL:
- Month/year
- Product
- Tagline options
- Correct tagline
- Indication options
- Correct indication
- Visual options
- Correct visual
- Message options
- Correct message
- Time
- XP reward

Publish.

## H. Cricket Cup

Admin → Master → Cricket Cup.

Players answer questions:
6 = excellent/correct
4 = good
1 = weak
0 = wicket

## I. Answer Ludo

Ludo presents six numbered answers. The correct answer number becomes the movement number.
