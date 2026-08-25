# v9 — ABM TEAM PERFORMANCE PORTAL

## ABM role
Admin can promote an approved player to `abm`. The account gets:
- 📊 ABM Dashboard
- Team leaderboard
- Team member count
- Active in last 7 days
- Average XP
- Total XP
- Participation count
- Activity breakdown
- Player-level progress
- Wins, battles, streak and activity status

## Team assignment
Players are linked to an ABM through the standard profile master `ABM Name` or `profile.abm_id`.
For a stronger controlled hierarchy, the next version can let Admin explicitly assign each player to an ABM account from an Admin dropdown.

## Activity tracking
The backend records participation counters for:
- LBL
- Skill Lab
- Cricket
- Ludo
- Challenges sent
- Challenges accepted

The dashboard is designed to show engagement rather than just XP.

## Security
Only `role=abm` can call `/api/abm/dashboard` and `/api/abm/team`.
Only Admin can promote/demote ABMs.

## Recommended next upgrades
- Explicit Admin player-to-ABM assignment
- RM dashboard
- Region dashboard
- Weekly email/WhatsApp summary
- Heatmap of participation
- At-risk player alerts
- Export Excel report
- Team-vs-team Cricket Cup analytics
