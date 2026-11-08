// Best owned setup per monster on a slayer task, for one combat style.
import { optimize, Family, OptimizeInput } from './optimizer';
import { monsters } from './engine';

export interface SlayerRow {
  monsterIndex: number;
  family: Family;
  dps: number;          // 0 = can't damage it with this style using owned gear
  maxHit: number;
  ttk: number;
  style: string;        // attack style or spell
  weapon: string | null;
  /** false = from the quick search; the full search may still raise it slightly */
  exact: boolean;
}

/** Yields one row per monster. Buffs are forced to "on task" so slayer helm/black mask count. */
export function* slayerRows(
  base: Omit<OptimizeInput, 'monster' | 'families' | 'prices' | 'budget' | 'fight'>,
  indices: number[], family: Family, quick = false,
): Generator<SlayerRow> {
  const buffs = { ...base.buffs };
  for (const f of Object.keys(buffs) as Family[]) buffs[f] = { ...buffs[f], onSlayerTask: true };
  for (const i of indices) {
    const r = optimize({ ...base, buffs, monster: monsters[i], families: [family], quick })[0];
    const b = r.best;
    yield {
      monsterIndex: i, family,
      dps: b?.result.dps ?? 0,
      maxHit: b?.result.maxHit ?? 0,
      ttk: b?.result.ttk ?? Infinity,
      style: b ? (b.spell?.name ?? b.result.style.name) : '',
      weapon: b?.equipment.weapon?.name ?? null,
      exact: !quick,
    };
  }
}
