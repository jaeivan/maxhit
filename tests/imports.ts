// No-plugin imports: Bank Memory paste, hiscores parsing, and the WikiSync socket (against a fake WikiSync).
import { WebSocketServer } from 'ws';
import { fetchWikiSync, parseBankText, parseHiscores } from '../src/imports';
import { optimize } from '../src/optimizer';
import { equipment, monsters } from '../src/engine';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const id = (n: string) => equipment.find((x) => x.name === n)!.id;

// ---------- Bank Memory TSV (exact format from its ClipboardActions.java, CRLF on Windows) ----------
const tsv = ['Item id\tItem name\tItem quantity',
  `${id('Abyssal whip')}\tAbyssal whip\t1`,
  `${id('Dragon defender')}\tDragon defender\t1`,
  `${id('Fire cape')}\tFire cape\t1`,
  `${id('Amulet of fury')}\tAmulet of fury\t1`,
  '995\tCoins\t12,345,678',
  `${id('Barrows gloves')}\tBarrows gloves\t0`, // placeholder
  ''].join('\r\n');
const b = parseBankText(tsv);
check(b.ids.length === 5 && b.ids.includes(995), `TSV: 5 items kept (${b.ids.length})`);
check(!b.ids.includes(id('Barrows gloves')), 'TSV: quantity-0 placeholder skipped');
check(b.unmatched.length === 0, 'TSV: nothing unmatched');

// ---------- plain name list ----------
const names = parseBankText('Abyssal whip\nDragon defender x 1\n  fire cape  \nNot a real item\n4587');
check(names.ids.includes(id('Abyssal whip')) && names.ids.includes(id('Dragon defender')) && names.ids.includes(id('Fire cape')), 'names: matched case/space-insensitively, "x 1" ignored');
check(names.ids.includes(4587), 'names: bare id accepted');
check(names.unmatched.length === 1 && names.unmatched[0] === 'Not a real item', 'names: unknown line reported');

// ---------- the pasted bank actually drives the optimizer ----------
const vork = monsters.findIndex((m) => m.name === 'Vorkath');
const skills = { atk: 75, str: 75, def: 70, hp: 75, prayer: 52, ranged: 70, magic: 70, mining: 1, herblore: 1, farming: 1 };
const buffs = { prayers: [], potions: [], onSlayerTask: false, kandarinDiary: false };
const [r] = optimize({ monster: monsters[vork], skills, buffs: { melee: buffs, ranged: buffs, magic: buffs },
  ownedIds: b.ids, spellbooks: ['standard'], families: ['melee'], quick: true });
const wep = r.best?.equipment.weapon?.name;
check(wep === 'Abyssal whip', `optimizer uses pasted bank: weapon ${wep}`);

// ---------- hiscores ----------
const hs = parseHiscores({ skills: [
  { name: 'Overall', level: 1500, xp: 1 }, { name: 'Attack', level: 80, xp: 2e6 }, { name: 'Strength', level: 85, xp: 3e6 },
  { name: 'Magic', level: 1, xp: -1 }, { name: 'Prayer', level: 1, xp: null, rank: null }, // unranked
  { name: 'Hitpoints', level: 82, xp: 2.5e6 }, { name: 'Woodcutting', level: 60, xp: 3e5 },
] });
check(hs.atk === 80 && hs.str === 85 && hs.hp === 82, 'hiscores: combat skills mapped');
check(hs.magic === undefined && hs.prayer === undefined && !('Overall' in hs), 'hiscores: unranked and non-combat skipped');

// ---------- WikiSync: fake server speaking the plugin's protocol (WebSocketManager.java) ----------
const port = 37769; // a port in the middle of the scanned range
const wss = new WebSocketServer({ host: '127.0.0.1', port });
let origins: (string | undefined)[] = [];
wss.on('connection', (ws, req) => {
  origins.push(req.headers.origin);
  ws.send(JSON.stringify({ _wsType: 'UsernameChanged', username: 'Zezima' }));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m._wsType !== 'GetPlayer') return;
    ws.send(JSON.stringify({ _wsType: 'GetPlayer', sequenceId: m.sequenceId, payload: { loadouts: [{
      name: 'Zezima',
      equipment: { weapon: { id: id('Abyssal whip') }, head: null, cape: { id: id('Fire cape') }, shield: null },
      skills: { atk: 90, str: 91, def: 85, hp: 92, magic: 80, mining: 70, prayer: 70, ranged: 88 },
      buffs: { onSlayerTask: false },
    }] } }));
  });
});
await new Promise((res) => wss.once('listening', res));
(globalThis as { location?: unknown }).location = { hostname: 'localhost', port: '5173', host: 'localhost:5173' };
try {
  const p = await fetchWikiSync();
  check(p.username === 'Zezima', 'WikiSync: found on a scanned port');
  check(p.worn.length === 2 && p.worn.includes(id('Fire cape')), 'WikiSync: worn items, empty slots dropped');
  check(p.skills.atk === 90 && p.skills.ranged === 88, 'WikiSync: levels');
} catch (e) { check(false, `WikiSync: ${e}`); }
wss.close();

// logged out: the plugin sends UsernameChanged with no name
const wss2 = new WebSocketServer({ host: '127.0.0.1', port });
wss2.on('connection', (ws) => ws.send(JSON.stringify({ _wsType: 'UsernameChanged' })));
await new Promise((res) => wss2.once('listening', res));
try { await fetchWikiSync(); check(false, 'WikiSync logged out: should reject'); }
catch (e) { check(/not logged in/.test(String(e)), `WikiSync logged out: ${String(e).slice(0, 70)}`); }
wss2.close();

try { await fetchWikiSync(300); check(false, 'no WikiSync: should reject'); }
catch (e) { check(/not found/.test(String(e)), `no WikiSync: ${String(e).slice(0, 60)}`); }

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
