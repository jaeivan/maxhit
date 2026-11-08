// Gear optimizer: best loadout from owned items + GE upgrade suggestions.
// Every score comes from the real wiki DPS engine; the search only decides which loadouts to score.
import {
  basePlayer, Buffs, emptyEquipment, equipment, equipmentById, evaluate, EvalResult, EquipmentPiece,
  getCanonicalItemId, Monster, Player, PlayerEquipment, PlayerSkills, SLOTS, spells, Spell, EquipmentCategory,
  getCombatStylesForCategory,
} from './engine';
import { MAGIC_WEAPONS } from '@/enums/EquipmentCategory';
import { ammoApplicability, AmmoApplicability } from '@/lib/Equipment';
import meta from './data/meta.json';
import { Fight, StyleRule, styleRule } from './data/quests';
import reqsRaw from './data/reqs.json';

export type Family = 'melee' | 'ranged' | 'magic';
export const FAMILIES: Family[] = ['melee', 'ranged', 'magic'];
type Slot = keyof PlayerEquipment;

const reqs = reqsRaw as unknown as Record<string, Partial<PlayerSkills>>;
const special = new Set<string>((meta.specialNames as string[]).map((s) => s.toLowerCase()));
const isSpecial = (e: EquipmentPiece) => special.has(e.name.toLowerCase());

// ---------- spells ----------
const SPELL_LEVELS: Record<string, number> = {
  'Wind Strike': 1, 'Water Strike': 5, 'Earth Strike': 9, 'Fire Strike': 13,
  'Wind Bolt': 17, 'Water Bolt': 23, 'Earth Bolt': 29, 'Fire Bolt': 35,
  'Wind Blast': 41, 'Water Blast': 47, 'Earth Blast': 53, 'Fire Blast': 59,
  'Wind Wave': 62, 'Water Wave': 65, 'Earth Wave': 70, 'Fire Wave': 75,
  'Wind Surge': 81, 'Water Surge': 85, 'Earth Surge': 90, 'Fire Surge': 95,
  'Crumble Undead': 39,
  'Smoke Rush': 50, 'Shadow Rush': 52, 'Blood Rush': 56, 'Ice Rush': 58,
  'Smoke Burst': 62, 'Shadow Burst': 64, 'Blood Burst': 68, 'Ice Burst': 70,
  'Smoke Blitz': 74, 'Shadow Blitz': 76, 'Blood Blitz': 80, 'Ice Blitz': 82,
  'Smoke Barrage': 86, 'Shadow Barrage': 88, 'Blood Barrage': 92, 'Ice Barrage': 94,
  'Ghostly Grasp': 35, 'Inferior Demonbane': 44, 'Skeletal Grasp': 56,
  'Superior Demonbane': 62, 'Undead Grasp': 79, 'Dark Demonbane': 82,
};
// Excluded: god spells, Iban Blast, Magic Dart (need specific staves), binds.

export type Spellbook = 'standard' | 'ancient' | 'arceuus';

export function availableSpells(magicLevel: number, books: Spellbook[]): Spell[] {
  return spells.filter((s) => SPELL_LEVELS[s.name] !== undefined
    && SPELL_LEVELS[s.name] <= magicLevel && books.includes(s.spellbook as Spellbook));
}

const isPowered = (w: EquipmentPiece | null) => !!w && [
  EquipmentCategory.POWERED_STAFF, EquipmentCategory.POWERED_WAND, EquipmentCategory.POWERED_BOOK,
].includes(w.category);

// ---------- item filtering ----------
export function meetsReqs(e: EquipmentPiece, skills: PlayerSkills): boolean {
  const r = reqs[e.id] ?? reqs[getCanonicalItemId(e.id)];
  if (!r) return true; // unknown → assume wearable (user can exclude)
  return (Object.keys(r) as (keyof PlayerSkills)[]).every((k) => (skills[k] ?? 1) >= (r[k] ?? 0));
}

function relevant(e: EquipmentPiece, f: Family): boolean {
  if (isSpecial(e)) return true;
  const o = e.offensive; const b = e.bonuses;
  if (f === 'melee') return o.stab > 0 || o.slash > 0 || o.crush > 0 || b.str > 0;
  if (f === 'ranged') return o.ranged > 0 || b.ranged_str > 0;
  return o.magic > 0 || b.magic_str > 0;
}

