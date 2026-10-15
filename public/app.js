const socket = io(), app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let S = null, conn = false, tray = false, showSet = false, busy = false, codeDraft = '';
let P = Object.assign({ sound: true, reactions: true, quiet: false }, JSON.parse(localStorage.getItem('nc_p') || '{}'));
let sess = JSON.parse(localStorage.getItem('nc_s') || 'null');
const saveP = () => { localStorage.setItem('nc_p', JSON.stringify(P)); document.body.classList.toggle('quiet', P.quiet); };
const toast = m => { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3500); };
const rxOn = () => P.reactions && !P.quiet;
let ac;
function beep(f = 520) {
  if (!P.sound || P.quiet) return;
  try { ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = .05; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .1); } catch (e) {}
}
const copy = t => navigator.clipboard.writeText(t).then(() => toast('Copied!'), () => toast('Copy failed'));
const secs = () => S ? Math.ceil(Math.max(0, S.ms - (Date.now() - S.at)) / 1000) : 0;
const sorted = () => [...S.players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));

function enter(ev, d) {
  socket.emit(ev, d, r => {
    if (!r || !r.ok) return toast((r && r.msg) || 'Could not join.');
    sess = { code: r.code, token: r.token }; localStorage.setItem('nc_s', JSON.stringify(sess));
  });
}
socket.on('connect', () => {
  conn = true;
  if (sess) socket.emit('rejoin', sess, r => { if (!r || !r.ok) { sess = null; S = null; localStorage.removeItem('nc_s'); render(); } });
  render();
});
socket.on('disconnect', () => { conn = false; render(); });
socket.on('state', s => { const prev = S; S = s; S.at = Date.now(); if (prev && prev.phase !== s.phase) beep(s.phase === 'final' ? 880 : 520); render(); });
socket.on('reaction', m => {
  if (!rxOn() || !S) return; const p = S.players.find(x => x.id === m.id); if (!p) return;
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = m.e + ' ' + p.name;
  document.getElementById('rx').appendChild(el); setTimeout(() => el.remove(), 2000);
});
setInterval(() => { const t = document.getElementById('timer'); if (t && S) t.textContent = secs(); }, 200);

