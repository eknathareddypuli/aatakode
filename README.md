# AataKode (ఆటకోడ్)

Free, offline-first, gamified coding academy. **Aata** = "play" in Telugu. Live at https://aatakode.eknathalabs.com

No sign-up, no ads, no tracking. Progress lives in your browser; Python runs in your browser via Pyodide.

## What's in
- **Python Quest** (16 missions, 5 regions) and **Debug the Outage** (4 simulated-terminal missions)
- Instant play, editor with tests and friendly errors, map with unlocking and test-out bosses
- XP, ranks (English + Telugu), streak with freezes, badges, skills
- 3-level hints plus free Socratic questions, explain-it bonus
- Solution comparison after solving, bug-fix boss per region, Outage of the Week
- Step-through visualizer, block view, EN/Telugu interface
- Offline teacher dashboard (student cards, class table, CSV). Self-reported, not for exams.
- Export/import progress, PWA with service worker

Not built yet (premium/P2): cloud sync, AI tutor, human review, leagues, certificates. See `docs/ROADMAP.md`.

## Develop
```
python3 build.py                      # writes index.html + sw.js from src/ and missions/
cd tests && npm ci && node verify.mjs # runs every reference solution in real Python
python3 -m http.server                # open http://localhost:8000
```
`index.html` and `sw.js` are generated and committed so GitHub Pages can serve the repo root.

## Add a mission
Drop a JSON file in `missions/<region>/`. See `docs/MISSION_FORMAT.md` and `CONTRIBUTING.md`. CI fails if a solution doesn't pass or the starter already does.

MIT licensed.
