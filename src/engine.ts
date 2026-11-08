// Thin wrapper over the OSRS Wiki DPS calculator engine (weirdgloop/osrs-dps-calc, GPL-3.0).
// Builds plain Player/Monster objects (no MobX) and evaluates DPS for a loadout.
import { getMonsters, INITIAL_MONSTER_INPUTS } from '@/lib/Monsters';
import {
  availableEquipment, calculateAttackSpeed, calculateEquipmentBonusesFromGear, getCanonicalItemId,
} from '@/lib/Equipment';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
import { getCombatStylesForCategory, PotionMap } from '@/utils';
import { EquipmentCategory } from '@/enums/EquipmentCategory';
import { Prayer } from '@/enums/Prayer';
import Potion from '@/enums/Potion';
import { spells, Spell } from '@/types/Spell';
import type { EquipmentPiece, Player, PlayerEquipment, PlayerSkills } from '@/types/Player';
import type { Monster } from '@/types/Monster';
import type { PlayerCombatStyle } from '@/types/PlayerCombatStyle';

export type { EquipmentPiece, Player, PlayerEquipment, PlayerSkills, Monster, PlayerCombatStyle, Spell };
export { Prayer, Potion, EquipmentCategory, spells, getCombatStylesForCategory, getCanonicalItemId };

export const SLOTS: (keyof PlayerEquipment)[] = [
  'weapon', 'shield', 'ammo', 'head', 'cape', 'neck', 'body', 'legs', 'hands', 'feet', 'ring',
];

export const equipment: EquipmentPiece[] = availableEquipment;
export const equipmentById = new Map<number, EquipmentPiece>(equipment.map((e) => [e.id, e]));

export const monsters: Monster[] = getMonsters().map((m) => ({
  ...m,
  inputs: { ...INITIAL_MONSTER_INPUTS, monsterCurrentHp: m.skills.hp },
}) as Monster);

export function emptyEquipment(): PlayerEquipment {
  return {
    head: null, cape: null, neck: null, ammo: null, weapon: null, body: null,
    shield: null, legs: null, hands: null, feet: null, ring: null,
  };
}

export const SKILL_DEFAULT: PlayerSkills = {
  atk: 99, str: 99, def: 99, ranged: 99, magic: 99, prayer: 99, hp: 99, mining: 99, herblore: 99, farming: 99,
};

export interface Buffs {
  potions: Potion[];
  prayers: Prayer[];
  onSlayerTask: boolean;
  kandarinDiary: boolean;
}

function potionBoosts(skills: PlayerSkills, potions: Potion[]): PlayerSkills {
  const b: PlayerSkills = {
    atk: 0, str: 0, def: 0, ranged: 0, magic: 0, prayer: 0, hp: 0, mining: 0, herblore: 0, farming: 0,
  };
  for (const p of potions) {
    const r = PotionMap[p].calculateFn(skills) as Partial<PlayerSkills>;
    for (const k of Object.keys(r) as (keyof PlayerSkills)[]) b[k] = Math.max(b[k], r[k] ?? 0);
  }
  return b;
}

export function basePlayer(skills: PlayerSkills, buffs: Buffs): Player {
  return {
    uuid: 'gearopt',
    name: 'gearopt',
    style: getCombatStylesForCategory(EquipmentCategory.NONE)[0],
    skills: { ...skills },
    boosts: potionBoosts(skills, buffs.potions),
    equipment: emptyEquipment(),
    attackSpeed: 4,
    prayers: [...buffs.prayers],
    bonuses: { str: 0, ranged_str: 0, magic_str: 0, prayer: 0 },
    offensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    defensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    buffs: {
      potions: [...buffs.potions],
      onSlayerTask: buffs.onSlayerTask,
      inWilderness: false,
      forinthrySurge: false,
      soulreaperStacks: 5,
      baAttackerLevel: 0,
      chinchompaDistance: 4,
      kandarinDiary: buffs.kandarinDiary,
      chargeSpell: false,
      markOfDarknessSpell: false,
      usingSunfireRunes: false,
      fragmentOfWind: false,
      fragmentOfWater: false,
      fragmentOfEarth: false,
      fragmentOfFire: false,
    },
    spell: null,
  };
}

export interface EvalResult {
  dps: number;
  maxHit: number;
  accuracy: number;
  ttk: number;
  style: PlayerCombatStyle;
}

/**
 * Evaluate a loadout. Tries every combat style the weapon offers (filtered to the
 * requested type family) and returns the best. `player` is mutated and reused.
 */
export function evaluate(
  player: Player,
  monster: Monster,
  eq: PlayerEquipment,
  family: 'melee' | 'ranged' | 'magic',
  spell: Spell | null,
  onlyStyle?: PlayerCombatStyle,
): EvalResult | null {
  player.equipment = eq;
  player.spell = spell;
  const cat = eq.weapon?.category || EquipmentCategory.NONE;
  let styles = getCombatStylesForCategory(cat).filter((s) => styleFamily(s) === family);
  if (onlyStyle) {
    const m = styles.find((s) => s.name === onlyStyle.name && s.stance === onlyStyle.stance && s.type === onlyStyle.type);
    if (m) styles = [m];
  }
  if (!styles.length) return null;
  const b = calculateEquipmentBonusesFromGear(player, monster);
  player.bonuses = b.bonuses;
  player.offensive = b.offensive;
  player.defensive = b.defensive;
  let best: EvalResult | null = null;
  for (const style of styles) {
    player.style = style;
    player.attackSpeed = calculateAttackSpeed(player, monster);
    const calc = new PlayerVsNPCCalc(player, monster, { loadoutName: 'gearopt' });
    const dps = calc.getDps();
    if (!best || dps > best.dps) {
      best = {
        dps,
        maxHit: calc.getDistribution().getMax(),
        accuracy: calc.getHitChance(),
        ttk: dps > 0 ? monster.skills.hp / dps : Infinity,
        style,
      };
    }
  }
  return best;
}

export function styleFamily(s: PlayerCombatStyle): 'melee' | 'ranged' | 'magic' | null {
  if (s.type === 'ranged') return 'ranged';
  if (s.type === 'magic') return 'magic';
  if (s.type === 'stab' || s.type === 'slash' || s.type === 'crush') return 'melee';
  return null;
}