function render() {
  const i = document.getElementById('ans'), v = i && i.value, f = i && document.activeElement === i;
  app.innerHTML = (conn ? '' : '<div class="bar warn" role="status">RECONNECTING…</div>') + (S ? game() : home());
  const n = document.getElementById('ans');
  if (n) { if (v != null) n.value = v; if (f || v == null) n.focus(); }
}
function settingsPanel() {
  if (!showSet) return '';
  const t = (a, l, on) => `<button data-a="${a}" aria-pressed="${on}">${l}: ${on ? 'ON' : 'OFF'}</button>`;
  return `<div class="modal" role="dialog" aria-label="Settings"><div><h2>Settings</h2>
  ${t('tsound', 'SOUND EFFECTS', P.sound)}${t('trx', 'INCOMING REACTIONS', P.reactions)}${t('tquiet', 'QUIET MODE', P.quiet)}
  <p>Quiet Mode mutes sound, hides reactions and stops animations. Only affects this device.</p>
  <button data-a="closeset">CLOSE</button></div></div>`;
}
function home() {
  const q = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  return `<main class="wrap"><h1 class="logo">NUMBER<br>CLASH</h1><p class="lead">Think fast. Pick smart. Beat your friends.</p>
  <span class="tag">2–8 PLAYERS · ONLINE</span>
  <label>USERNAME<input id="name" maxlength="12" autocomplete="nickname" value="${esc(localStorage.getItem('nc_n') || '')}"></label>
  <button data-a="create">CREATE ROOM</button>
  <label>ROOM CODE<input id="code" maxlength="4" autocapitalize="characters" value="${esc(codeDraft || q)}"></label>
  <button class="alt" data-a="join">JOIN ROOM</button>
  <button data-a="settings">SETTINGS</button>
  <section><h2>How to play</h2><ol><li>Create a room and share the code.</li><li>Everyone taps READY; host starts.</li>
  <li>Correct answer = 100 pts + up to 100 speed bonus.</li><li>Most points after the last round wins.</li></ol></section></main>${settingsPanel()}`;
}
function sel(id, o, v, host) {
  return `<label>${id.toUpperCase()}<select id="s_${id}" ${host ? '' : 'disabled'}>${o.map(x => `<option value="${x[0]}" ${String(x[0]) === String(v) ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></label>`;
}
function body() {
  const host = S.host === S.you, me = S.players.find(p => p.id === S.you) || {}, st = S.settings, n = S.players.length;
  if (S.phase === 'lobby') return `<h2>${n}/8 PLAYERS</h2><div class="code" aria-label="Room code">${S.code}</div>
  <div class="row"><button data-a="copy">COPY ROOM CODE</button><button data-a="share">SHARE INVITE</button></div>
  ${sel('mode', [['random', 'Random mode'], ['guess', 'Guess the number'], ['missing', 'Missing number']], st.mode, host)}
  ${sel('rounds', [[3, '3 rounds'], [5, '5 rounds'], [10, '10 rounds']], st.rounds, host)}
  ${sel('timer', [[15, '15 sec'], [20, '20 sec'], [30, '30 sec']], st.timer, host)}
  ${sel('diff', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], st.diff, host)}
  ${n < 2 ? '<p class="tag">WAITING FOR AT LEAST 2 PLAYERS…</p>' : ''}
  ${host ? '<button class="alt" data-a="start">START GAME</button>' : `<button data-a="ready" aria-pressed="${!!me.ready}">${me.ready ? 'READY ✓ (TAP TO UNREADY)' : 'I AM READY'}</button>`}
  <button data-a="leave">LEAVE ROOM</button>`;
  if (S.phase === 'countdown') return `<p class="tag">ROUND ${S.round}/${st.rounds} · GET READY</p><div class="big" id="timer">${secs()}</div>`;
  if (S.phase === 'round') {
    const last = S.guesses[S.guesses.length - 1], good = last && last.h === 'ok';
    const hs = { higher: '▲ HIGHER', lower: '▼ LOWER', ok: '✓ CORRECT', wrong: '✗ WRONG' };
    return `<div class="row"><span class="tag">ROUND ${S.round}/${st.rounds}</span><span class="big" id="timer">${secs()}</span></div><h2>${esc(S.q.text)}</h2>
    ${S.q.seq ? `<div class="seq">${S.q.seq.map(x => `<span>${x}</span>`).join('')}</div>` : ''}
    ${S.done ? `<p class="tag">${good ? 'CORRECT ✓' : 'NO TRIES LEFT'} — WAITING FOR OTHERS</p>`
      : '<form id="f"><input id="ans" inputmode="numeric" autocomplete="off" aria-label="Your answer" required><button class="alt">SUBMIT</button></form>'}
    <ul class="hints">${S.guesses.map(g => `<li>${g.n} — ${hs[g.h]}</li>`).join('')}</ul>
    <small>Score: 100 + up to 100 speed bonus. Max ${S.q.mode === 'guess' ? 12 : 3} tries.</small>`;
  }
  const ans = `<p class="tag">ANSWER</p><div class="big">${S.reveal.answer}</div>`;
  if (S.phase === 'reveal') return ans + '<p>Next round starting…</p>';
  const top = sorted().slice(0, 3).map((p, i) => `<li>${['1ST', '2ND', '3RD'][i]} — ${esc(p.name)} (${p.score})</li>`).join('');
  return `${ans}<h2>FINAL RESULTS</h2><ol class="hints">${top}</ol>
  ${host ? '<button class="alt" data-a="rematch">REMATCH</button>' : '<p>Waiting for host to rematch…</p>'}
  <button data-a="summary">COPY MATCH SUMMARY</button><button data-a="leave">LEAVE ROOM</button>`;
}
function board() {
  return `<section><h2>Scoreboard</h2><ol class="board">${sorted().map((p, i) => `<li><b>#${i + 1}</b><i class="sw" style="background:${p.color}"></i>
  <span>${esc(p.name)}${p.id === S.you ? ' (YOU)' : ''}${p.id === S.host ? ' ★HOST' : ''}</span>
  <small>${!p.connected ? 'OFFLINE' : S.phase === 'lobby' ? (p.ready ? 'READY ✓' : 'NOT READY') : p.done ? 'DONE ✓' : ''}</small>
  <b>${p.score}</b>${p.rs ? `<em>+${p.rs}</em>` : ''}</li>`).join('')}</ol></section>`;
}
function game() {
  const emo = ['😂', '🔥', '😱', '👏', '💀', '😎', '🤯', '❤️'];
  return `<header class="top"><b>NUMBER CLASH · ${S.code}</b><button data-a="tquiet" aria-pressed="${P.quiet}">QUIET ${P.quiet ? 'ON' : 'OFF'}</button><button data-a="settings">SETTINGS</button></header>
  ${P.quiet ? '<div class="bar">QUIET MODE ACTIVE</div>' : ''}<main class="wrap">${body()}${board()}</main>
  <div class="dock"><button data-a="tray" aria-expanded="${tray}">REACT</button>
  ${tray ? emo.map(e => `<button class="emo" data-a="emo" data-e="${e}" aria-label="Send reaction ${e}">${e}</button>`).join('') +
    `<button data-a="trx" aria-pressed="${!P.reactions}">${P.reactions ? 'HIDE REACTIONS' : 'SHOW REACTIONS'}</button>` : ''}</div>${settingsPanel()}`;
}
app.oninput = e => { if (e.target.id === 'name') localStorage.setItem('nc_n', e.target.value); if (e.target.id === 'code') codeDraft = e.target.value.toUpperCase(); };
app.onchange = e => {
  if (!e.target.id || !e.target.id.startsWith('s_')) return;
  const g = k => document.getElementById('s_' + k).value;
  socket.emit('settings', { mode: g('mode'), rounds: +g('rounds'), timer: +g('timer'), diff: g('diff') });
};
app.onsubmit = e => {
  e.preventDefault(); const i = document.getElementById('ans'); if (!i || busy) return;
  const v = i.value.trim(); if (!/^-?\d+$/.test(v)) return toast('Enter a whole number.');
  busy = true; socket.emit('answer', +v); i.value = ''; setTimeout(() => busy = false, 300);
};
app.onclick = e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
  const nm = () => (document.getElementById('name') || {}).value || '';
  if (a === 'create') enter('create', { name: nm() });
  else if (a === 'join') enter('join', { name: nm(), code: (document.getElementById('code') || {}).value });
  else if (a === 'copy') copy(S.code);
  else if (a === 'share') { const url = location.origin + '/?room=' + S.code; navigator.share ? navigator.share({ title: 'NUMBER CLASH', text: 'Join my room ' + S.code, url }).catch(() => {}) : copy(url); }
  else if (a === 'ready') socket.emit('ready');
  else if (a === 'start') socket.emit('start', null, r => r && !r.ok && toast(r.msg));
  else if (a === 'rematch') socket.emit('rematch');
  else if (a === 'leave') socket.emit('leave', () => { S = null; sess = null; localStorage.removeItem('nc_s'); history.replaceState(0, '', '/'); render(); });
  else if (a === 'summary') copy('NUMBER CLASH results: ' + sorted().map((p, i) => `#${i + 1} ${p.name} ${p.score}`).join(', '));
  else if (a === 'tray') { tray = !tray; render(); }
  else if (a === 'emo') socket.emit('reaction', b.dataset.e);
  else if (a === 'settings') { showSet = true; render(); }
  else if (a === 'closeset') { showSet = false; render(); }
  else if (a === 'tsound') { P.sound = !P.sound; saveP(); render(); }
  else if (a === 'trx') { P.reactions = !P.reactions; saveP(); if (!rxOn()) document.getElementById('rx').innerHTML = ''; render(); }
  else if (a === 'tquiet') { P.quiet = !P.quiet; saveP(); if (P.quiet) document.getElementById('rx').innerHTML = ''; render(); }
};
saveP(); render();
