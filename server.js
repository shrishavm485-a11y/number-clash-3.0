const express = require('express'), http = require('http'), path = require('path'), crypto = require('crypto');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (q, s) => s.send('ok'));

const rooms = new Map(); // IN-MEMORY: lost on server restart
const COLORS = ['#d7ff3a', '#6f8bff', '#ff7a59', '#ffd23f', '#7ee8c1', '#c59bff', '#ff8fb1', '#bbbbbb'];
const MODES = ['guess', 'missing'], EMOJI = ['😂', '🔥', '😱', '👏', '💀', '😎', '🤯', '❤️'];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const hex = n => crypto.randomBytes(n).toString('hex');
const clean = s => String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 12);
const all = r => [...r.players.values()];

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c;
  do { c = Array.from({ length: 4 }, () => A[rnd(0, A.length - 1)]).join(''); } while (rooms.has(c));
  return c;
}
function guessQ() { return { mode: 'guess', answer: rnd(1, 100), text: 'Guess the secret number (1-100)' }; }
function missingQ(d) {
  const types = { easy: ['arith'], medium: ['arith', 'square', 'geo'], hard: ['geo', 'cube', 'fib', 'arith'] }[d] || ['arith'];
  const t = types[rnd(0, types.length - 1)]; let a;
  if (t === 'arith') { const s = rnd(2, d === 'hard' ? 19 : 9), b = rnd(1, 30); a = [0, 1, 2, 3, 4, 5].map(i => b + s * i); }
  else if (t === 'square') { const o = rnd(1, 6); a = [0, 1, 2, 3, 4, 5].map(i => (i + o) ** 2); }
  else if (t === 'cube') { const o = rnd(1, 4); a = [0, 1, 2, 3, 4].map(i => (i + o) ** 3); }
  else if (t === 'geo') { const r = d === 'hard' ? 3 : 2, b = rnd(1, 5); a = [0, 1, 2, 3, 4].map(i => b * r ** i); }
  else { a = [rnd(1, 5), rnd(2, 6)]; while (a.length < 6) a.push(a[a.length - 1] + a[a.length - 2]); }
  const i = rnd(t === 'fib' ? 2 : 0, a.length - 1);
  return { mode: 'missing', answer: a[i], text: 'Find the missing number', seq: a.map((v, k) => (k === i ? '?' : v)) };
}

function view(r, tok) {
  const me = r.players.get(tok);
  return {
    code: r.code, phase: r.phase, round: r.round, settings: r.settings, host: r.host, you: me && me.id,
    players: all(r).map(p => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, connected: p.connected, score: p.score, rs: p.rs, correct: p.correct, done: p.done })),
    q: r.q && { mode: r.q.mode, text: r.q.text, seq: r.q.seq },          // answer never sent during a round
    ms: r.endsAt ? Math.max(0, r.endsAt - Date.now()) : 0,
    reveal: r.phase === 'reveal' || r.phase === 'final' ? { answer: r.q.answer } : null,
    guesses: me ? me.guesses : [], done: me ? me.done : false
  };
}
function push(r) { for (const p of all(r)) if (p.sid) io.to(p.sid).emit('state', view(r, p.token)); }

function addPlayer(r, name) {
  const base = clean(name) || 'Player'; let n = base, k = 1;
  while (all(r).some(p => p.name.toLowerCase() === n.toLowerCase())) n = base.slice(0, 9) + ' ' + (++k);
  const used = all(r).map(p => p.color);
  const p = { id: hex(3), token: hex(12), name: n, color: COLORS.find(c => !used.includes(c)) || COLORS[0],
    ready: false, connected: true, score: 0, rs: 0, correct: 0, done: false, guesses: [] };
  r.players.set(p.token, p); return p;
}
function toLobby(r) {
  clearTimeout(r.t); r.phase = 'lobby'; r.round = 0; r.q = null; r.endsAt = 0;
  for (const p of all(r)) Object.assign(p, { score: 0, rs: 0, correct: 0, done: false, guesses: [], ready: p.id === r.host });
  push(r);
}
function nextRound(r) {
  r.round++; r.phase = 'countdown'; r.q = null; r.endsAt = Date.now() + 3000;
  for (const p of all(r)) Object.assign(p, { done: false, guesses: [], rs: 0 });
  push(r); r.t = setTimeout(() => beginRound(r), 3000);
}
function beginRound(r) {
  const m = r.settings.mode === 'random' ? MODES[rnd(0, MODES.length - 1)] : r.settings.mode;
  r.q = m === 'guess' ? guessQ() : missingQ(r.settings.diff);
  r.phase = 'round'; r.endsAt = Date.now() + r.settings.timer * 1000; push(r);
  r.t = setTimeout(() => endRound(r), r.settings.timer * 1000);
}
function endRound(r) {
  if (r.phase !== 'round') return; clearTimeout(r.t);
  r.phase = r.round >= r.settings.rounds ? 'final' : 'reveal'; r.endsAt = 0; push(r);
  if (r.phase === 'reveal') r.t = setTimeout(() => nextRound(r), 5000);
}
function checkAll(r) { const a = all(r).filter(p => p.connected); if (!a.length || a.every(p => p.done)) endRound(r); }
function newHost(r) { const c = all(r).find(x => x.connected) || all(r)[0]; r.host = c.id; c.ready = true; }
function drop(r, p) {
  clearTimeout(p.drop); r.players.delete(p.token);
  if (!r.players.size) { clearTimeout(r.t); clearTimeout(r.reap); rooms.delete(r.code); return; }
  if (r.host === p.id) newHost(r);
  if (r.phase !== 'lobby' && r.players.size < 2) return toLobby(r);
  if (r.phase === 'round') checkAll(r);
  push(r);
}

