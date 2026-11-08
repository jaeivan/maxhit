// One worker per combat family. Always works on the newest request; stale ones are dropped.
import { optimize, Family, FamilyResult, Spellbook } from './optimizer';
import { monsters, Buffs, PlayerSkills } from './engine';
import { ALL_FIGHTS } from './data/quests';
import { slayerRows, SlayerRow } from './slayerRun';

interface Common {
  id: number;
  family: Family;
  skills: PlayerSkills;
  buffs: Record<Family, Buffs>;
  ownedIds: number[];
  excluded: number[];
  spellbooks: Spellbook[];
}
export interface WorkRequest extends Common {
  kind?: 'monster';
  monsterIndex: number;
  prices: [number, number][] | null;
  budget: number;
  fightId?: string | null;
}
export interface SlayerRequest extends Common {
  kind: 'slayer';
  /** monsters with no row yet: quick search first so the table fills fast */
  quickIndices: number[];
  /** monsters without an exact row: full search afterwards */
  exactIndices: number[];
}
export type WorkResponse =
  | { kind?: 'monster'; id: number; family: Family; phase: 'owned' | 'full'; result: FamilyResult; error?: string }
  | { kind: 'slayer'; id: number; family: Family; rows: SlayerRow[]; done: boolean };

let latest: WorkRequest | SlayerRequest | null = null;
let busy = false;
let priceKey: [number, number][] | null = null;
let priceMap: Map<number, number> | undefined;

self.onmessage = (e: MessageEvent<WorkRequest | SlayerRequest>) => {
  latest = e.data;
  if (!busy) setTimeout(loop, 0);
};

const yieldToMessages = () => new Promise((r) => setTimeout(r, 0));

async function loop() {
  const req = latest;
  if (!req) return;
  busy = true;
  latest = null;
  try {
    if (req.kind === 'slayer') await runSlayer(req);
    else runMonster(req);
  } catch (err) {
    console.error(err);
    if (req.kind !== 'slayer') {
      post({ id: req.id, family: req.family, phase: 'owned', result: null as unknown as FamilyResult, error: String(err) });
    }
  }
  busy = false;
  if (latest) setTimeout(loop, 0);
}

function runMonster(req: WorkRequest) {
  if (req.prices !== priceKey) { priceKey = req.prices; priceMap = req.prices ? new Map(req.prices) : undefined; }
  const base = {
    monster: monsters[req.monsterIndex],
    skills: req.skills,
    buffs: req.buffs,
    ownedIds: req.ownedIds,
    excluded: new Set(req.excluded),
    spellbooks: req.spellbooks,
    families: [req.family],
    fight: req.fightId ? ALL_FIGHTS.find((f) => f.id === req.fightId) : undefined,
  };
  // phase 1: owned gear only (fast)
  const owned = optimize(base)[0];
  post({ id: req.id, family: req.family, phase: 'owned', result: owned });
  // phase 2: GE upgrades + budget plan, unless a newer request already arrived
  if (!latest && priceMap) {
    const full = optimize({ ...base, prices: priceMap, budget: req.budget })[0];
    if (!latest) post({ id: req.id, family: req.family, phase: 'full', result: full });
  }
}

/** Streams rows in small batches and stops as soon as a newer request arrives. */
async function runSlayer(req: SlayerRequest) {
  const base = {
    skills: req.skills, buffs: req.buffs, ownedIds: req.ownedIds,
    excluded: new Set(req.excluded), spellbooks: req.spellbooks,
  };
  for (const [indices, quick] of [[req.quickIndices, true], [req.exactIndices, false]] as const) {
    let batch: SlayerRow[] = [];
    let lastPost = performance.now();
    for (const row of slayerRows(base, indices, req.family, quick)) {
      batch.push(row);
      if (batch.length >= 4 || performance.now() - lastPost > 80) {
        post({ kind: 'slayer', id: req.id, family: req.family, rows: batch, done: false });
        batch = []; lastPost = performance.now();
        await yieldToMessages();
        if (latest) return; // superseded
      }
    }
    if (batch.length) post({ kind: 'slayer', id: req.id, family: req.family, rows: batch, done: false });
  }
  post({ kind: 'slayer', id: req.id, family: req.family, rows: [], done: true });
}

function post(r: WorkResponse) {
  (self as unknown as Worker).postMessage(r);
}
