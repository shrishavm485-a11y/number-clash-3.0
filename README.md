# NUMBER CLASH
Brutalist multiplayer number game. Node + Express + Socket.IO, plain HTML/CSS/JS (no build step).

## Run locally (Windows PowerShell)
```powershell
node -v          # needs 18 or newer
cd number-clash
npm install
npm start
```
Open http://localhost:3000. Open a second browser window (or a phone on the same Wi-Fi at http://YOUR-PC-IP:3000) to play.

## Push to GitHub
```powershell
git init
git add .
git commit -m "NUMBER CLASH"
git branch -M main
git remote add origin https://github.com/YOUR-USER/number-clash.git
git push -u origin main
```
(Create the empty repo first on github.com.)

## Deploy on Render
1. render.com -> New -> **Web Service** -> connect the GitHub repo.
2. Runtime: Node. **Build command:** `npm install`  **Start command:** `npm start`
3. Deploy, then open the public URL. Free-plan limits and sleeping (first load can be slow after idle) depend on Render's current plan.

## Test on real devices
Create a room on one phone, send the invite link or 4-letter code to others, tap READY on each, host taps START. Try a 9th device (should be refused), refresh mid-lobby (should rejoin), and toggle Quiet Mode.

## Manual checklist
- [ ] 2 players finish a full match   - [ ] 9th player rejected   - [ ] bad code rejected
- [ ] only host can change settings/start   - [ ] one correct answer scores once
- [ ] reactions hidden by Quiet Mode / HIDE REACTIONS (only on that device)
- [ ] refresh keeps you in the room   - [ ] host leaves -> host transfers

## Limitations / next steps
- Rooms are **in memory**: a server restart or Render sleep erases them. Scaling to several servers needs the Socket.IO Redis adapter plus shared storage (e.g. PostgreSQL).
- MVP ships 2 modes: GUESS THE NUMBER and MISSING NUMBER (+ Random). Next stages: Closest Wins, Number Sprint, Odd One Out, Secret Target.
- Not yet built: Solo mode, background music, chat, vibration, achievements, saved personal stats.
- Not yet tested in a live browser session by the author; run the checklist above.
