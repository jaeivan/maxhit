import { optimize } from '../src/optimizer';
import { equipment, monsters, Prayer, Potion } from '../src/engine';
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury','Berserker ring (i)','Slayer helmet (i)','Void knight top','Void knight robe','Void knight gloves','Void ranger helm','Toxic blowpipe','Magic shortbow (i)','Trident of the Seas','Occult necklace',"Ahrim's robetop","Ahrim's robeskirt","Black d'hide body","Black d'hide chaps",'Dragon arrow','Abyssal tentacle','Bandos tassets',"Ava's assembler",'Archers ring (i)','Seers ring (i)','Imbued Saradomin cape','Necklace of anguish','Dragon dart','Tormented bracelet','Eternal boots'].map(id);
const skills = { atk: 90, str: 92, def: 85, ranged: 92, magic: 88, prayer: 77, hp: 92, mining: 70, herblore: 80, farming: 70 };
const buffs = {
  melee: { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: false, kandarinDiary: true },
  ranged: { potions: [Potion.RANGING], prayers: [Prayer.EAGLE_EYE], onSlayerTask: false, kandarinDiary: true },
  magic: { potions: [Potion.SATURATED_HEART], prayers: [Prayer.MYSTIC_MIGHT], onSlayerTask: false, kandarinDiary: true },
};
// price EVERY item: pseudo-price grows with total offensive stats (worst case for search size)
const prices = new Map<number, number>();
for (const e of equipment) { const o = e.offensive, b = e.bonuses; const t = Math.max(0, o.stab+o.slash+o.crush+o.ranged+o.magic+b.str+b.ranged_str+b.magic_str*3); prices.set(e.id, Math.round(10000 * (1 + t * t / 5))); }
console.log('priced items', prices.size);
const mon = monsters.find((m) => m.name === 'General Graardor')!;
for (const mode of ['owned', 'upgrades', 'budget'] as const) {
  const t0 = performance.now();
  const res = optimize({ monster: mon, skills, buffs, ownedIds: bank, prices: mode === 'owned' ? undefined : prices, budget: mode === 'budget' ? 100e6 : 0, spellbooks: ['standard','ancient','arceuus'] });
  console.log(mode.padEnd(9), (performance.now()-t0).toFixed(0)+'ms', res.map((r) => `${r.family}:${r.ms.toFixed(0)}ms/${r.evals}ev best=${r.best?.result.dps.toFixed(2)} ups=${r.upgrades.length}`).join('  '));
}