function statVec(e: EquipmentPiece, f: Family): number[] {
  const o = e.offensive; const b = e.bonuses;
  if (f === 'melee') return [o.stab, o.slash, o.crush, b.str];
  if (f === 'ranged') return [o.ranged, b.ranged_str];
  return [o.magic, b.magic_str];
}

/** Remove items that are no better in any relevant stat and no cheaper than another item in the same slot. */
function pruneDominated(items: Cand[], f: Family): Cand[] {
  const keep: Cand[] = [];
  const vecs = items.map((c) => statVec(c.item, f));
  for (let i = 0; i < items.length; i++) {
    if (isSpecial(items[i].item)) { keep.push(items[i]); continue; }
    let dominated = false;
    for (let j = 0; j < items.length && !dominated; j++) {
      if (i === j || isSpecial(items[j].item)) continue;
      const a = vecs[i]; const b = vecs[j];
      let ge = true; let gt = false;
      for (let k = 0; k < a.length; k++) {
        if (b[k] < a[k]) { ge = false; break; }
        if (b[k] > a[k]) gt = true;
      }
      if (!ge) continue;
      if (items[j].cost > items[i].cost) continue;
      if (items[j].cost < items[i].cost) gt = true;
      if (gt || j < i) dominated = true; // exact ties: keep the first
    }
    if (!dominated) keep.push(items[i]);
  }
  return keep;
}

// ---------- inputs ----------
export interface Cand { item: EquipmentPiece; cost: number; owned: boolean; buyItem?: EquipmentPiece }

export interface OptimizeInput {
  monster: Monster;
  skills: PlayerSkills;
  buffs: Record<Family, Buffs>;
  ownedIds: number[];             // raw item ids from bank/equipment/inventory
  prices?: Map<number, number>;   // GE buy price by item id; omit for owned-only
  budget?: number;                // GP available for upgrades
  excluded?: Set<number>;
  spellbooks: Spellbook[];
  families?: Family[];
  fight?: Fight;
}

export interface Loadout {
  family: Family;
  equipment: PlayerEquipment;
  spell: Spell | null;
  result: EvalResult;
}

export interface Upgrade {
  item: EquipmentPiece;
  buyItem: EquipmentPiece; // what you actually buy on the GE (e.g. the uncharged version)
  price: number;
  slot: Slot;
  gain: number;       // DPS gained vs best owned loadout
  perMil: number;     // DPS per 1M GP
  loadout: Loadout;   // resulting loadout
}

export interface FamilyResult {
  family: Family;
  best: Loadout | null;
  upgrades: Upgrade[];               // best single purchases, by gain
  budgetPlan: { buys: Upgrade[]; spent: number; loadout: Loadout } | null;
  evals: number;
  ms: number;
  /** This style can't damage the target in this fight. */
  blocked?: boolean;
  /** Items the fight requires that you don't own (slot -> accepted item names). */
  missing?: Partial<Record<Slot, string[]>>;
}

