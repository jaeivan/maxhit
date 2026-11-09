// No-plugin data sources: a pasted bank list, the WikiSync plugin's local socket, and the hiscores.
import type { PlayerSkills } from '@/types/Player';
import { equipment } from './engine';

/** What the app keeps when the MaxHit plugin isn't used. Saved in localStorage. */
export interface ManualData {
  rsn?: string;
  skills: Partial<PlayerSkills>;
  bank: number[];
  worn: number[];
  bankUpdatedAt: number;
  wornUpdatedAt: number;
  skillsUpdatedAt: number;
  skillsFrom?: 'hiscores' | 'wikisync';
}

export const emptyManual = (): ManualData => ({ skills: {}, bank: [], worn: [], bankUpdatedAt: 0, wornUpdatedAt: 0, skillsUpdatedAt: 0 });

// ---------- pasted bank ----------
let byName: Map<string, number> | null = null;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
function nameIndex() {
  if (!byName) {
    byName = new Map();
    for (const e of equipment) if (!byName.has(norm(e.name))) byName.set(norm(e.name), e.id);
  }
  return byName;
}

export interface BankParse { ids: number[]; lines: number; unmatched: string[] }

/**
 * Accepts Bank Memory's "Copy item data to clipboard" output (Item id / Item name / Item quantity, tab separated),
 * or any list with one item per line: an item id, or an equipment name like "Abyssal whip".
 * Placeholders (quantity 0) are skipped.
 */
export function parseBankText(text: string): BankParse {
  const ids = new Set<number>();
  const unmatched: string[] = [];
  let lines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^item id\b/i.test(line)) continue;
    lines++;
    const cols = line.split(/\t|,(?=\s*\d+\s*$)/).map((c) => c.trim());
    const qty = cols.length >= 3 ? Number(cols[cols.length - 1].replace(/,/g, '')) : NaN;
    if (!Number.isNaN(qty) && qty <= 0) continue;
    if (/^\d+$/.test(cols[0])) { ids.add(Number(cols[0])); continue; }
    // name only, optionally followed by "x 5" / a quantity column
    const name = norm(cols[0].replace(/\s+x?\s*\d[\d,]*$/i, ''));
    const id = nameIndex().get(name);
    if (id !== undefined) ids.add(id); else unmatched.push(cols[0]);
  }
  return { ids: [...ids], lines, unmatched };
}

// ---------- hiscores ----------
const HISCORE_SKILLS: Record<string, keyof PlayerSkills> = {
  Attack: 'atk', Strength: 'str', Defence: 'def', Hitpoints: 'hp', Ranged: 'ranged', Magic: 'magic',
  Prayer: 'prayer', Mining: 'mining', Herblore: 'herblore', Farming: 'farming',
};

/** Parses the hiscores index_lite.json response. Unranked skills are left out so defaults apply. */
export function parseHiscores(j: { skills?: { name: string; level: number; xp: number | null; rank?: number | null }[] }): Partial<PlayerSkills> {
  const out: Partial<PlayerSkills> = {};
  for (const s of j.skills ?? []) {
    const k = HISCORE_SKILLS[s.name];
    // unranked skills come back as level 1 with xp -1 (or null), which would wrongly drop e.g. Hitpoints to 1
    const unranked = typeof s.xp !== 'number' || s.xp < 0 || (s.level <= 1 && (s.rank == null || s.rank < 0));
    if (k && !unranked && s.level > 0) out[k] = s.level;
  }
  return out;
}

export async function fetchHiscores(rsn: string): Promise<Partial<PlayerSkills>> {
  const r = await fetch(`/api/hiscores?player=${encodeURIComponent(rsn.trim())}`);
  if (r.status === 404) throw new Error(`No hiscores entry for "${rsn}". Accounts below the ranking threshold, or with a typo, aren't listed.`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return parseHiscores(await r.json());
}

// ---------- WikiSync ----------
// The WikiSync plugin (Plugin Hub) serves the logged-in player on one of these ports, for the wiki's DPS calculator.
// It only accepts pages served from localhost, dps.osrs.wiki or tools.runescape.wiki.
const PORTS = Array.from({ length: 10 }, (_, i) => 37767 + i);
const SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'] as const;

export interface WikiSyncPlayer { username: string; skills: Partial<PlayerSkills>; worn: number[] }

interface Loadout { name?: string; skills?: Partial<PlayerSkills>; equipment?: Partial<Record<(typeof SLOTS)[number], { id: number } | null>> }

export function parseWikiSyncPayload(username: string, payload: { loadouts?: Loadout[] }): WikiSyncPlayer {
  const l = payload.loadouts?.[0] ?? {};
  const worn: number[] = [];
  for (const s of SLOTS) { const id = l.equipment?.[s]?.id; if (typeof id === 'number' && id > 0) worn.push(id); }
  const skills: Partial<PlayerSkills> = {};
  for (const [k, v] of Object.entries(l.skills ?? {})) if (typeof v === 'number' && v > 0) skills[k as keyof PlayerSkills] = v;
  return { username: l.name ?? username, skills, worn };
}

/** Finds a running WikiSync, asks it for the player, and closes the connection. */
export function fetchWikiSync(findMs = 700, replyMs = 4000): Promise<WikiSyncPlayer> {
  return new Promise((resolve, reject) => {
    const sockets: WebSocket[] = [];
    let chosen: { ws: WebSocket; username: string } | null = null;
    let done = false;
    let sawLoggedOut = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      for (const ws of sockets) { try { ws.close(); } catch { /* already closed */ } }
      fn();
    };
    for (const port of PORTS) {
      let ws: WebSocket;
      try { ws = new WebSocket(`ws://localhost:${port}`); } catch { continue; }
      sockets.push(ws);
      ws.onerror = () => { /* closed port: expected */ };
      ws.onmessage = (m) => {
        let msg: { _wsType?: string; username?: string; sequenceId?: number; error?: string; payload?: unknown };
        try { msg = JSON.parse(String(m.data)); } catch { return; }
        if (msg._wsType === 'UsernameChanged' && !msg.username) sawLoggedOut = true;
        if (msg._wsType === 'UsernameChanged' && msg.username && !chosen) {
          chosen = { ws, username: msg.username };
          ws.send(JSON.stringify({ _wsType: 'GetPlayer', sequenceId: 1, data: {} }));
        } else if (msg._wsType === 'GetPlayer' && chosen?.ws === ws) {
          const user = chosen.username;
          finish(() => (msg.error ? reject(new Error(msg.error)) : resolve(parseWikiSyncPayload(user, msg.payload as { loadouts?: Loadout[] }))));
        }
      };
    }
    setTimeout(() => {
      if (!chosen) {
        finish(() => reject(new Error(location.hostname !== 'localhost'
          ? `WikiSync only talks to pages opened at localhost. Open http://localhost:${location.port || 5173} instead of ${location.host}.`
          : sawLoggedOut ? 'WikiSync is running but RuneLite is not logged in. Log in and try again.'
          : 'WikiSync not found. Is RuneLite open, WikiSync installed from the Plugin Hub, and are you logged in?')));
      }
    }, findMs);
    setTimeout(() => finish(() => reject(new Error('WikiSync connected but did not answer.'))), findMs + replyMs);
  });
}
