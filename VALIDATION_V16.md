# v16 validation fixes

Fixed after v15 full audit:
- Dynamic My Day/World navigation buttons now use event delegation.
- Admin Command Centre, hierarchy and RM management refresh after Admin login.
- Added RM promotion/demotion and explicit ABM → RM assignment.
- Cricket Start button now refreshes cups; Ludo Roll button now gives clear action.
- Challenge links now use `/?challenge=<id>` and are reopened in Battle after login.
- Removed public exposure of ADMIN_EMAIL from health endpoint.
- Removed insecure fallback JWT/Admin secrets; production requires Vercel env variables.
- Priority poster upload restricted to images because the UI renders it as an image.
- Added explicit RM management UI.

Known scope limitation: Battle currently handles invitation/acceptance; a full server-authoritative question-by-question battle scoring engine is still a separate enhancement. Store purchase is functional, but a full personalized poster editor remains a next-phase feature.