io.on('connection', s => {
  s.data = {}; const hits = {};
  const ok = (k, ms) => { const n = Date.now(); if (hits[k] && n - hits[k] < ms) return false; hits[k] = n; return true; };
  const ack = (cb, o) => typeof cb === 'function' && cb(o);
  const ctx = () => { const r = rooms.get(s.data.code); return { r, p: r && r.players.get(s.data.token) }; };
  const bind = (r, p) => {
    s.data = { code: r.code, token: p.token }; p.sid = s.id; p.connected = true;
    clearTimeout(p.drop); clearTimeout(r.reap); s.join(r.code);
  };

  s.on('create', (d, cb) => {
    if (!ok('c', 1000)) return;
    const r = { code: newCode(), players: new Map(), phase: 'lobby', round: 0, q: null, endsAt: 0,
      settings: { mode: 'random', rounds: 5, timer: 20, diff: 'medium' } };
    rooms.set(r.code, r); const p = addPlayer(r, d && d.name); r.host = p.id; p.ready = true;
    bind(r, p); ack(cb, { ok: true, code: r.code, token: p.token }); push(r);
  });
  s.on('join', (d, cb) => {
    if (!ok('j', 500) || !d) return;
    const r = rooms.get(String(d.code || '').toUpperCase().trim());
    if (!r) return ack(cb, { ok: false, msg: 'Room not found. Check the code.' });
    if (r.players.size >= 8) return ack(cb, { ok: false, msg: 'Room is full (8/8 players).' });
    if (r.phase !== 'lobby') return ack(cb, { ok: false, msg: 'Game already in progress.' });
    const p = addPlayer(r, d.name); bind(r, p); ack(cb, { ok: true, code: r.code, token: p.token }); push(r);
  });
  s.on('rejoin', (d, cb) => {
    const r = d && rooms.get(String(d.code)); const p = r && r.players.get(String(d.token));
    if (!p) return ack(cb, { ok: false });
    bind(r, p); ack(cb, { ok: true }); push(r);
  });
  s.on('settings', d => {
    const { r, p } = ctx(); if (!r || !p || r.host !== p.id || r.phase !== 'lobby' || !d) return;
    const t = r.settings;
    if (['random', ...MODES].includes(d.mode)) t.mode = d.mode;
    if ([3, 5, 10].includes(+d.rounds)) t.rounds = +d.rounds;
    if ([15, 20, 30].includes(+d.timer)) t.timer = +d.timer;
    if (['easy', 'medium', 'hard'].includes(d.diff)) t.diff = d.diff;
    push(r);
  });
  s.on('ready', () => {
    const { r, p } = ctx(); if (!r || !p || r.phase !== 'lobby' || r.host === p.id || !ok('rd', 300)) return;
    p.ready = !p.ready; push(r);
  });
  s.on('start', (d, cb) => {
    const { r, p } = ctx(); if (!r || !p || r.host !== p.id || r.phase !== 'lobby') return;
    const c = all(r).filter(x => x.connected);
    if (c.length < 2) return ack(cb, { ok: false, msg: 'Need at least 2 connected players.' });
    if (!c.every(x => x.ready)) return ack(cb, { ok: false, msg: 'Everyone must be READY.' });
    for (const x of all(r)) Object.assign(x, { score: 0, correct: 0 });
    r.round = 0; nextRound(r); ack(cb, { ok: true });
  });
  s.on('answer', v => {
    const { r, p } = ctx(); if (!r || !p || r.phase !== 'round' || p.done || !ok('a', 250)) return;
    const n = Number(v); if (!Number.isInteger(n) || Math.abs(n) > 1e9) return;
    const q = r.q;
    if (n === q.answer) {
      const tot = r.settings.timer * 1000, left = Math.max(0, Math.min(tot, r.endsAt - Date.now()));
      p.rs = 100 + Math.round(100 * left / tot); p.score += p.rs; p.correct++; p.done = true; p.guesses.push({ n, h: 'ok' });
    } else {
      p.guesses.push({ n, h: q.mode === 'guess' ? (n < q.answer ? 'higher' : 'lower') : 'wrong' });
      if (p.guesses.length >= (q.mode === 'guess' ? 12 : 3)) p.done = true;
    }
    checkAll(r); if (r.phase === 'round') push(r);
  });
  s.on('reaction', e => {
    const { r, p } = ctx(); if (!r || !p || !EMOJI.includes(e) || !ok('r', 800)) return;
    io.to(r.code).emit('reaction', { id: p.id, e });  // cosmetic only; never touches scores
  });
  s.on('rematch', () => { const { r, p } = ctx(); if (r && p && r.host === p.id && r.phase === 'final') toLobby(r); });
  s.on('leave', cb => { const { r, p } = ctx(); if (r && p) { s.leave(r.code); s.data = {}; drop(r, p); } ack(cb, { ok: true }); });
  s.on('disconnect', () => {
    const { r, p } = ctx(); if (!r || !p || p.sid !== s.id) return;
    p.connected = false; p.sid = null;
    if (r.host === p.id) { const c = all(r).find(x => x.connected); if (c) { r.host = c.id; c.ready = true; } }
    if (!all(r).some(x => x.connected)) r.reap = setTimeout(() => { clearTimeout(r.t); rooms.delete(r.code); }, 60000);
    else if (r.phase === 'lobby') p.drop = setTimeout(() => drop(r, p), 30000);  // 30s reconnect grace in lobby
    if (r.phase === 'round') checkAll(r);
    push(r);
  });
});
process.on('uncaughtException', e => console.error('Unexpected error:', e));
srv.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('NUMBER CLASH running'));