// ---------- variants ----------
const BAD_VERSIONS = new Set(['Locked', 'Broken', "Emir's Arena", 'Soul Wars', '0']);
const BAD_NAME = /\((nz|Pete Kayer's Challenges|unobtainable item|Last Man Standing|beta|deadman|deadman mode|bh|Halloween event|historical|tournament)\)/i;
const ACTIVE_VERSIONS = ['Charged', 'Fully charged', 'Active', 'Activated'];
const byNameVersion = new Map<string, EquipmentPiece>();
for (const e of equipment) byNameVersion.set(`${e.name}#${e.version}`, e);

/** The version of an item you'd actually fight with (uncharged → charged, inactive → active). */
export function usableVariant(e: EquipmentPiece): EquipmentPiece {
  if (e.version === 'Uncharged' || e.version === 'Inactive') {
    for (const v of ACTIVE_VERSIONS) {
      const a = byNameVersion.get(`${e.name}#${v}`);
      if (a) return a;
    }
  }
  return e;
}
const isJunk = (e: EquipmentPiece) => BAD_VERSIONS.has(e.version) || BAD_NAME.test(e.name);

// ---------- fight rules ----------
const nameMatches = (item: EquipmentPiece, names: string[]) => {
  const n = item.name.toLowerCase();
  return names.some((r) => { const q = r.toLowerCase(); return n === q || n.startsWith(`${q} (`) || n.startsWith(`${q}#`); });
};

/** Damage multiplier a fight applies to a loadout (e.g. Slagilith without a pickaxe). */
export function makeAdjust(rule: StyleRule | undefined) {
  if (!rule?.damage?.length && rule?.otherwise === undefined) return undefined;
  return (eq: PlayerEquipment, spell: Spell | null): number => {
    for (const d of rule.damage ?? []) {
      if (d.weapon && !(eq.weapon?.name.toLowerCase().includes(d.weapon.toLowerCase()))) continue;
      if (d.ammo && !(eq.ammo?.name.toLowerCase().includes(d.ammo.toLowerCase()))) continue;
      if (d.spell && !(spell?.name.toLowerCase().startsWith(d.spell.toLowerCase()))) continue;
      return d.mult;
    }
    return rule.otherwise ?? 1;
  };
}

export function applyAdjust(r: EvalResult | null, m: number): EvalResult | null {
  if (!r || m === 1) return r;
  const dps = r.dps * m;
  return { ...r, dps, ttk: dps > 0 ? r.ttk / m : Infinity };
}

/** Map raw RuneLite item ids to engine equipment pieces (handles charged/degraded/cosmetic variants). */
export function resolveOwned(ids: number[]): EquipmentPiece[] {
  const out = new Map<number, EquipmentPiece>();
  for (const id of ids) {
    let e = equipmentById.get(id);
    if (!e) e = equipmentById.get(getCanonicalItemId(id));
    if (e) { const u = usableVariant(e); out.set(u.id, u); }
  }
  return [...out.values()];
}

// ---------- search ----------
class Search {
  evals = 0;
  player: Player;
  constructor(
    readonly f: Family, readonly monster: Monster, buffs: Buffs,
    readonly pool: Map<Slot, Cand[]>, readonly weapons: WeaponOpt[],
    readonly rule?: StyleRule,
  ) {
    this.player = basePlayer({ ...SKILLS_PLACEHOLDER }, buffs);
    this.adjust = makeAdjust(rule);
  }

  adjust?: (eq: PlayerEquipment, spell: Spell | null) => number;

  score(eq: PlayerEquipment, spell: Spell | null, style?: EvalResult['style']): EvalResult | null {
    this.evals++;
    const r = evaluate(this.player, this.monster, eq, this.f, spell, style);
    return this.adjust ? applyAdjust(r, this.adjust(eq, spell)) : r;
  }

  required(slot: Slot) { return !!this.rule?.require?.[slot]?.length; }

  /** Coordinate descent over non-weapon slots for a fixed weapon option. */
  descend(start: PlayerEquipment, w: WeaponOpt, maxPasses = 4, lockStyle = true): { eq: PlayerEquipment; r: EvalResult } | null {
    let eq = { ...start, weapon: w.weapon, ammo: w.ammo ?? start.ammo };
    // a fight-required slot must always hold an allowed item (a set seed may have put something else there)
    for (const slot of SLOTS) {
      if (slot === 'weapon' || !this.required(slot)) continue;
      const allowed = this.pool.get(slot) ?? [];
      if (!allowed.some((c) => c.item.id === eq[slot]?.id)) eq[slot] = allowed[0]?.item ?? null;
    }
    if (w.weapon?.isTwoHanded) {
      if (this.required('shield')) return null; // e.g. Elvarg: the shield is mandatory
      eq.shield = null;
    }
    const first = this.score(eq, w.spell);
    if (!first) return null;
    let cur: EvalResult = first;
    for (let pass = 0; pass < maxPasses; pass++) {
      let improved = false;
      const lock = lockStyle ? cur.style : undefined; // score swaps in the current attack style only; re-check all styles after the pass
      for (const slot of SLOTS) {
        if (slot === 'weapon') continue;
        if (slot === 'shield' && eq.weapon?.isTwoHanded) continue;
        if (slot === 'ammo' && w.lockAmmo) continue;
        const cands = this.pool.get(slot) ?? [];
        let bestEq: PlayerEquipment | null = null; let best: EvalResult = cur;
        for (const c of (this.required(slot) ? cands : [null, ...cands])) {
          const item = c?.item ?? null;
          if (item?.id === eq[slot]?.id || (!item && !eq[slot])) continue;
          if (slot === 'ammo' && item && this.f === 'ranged'
            && ammoApplicability(eq.weapon?.id, item.id) === AmmoApplicability.INVALID) continue;
          const trial = { ...eq, [slot]: item };
          const r = this.score(trial, w.spell, lock);
          if (r && r.dps > best.dps + 1e-9) { best = r; bestEq = trial; }
        }
        if (bestEq) { eq = bestEq; cur = best; improved = true; }
      }
      const all = this.score(eq, w.spell);
      if (all && all.style.name !== cur.style.name && all.dps > cur.dps + 1e-9) { cur = all; improved = true; }
      if (!improved) break;
    }
    return { eq, r: cur };
  }

  run(seeds: PlayerEquipment[]): Loadout | null {
    if (!this.weapons.length) return null;
    // 1. rough weapon ranking with no other gear (except items the fight requires)
    const empty = emptyEquipment();
    for (const slot of SLOTS) {
      if (slot !== 'weapon' && this.required(slot)) empty[slot] = this.pool.get(slot)?.[0]?.item ?? null;
    }
    const rough = this.weapons
      .map((w) => ({ w, r: this.score({ ...empty, weapon: w.weapon, ammo: w.ammo }, w.spell) }))
      .filter((x) => x.r)
      .sort((a, b) => b.r!.dps - a.r!.dps);
    if (!rough.length) return null;
    // 2. full descent with the roughly-best weapon gives a representative gear base
    const base = this.descend(empty, rough[0].w);
    if (!base) return null;
    // 3. re-rank every weapon option inside that gear base
    const ranked = this.weapons
      .map((w) => {
        const eq = { ...base.eq, weapon: w.weapon, ammo: w.ammo ?? base.eq.ammo };
        if (w.weapon?.isTwoHanded) eq.shield = null;
        return { w, r: this.score(eq, w.spell) };
      })
      .filter((x) => x.r)
      .sort((a, b) => b.r!.dps - a.r!.dps);
    // 4. full descent for the top few weapons (and any weapon that belongs to a seeded set)
    const setWeaponIds = new Set(seeds.map((s) => s.weapon?.id).filter(Boolean));
    const finalists = ranked.filter((x, i) => i < 4 || setWeaponIds.has(x.w.weapon?.id));
    const results: { lo: Loadout; w: WeaponOpt }[] = [];
    for (const { w } of finalists) {
      const starts = [base.eq, ...seeds.filter((s) => !s.weapon || s.weapon.id === w.weapon?.id)];
      for (const s of starts) {
        const d = this.descend(s, w);
        if (d) results.push({ lo: { family: this.f, equipment: d.eq, spell: w.spell, result: d.r }, w });
      }
    }
    // polish the top few distinct results with every attack style scored on every swap
    results.sort((a, b) => b.lo.result.dps - a.lo.result.dps);
    const seen = new Set<string>();
    let best: Loadout | null = null;
    for (const { lo, w } of results) {
      const key = SLOTS.map((k) => lo.equipment[k]?.id ?? 0).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 3) break;
      const d = this.descend(lo.equipment, w, 3, false);
      const cand = d && d.r.dps > lo.result.dps ? { ...lo, equipment: d.eq, result: d.r } : lo;
      if (!best || cand.result.dps > best.result.dps) best = cand;
    }
    return best && best.result.dps > 0 ? best : null;
  }
}

const SKILLS_PLACEHOLDER: PlayerSkills = {
  atk: 99, str: 99, def: 99, ranged: 99, magic: 99, prayer: 99, hp: 99, mining: 99, herblore: 99, farming: 99,
};

interface WeaponOpt { weapon: EquipmentPiece | null; ammo: EquipmentPiece | null; spell: Spell | null; lockAmmo?: boolean }

function buildWeaponOpts(f: Family, weapons: Cand[], ammo: Cand[], spellList: Spell[], rule?: StyleRule): WeaponOpt[] {
  const out: WeaponOpt[] = [];
  const shieldRequired = !!rule?.require?.shield?.length;
  const weaponRequired = !!rule?.require?.weapon?.length;
  for (const { item: w } of weapons) {
    if (shieldRequired && w.isTwoHanded) continue; // e.g. Elvarg: the anti-dragon shield must stay on
    if (f === 'magic') {
      // a powered staff's built-in spell isn't one of the allowed spells
      if (isPowered(w)) { if (!rule?.spells) out.push({ weapon: w, ammo: null, spell: null }); }
      else for (const s of spellList) out.push({ weapon: w, ammo: null, spell: s });
    } else if (f === 'ranged') {
      const valid = ammo.filter((a) => ammoApplicability(w.id, a.item.id) === AmmoApplicability.INCLUDED);
      const needsAmmo = ammoApplicability(w.id, undefined) === AmmoApplicability.INVALID;
      if (needsAmmo) {
        // keep the best ammo per weapon by ranged strength (accuracy ties broken by attack)
        valid.sort((a, b) => (b.item.bonuses.ranged_str - a.item.bonuses.ranged_str)
          || (b.item.offensive.ranged - a.item.offensive.ranged));
        if (valid[0]) out.push({ weapon: w, ammo: valid[0].item, spell: null, lockAmmo: true });
      } else {
        out.push({ weapon: w, ammo: null, spell: null });
      }
    } else {
      out.push({ weapon: w, ammo: null, spell: null });
    }
  }
  if (!weaponRequired) {
    if (f === 'magic') for (const s of spellList) out.push({ weapon: null, ammo: null, spell: s });
    if (f === 'melee') out.push({ weapon: null, ammo: null, spell: null });
  }
  return out;
}

function withBlowpipeDart(w: EquipmentPiece, darts: EquipmentPiece[]): EquipmentPiece {
  if (!/blowpipe/i.test(w.name)) return w;
  const dart = [...darts].sort((a, b) => b.bonuses.ranged_str - a.bonuses.ranged_str)[0]
    ?? equipment.find((e) => e.name === 'Dragon dart');
  return dart ? { ...w, itemVars: { blowpipeDartId: dart.id, blowpipeDartName: dart.name } } : w;
}

const MAGIC_CATS = new Set<string>(MAGIC_WEAPONS);
export function weaponFits(e: EquipmentPiece, f: Family): boolean {
  const styles = getCombatStylesForCategory(e.category || EquipmentCategory.NONE)
    .filter((s) => s.stance !== 'Manual Cast');
  if (f === 'magic') return MAGIC_CATS.has(e.category) || e.offensive.magic > 0;
  return styles.some((s) => (f === 'ranged' ? s.type === 'ranged' : ['stab', 'slash', 'crush'].includes(s.type as string)));
}

function buildPool(f: Family, cands: Cand[], skills: PlayerSkills, rule?: StyleRule): Map<Slot, Cand[]> {
  const pool = new Map<Slot, Cand[]>();
  for (const slot of SLOTS) {
    const req = rule?.require?.[slot];
    if (req?.length) {
      // the fight demands one of these items here: ignore stats, keep every matching item
      pool.set(slot, cands.filter((c) => c.item.slot === slot && meetsReqs(c.item, skills) && nameMatches(c.item, req)));
      continue;
    }
    let list = cands.filter((c) => c.item.slot === slot && meetsReqs(c.item, skills) && relevant(c.item, f)
      && (slot !== 'weapon' || weaponFits(c.item, f)));
    if (slot !== 'weapon' && !(slot === 'ammo' && f === 'ranged')) list = pruneDominated(list, f);
    pool.set(slot, list);
  }
  return pool;
}

function seedsFromSets(cands: Cand[]): PlayerEquipment[] {
  const byName = new Map<string, EquipmentPiece>();
  for (const c of cands) {
    const n = c.item.name.toLowerCase();
    if (!byName.has(n)) byName.set(n, c.item);
    const base = n.replace(/ \((or|i|e|t)\)$/, '');
    if (!byName.has(base)) byName.set(base, c.item);
  }
  const seeds: PlayerEquipment[] = [];
  for (const set of meta.sets as string[][]) {
    const pieces = set.map((n) => byName.get(n.toLowerCase()));
    if (pieces.some((p) => !p)) continue;
    const eq = emptyEquipment();
    for (const p of pieces) eq[p!.slot] = p!;
    seeds.push(eq);
  }
  return seeds;
}

/** Rank castable spells against this monster (gear-independent to first order) and keep the best few. */
const spellCache = new WeakMap<Monster, Map<string, Spell[]>>();
function topSpells(input: OptimizeInput, keep = 4, rule?: StyleRule): Spell[] {
  const key = `${input.skills.magic}|${input.spellbooks.join(',')}|${JSON.stringify(input.buffs.magic)}|${rule?.spells?.join(',') ?? ''}`;
  let m = spellCache.get(input.monster);
  if (!m) { m = new Map(); spellCache.set(input.monster, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const p = basePlayer(input.skills, input.buffs.magic);
  const allowed = rule?.spells?.map((x) => x.toLowerCase());
  const adj = makeAdjust(rule);
  const ranked = availableSpells(input.skills.magic, input.spellbooks)
    .filter((sp) => !allowed || allowed.some((a) => sp.name.toLowerCase().startsWith(a)))
    .map((sp) => ({ sp, r: applyAdjust(evaluate(p, input.monster, emptyEquipment(), 'magic', sp), adj ? adj(emptyEquipment(), sp) : 1) }))
    .filter((x) => x.r && x.r.dps > 0)
    .sort((a, b) => b.r!.dps - a.r!.dps)
    .slice(0, keep).map((x) => x.sp);
  m.set(key, ranked);
  return ranked;
}

function familyRule(input: OptimizeInput, f: Family): StyleRule | undefined | false {
  return input.fight ? styleRule(input.fight, f) : undefined;
}

function optimizeFamily(f: Family, input: OptimizeInput, cands: Cand[]): { best: Loadout | null; evals: number } {
  const rule = familyRule(input, f) || undefined;
  const pool = buildPool(f, cands, input.skills, rule);
  const darts = (pool.get('weapon') ?? []).filter((c) => c.item.category === EquipmentCategory.THROWN && /dart/i.test(c.item.name)).map((c) => c.item);
  const weaponsC = (pool.get('weapon') ?? []).map((c) => ({ ...c, item: withBlowpipeDart(c.item, darts) }));
  const spellList = f === 'magic' ? topSpells(input, 4, rule) : [];
  const wopts = buildWeaponOpts(f, weaponsC, pool.get('ammo') ?? [], spellList, rule);
  const s = new Search(f, input.monster, input.buffs[f], pool, wopts, rule);
  s.player.skills = { ...input.skills };
  s.player.boosts = basePlayer(input.skills, input.buffs[f]).boosts;
  const seeds = seedsFromSets(cands.filter((c) => meetsReqs(c.item, input.skills)));
  return { best: s.run(seeds), evals: s.evals };
}

export function optimize(input: OptimizeInput): FamilyResult[] {
  const excluded = input.excluded ?? new Set<number>();
  const owned = resolveOwned(input.ownedIds).filter((e) => !excluded.has(e.id));
  const ownedIds = new Set(owned.map((e) => e.id));
  const ownedC: Cand[] = owned.map((item) => ({ item, cost: 0, owned: true }));

  const buyMap = new Map<number, Cand>();
  if (input.prices) {
    for (const e of equipment) {
      if (isJunk(e) || excluded.has(e.id)) continue;
      const p = input.prices.get(e.id);
      if (!p || p <= 0) continue;
      const u = usableVariant(e);
      if (ownedIds.has(u.id) || excluded.has(u.id)) continue;
      const prev = buyMap.get(u.id);
      if (!prev || p < prev.cost) buyMap.set(u.id, { item: u, cost: p, owned: false, buyItem: e });
    }
  }
  const buyC = [...buyMap.values()];

  if (input.fight?.noPrayer) {
    const b = { ...input.buffs } as Record<Family, Buffs>;
    for (const f of FAMILIES) b[f] = { ...b[f], prayers: [] };
    input = { ...input, buffs: b };
  }
  const results: FamilyResult[] = [];
  for (const f of input.families ?? FAMILIES) {
    const t0 = performance.now();
    const rule = familyRule(input, f);
    if (rule === false) {
      results.push({ family: f, best: null, upgrades: [], budgetPlan: null, evals: 0, ms: 0, blocked: true });
      continue;
    }
    const missing: Partial<Record<Slot, string[]>> = {};
    for (const [slot, names] of Object.entries(rule?.require ?? {}) as [Slot, string[]][]) {
      if (!ownedC.some((c) => c.item.slot === slot && nameMatches(c.item, names) && meetsReqs(c.item, input.skills))) missing[slot] = names;
    }
    // Recommend as if you had the required items you're missing, and say so.
    const assumed: Cand[] = [];
    for (const [slot, names] of Object.entries(missing) as [Slot, string[]][]) {
      // assume the first listed option you could wear (the list is ordered easiest to get first)
      let item: EquipmentPiece | undefined;
      for (const n of names) {
        item = equipment.find((e) => e.slot === slot && !isJunk(e) && nameMatches(e, [n]) && meetsReqs(e, input.skills));
        if (item) break;
      }
      if (item) assumed.push({ item: usableVariant(item), cost: 0, owned: true });
    }
    const { best, evals: e1 } = optimizeFamily(f, input, [...ownedC, ...assumed]);
    let evals = e1;
    let upgrades: Upgrade[] = [];
    let budgetPlan: FamilyResult['budgetPlan'] = null;
    if (best && buyC.length) {
      const u = findUpgrades(f, input, best, [...ownedC, ...assumed], buyC);
      upgrades = u.upgrades; evals += u.evals;
      if (input.budget && input.budget > 0) {
        const b = planBudget(f, input, best, [...ownedC, ...assumed], upgrades, input.budget);
        budgetPlan = b.plan; evals += b.evals;
      }
    }
    results.push({ family: f, best, upgrades, budgetPlan, evals, ms: performance.now() - t0,
      ...(Object.keys(missing).length ? { missing } : {}) });
  }
  return results;
}

/** Single-purchase upgrades relative to the best owned loadout. Weapons get a re-optimized loadout. */
function findUpgrades(f: Family, input: OptimizeInput, base: Loadout, ownedC: Cand[], buyC: Cand[]) {
  const rule = familyRule(input, f) || undefined;
  const all = [...ownedC, ...buyC];
  const pool = buildPool(f, all, input.skills, rule);
  const buyable = new Set(buyC.map((c) => c.item.id));
  const s = new Search(f, input.monster, input.buffs[f], pool, [], rule);
  s.player.skills = { ...input.skills };
  s.player.boosts = basePlayer(input.skills, input.buffs[f]).boosts;
  const ownedPool = buildPool(f, ownedC, input.skills, rule);
  const ups: Upgrade[] = [];
  const spellList = f === 'magic' ? topSpells(input, 4, rule) : [];
  const ammoPool = pool.get('ammo') ?? [];

  // Screen every buyable weapon with one eval in the current gear; only promising ones get a full re-settle.
  const weaponScreen: { c: Cand; opt: WeaponOpt; dps: number }[] = [];
  for (const c of pool.get('weapon') ?? []) {
    if (!buyable.has(c.item.id)) continue;
    for (const w of buildWeaponOpts(f, [{ ...c, item: withBlowpipeDart(c.item, []) }], ammoPool, spellList, rule)) {
      const eq = { ...base.equipment, weapon: w.weapon, ammo: w.ammo ?? base.equipment.ammo };
      if (w.weapon?.isTwoHanded) eq.shield = null;
      const r = s.score(eq, w.spell);
      if (r) weaponScreen.push({ c, opt: w, dps: r.dps });
    }
  }
  weaponScreen.sort((a, b) => b.dps - a.dps);
  const promising = weaponScreen.filter((x, i) => i < 10 || x.dps > base.result.dps * 0.95).slice(0, 24);
  const bestByWeapon = new Map<number, Loadout>();
  for (const { c, opt } of promising) {
    const ws = new Search(f, input.monster, input.buffs[f], ownedPool, [opt], rule);
    ws.player.skills = s.player.skills; ws.player.boosts = s.player.boosts;
    const d = ws.descend(base.equipment, opt, 2);
    s.evals += ws.evals;
    const prev = bestByWeapon.get(c.item.id);
    if (d && (!prev || d.r.dps > prev.result.dps)) {
      bestByWeapon.set(c.item.id, { family: f, equipment: d.eq, spell: opt.spell, result: d.r });
    }
  }
  for (const { c } of promising) {
    const lo = bestByWeapon.get(c.item.id);
    if (lo && lo.result.dps > base.result.dps + 1e-6 && !ups.some((u) => u.item.id === c.item.id)) {
      ups.push(mkUpgrade(c, 'weapon', lo, base));
    }
  }

  for (const slot of SLOTS) {
    for (const c of pool.get(slot) ?? []) {
      if (!buyable.has(c.item.id)) continue;
      if (slot === 'weapon') continue;
      if (slot === 'shield' && s.required('shield') && base.equipment.weapon?.isTwoHanded) continue;
      {
        if (slot === 'shield' && base.equipment.weapon?.isTwoHanded) continue;
        if (slot === 'ammo' && f === 'ranged') continue; // ammo is consumable; handled with weapons
        const eq = { ...base.equipment, [slot]: c.item };
        const r = s.score(eq, base.spell);
        if (r && r.dps > base.result.dps + 1e-6) {
          ups.push(mkUpgrade(c, slot, { family: f, equipment: eq, spell: base.spell, result: r }, base));
        }
      }
    }
  }
  ups.sort((a, b) => b.gain - a.gain);
  return { upgrades: ups, evals: s.evals };
}

function mkUpgrade(c: Cand, slot: Slot, lo: Loadout, base: Loadout): Upgrade {
  const gain = lo.result.dps - base.result.dps;
  return { item: c.item, buyItem: c.buyItem ?? c.item, price: c.cost, slot, gain, perMil: gain / Math.max(c.cost / 1e6, 1e-6), loadout: lo };
}

/**
 * Budget plan. Shortlist = best single upgrades by gain and by DPS/GP. Greedily apply swaps from the
 * shortlist (re-scoring each against the current loadout), then re-settle the whole loadout once.
 * Runs once greedy-by-ratio and once greedy-by-gain and keeps the better plan.
 */
function planBudget(f: Family, input: OptimizeInput, base: Loadout, ownedC: Cand[], single: Upgrade[], budget: number) {
  let evals = 0;
  const p = basePlayer(input.skills, input.buffs[f]);
  const adj = makeAdjust(familyRule(input, f) || undefined);
  const score = (eq: PlayerEquipment, spell: Spell | null) => {
    evals++;
    const r = evaluate(p, input.monster, eq, f, spell);
    return adj ? applyAdjust(r, adj(eq, spell)) : r;
  };
  const inBudget = single.filter((u) => u.price <= budget);
  const byGain = [...inBudget].sort((a, b) => b.gain - a.gain).slice(0, 25);
  const byRatio = [...inBudget].sort((a, b) => b.perMil - a.perMil).slice(0, 25);
  const shortlist = [...new Map([...byGain, ...byRatio].map((u) => [u.item.id, u])).values()];

  const apply = (eq: PlayerEquipment, u: Upgrade): PlayerEquipment => {
    if (u.slot === 'weapon') {
      // take the weapon's settled loadout pieces for weapon/ammo/shield
      const w = u.loadout.equipment;
      return { ...eq, weapon: w.weapon, ammo: w.ammo ?? eq.ammo, shield: w.weapon?.isTwoHanded ? null : eq.shield };
    }
    return { ...eq, [u.slot]: u.item };
  };

  const run = (pickBy: 'ratio' | 'gain') => {
    let eq = base.equipment; let spell = base.spell; let cur = base.result.dps; let left = budget;
    const buys: Upgrade[] = [];
    for (;;) {
      let pick: { u: Upgrade; dps: number; eq: PlayerEquipment; spell: Spell | null; key: number } | null = null;
      for (const u of shortlist) {
        if (u.price > left || buys.includes(u)) continue;
        const trial = apply(eq, u);
        const sp = u.slot === 'weapon' ? u.loadout.spell : spell;
        const r = score(trial, sp);
        if (!r || r.dps <= cur + 1e-3) continue;
        const key = pickBy === 'gain' ? r.dps - cur : (r.dps - cur) / Math.max(u.price / 1e6, 1e-6);
        if (!pick || key > pick.key) pick = { u, dps: r.dps, eq: trial, spell: sp, key };
      }
      if (!pick) break;
      buys.push(pick.u); left -= pick.u.price; eq = pick.eq; spell = pick.spell; cur = pick.dps;
    }
    // re-settle everything with the purchases treated as owned
    const have = [...ownedC, ...buys.map((u) => ({ item: u.item, cost: 0, owned: true }))];
    const settled = optimizeFamily(f, input, have);
    evals += settled.evals;
    const r = score(eq, spell);
    let loadout: Loadout = { family: f, equipment: eq, spell, result: r! };
    if (settled.best && settled.best.result.dps > loadout.result.dps) loadout = settled.best;
    return { buys, loadout };
  };

  const a = run('ratio');
  const b = run('gain');
  const plan = b.loadout.result.dps > a.loadout.result.dps ? b : a;
  const used = new Set(Object.values(plan.loadout.equipment).filter(Boolean).map((e) => e!.id));
  const buys = plan.buys.filter((x) => used.has(x.item.id));
  const spent = buys.reduce((s, x) => s + x.price, 0);
  return { plan: buys.length ? { buys, spent, loadout: plan.loadout } : null, evals };
}
