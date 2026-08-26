# v17 Final Validation

## Authentication
- Health endpoint is independent of seed/login.
- Login no longer runs the full seed routine before credential verification.
- Admin account is ensured only during login and only writes Redis when needed. Catalog defaults are seeded separately after successful authentication.
- Successful login returns JWT and public user profile.
- Invalid credentials return HTTP 401.
- Missing DB/JWT configuration returns a clear HTTP 500.
- Frontend has a 15-second timeout and restores the button state in `finally`.

## Portal coverage
19 page sections were checked against navigation: home, learn, profile, skills, priority, funzone, knowledge, worlds, myday, abm, rm, region, games, battle, cricket, ludo, store, leader, admin.

## Backend
Duplicate route blocks removed. Core routes were mapped to frontend calls and protected by role checks where required.

## Static checks
- Duplicate HTML IDs: none expected.
- Frontend JavaScript syntax: validated with Node.
- API JavaScript syntax: validated with Node.
- package.json / vercel.json: valid JSON.

## Live deployment limitation
The private Vercel/Upstash environment cannot be validated from the package alone. After deployment, perform: Test Connection → Admin Login → Player Login → Player Registration → Profile Save → Admin Approval.
