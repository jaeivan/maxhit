import { optimize } from '../src/optimizer';
import { equipment, monsters, Prayer, Potion } from '../src/engine';
const id = (n: string) => { const e = equipment.find((x) => x.name === n); if (!e) throw new Error('missing ' + n); return e.id; };
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury',
 'Berserker ring (i)','Slayer helmet (i)','Void knight top','Void knight robe','Void knight gloves','Void ranger helm','Void melee helm','Void mage helm',
 'Toxic blowpipe','Magic shortbow (i)','Rune crossbow','Trident of the Seas','Occult necklace',"Ahrim's robetop","Ahrim's robeskirt",
 'Black d\'hide body','Black d\'hide chaps','Dragon arrow','Amethyst arrow','Ruby dragon bolts (e)','Adamant bolts','Dragon scimitar','Abyssal tentacle',
 'Bandos tassets','Neitiznot faceguard','Ava\'s assembler','Archers ring (i)','Seers ring (i)','Imbued Saradomin cape','Mystic boots',
 'Necklace of anguish','Amulet of glory','Dragon dart','Salve amulet(ei)','Dragon warhammer','Mage\'s book','Tormented bracelet','Eternal boots'].map(id);
const skills = { atk: 90, str: 92, def: 85, ranged: 92, magic: 88, prayer: 77, hp: 92, mining: 70, herblore: 80, farming: 70 };
const buffs = {
  melee: { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: true, kandarinDiary: true },
  ranged: { potions: [Potion.RANGING], prayers: [Prayer.EAGLE_EYE], onSlayerTask: true, kandarinDiary: true },
  magic: { potions: [Potion.SATURATED_HEART], prayers: [Prayer.MYSTIC_MIGHT], onSlayerTask: true, kandarinDiary: true },
};
// rough placeholder prices for a handful of well-known upgrades
const priceNames: Record<string, number> = { 'Bandos chestplate': 12e6, 'Torva platebody': 300e6, 'Ghrazi rapier': 30e6,
 'Primordial boots': 25e6, 'Amulet of torture': 9e6, 'Ferocious gloves': 3e6, 'Avernic defender hilt': 50e6, 'Ultor ring': 80e6,
 'Twisted bow': 1.3e9, 'Armadyl crossbow': 30e6, 'Zaryte crossbow': 250e6, 'Masori body (f)': 0, 'Masori body': 40e6,
 'Masori chaps': 30e6, 'Masori mask': 10e6, 'Pegasian boots': 30e6, 'Zaryte vambraces': 40e6, 'Venator ring': 5e6, "Karil's leathertop": 2e6,
 "Tumeken's shadow": 1.3e9, 'Ancestral robe top': 120e6, 'Ancestral robe bottom': 80e6, 'Ancestral hat': 30e6,
 'Eye of Ayak': 50e6, 'Sanguinesti staff': 50e6, 'Magus ring': 8e6, "Elidinis' ward (f)": 0, 'Arcane spirit shield': 90e6,
 'Inquisitor\'s mace': 150e6, 'Inquisitor\'s hauberk': 60e6, 'Bandos boots': 1e6, 'Dragon hunter crossbow': 70e6, 'Osmumten\'s fang': 40e6,
 'Scythe of Vitur': 1.4e9, 'Soulreaper axe': 30e6, 'Oathplate chest': 60e6 };
const prices = new Map<number, number>();
for (const [n, p] of Object.entries(priceNames)) { const e = equipment.filter((x) => x.name === n); for (const x of e) if (p > 0 && x.version !== 'Charged') prices.set(x.id, p); }
for (const mname of ['Vorkath', 'Abyssal demon', 'General Graardor', 'Zulrah']) {
  const mon = monsters.find((m) => m.name === mname)!;
  const t0 = performance.now();
  const res = optimize({ monster: mon, skills, buffs, ownedIds: bank, prices, budget: 100e6, spellbooks: ['standard','ancient','arceuus'] });
  console.log(`\n=== ${mname} (${mon.version}) total ${(performance.now()-t0).toFixed(0)}ms`);
  for (const r of res) {
    const b = r.best;
    if (!b) { console.log(r.family, 'none'); continue; }
    const g = Object.entries(b.equipment).filter(([, v]) => v).map(([k, v]) => `${k}:${v!.name}`).join(', ');
    console.log(`[${r.family}] ${b.result.dps.toFixed(3)} dps max ${b.result.maxHit} acc ${(b.result.accuracy*100).toFixed(0)}% ${b.result.style.name}${b.spell ? ' spell:' + b.spell.name : ''} | evals ${r.evals} ${r.ms.toFixed(0)}ms`);
    console.log('   ', g);
    console.log('    top ups:', r.upgrades.slice(0, 4).map((u) => `${u.item.name} +${u.gain.toFixed(2)} (${(u.price/1e6).toFixed(0)}M)`).join(' | '));
    if (r.budgetPlan) console.log('    100M plan:', r.budgetPlan.buys.map((u) => u.item.name).join(', '), '→', r.budgetPlan.loadout.result.dps.toFixed(3), `spent ${(r.budgetPlan.spent/1e6).toFixed(0)}M`);
  }
}
