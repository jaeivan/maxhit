// One worker per combat family. Always works on the newest request; stale ones are dropped.
import { optimize, Family, FamilyResult, Spellbook } from './optimizer';
import { monsters, Buffs, PlayerSkills } from './engine';
import { ALL_FIGHTS } from './data/quests';

export interface WorkRequest {
  id: number;
  family: Family;
  monsterIndex: number;
  skills: PlayerSkills;
  buffs: Record<Family, Buffs>;
  ownedIds: number[];
  excluded: number[];
  spellbooks: Spellbook[];
  prices: [number, number][] | null;
  budget: number;
  fightId?: string | null;
}
export interface WorkResponse { id: number; family: Family; phase: 'owned' | 'full'; result: FamilyResult; error?: string }

let latest: WorkRequest | null = null;
let busy = false;
let priceKey: [number, number][] | null = null;
let priceMap: Map<number, number> | undefined;

self.onmessage = (e: MessageEvent<WorkRequest>) => {
  latest = e.data;
  if (!busy) setTimeout(loop, 0);
};

function loop() {
  const req = latest;
  if (!req) return;
  busy = true;
  latest = null;
  try {
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
  } catch (err) {
    post({ id: req.id, family: req.family, phase: 'owned', result: null as unknown as FamilyResult, error: String(err) });
  }
  busy = false;
  if (latest) setTimeout(loop, 0);
}

function post(r: WorkResponse) {
  (self as unknown as Worker).postMessage(r);
}
