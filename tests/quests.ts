// Every quest fight must resolve to a monster, and the optimizer must respect each fight's rules.
import { optimize, resolveOwned } from '../src/optimizer';
import { equipment, monsters, Prayer, Potion } from '../src/engine';
import { ALL_FIGHTS, QUEST_FIGHTS } from '../src/data/quests';
import { FIGHT_MONSTER } from '../src/fights';

let fail = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fail++; console.log('FAIL', msg); } };

// 1. data integrity
const ids = new Set<string>();
for (const f of ALL_FIGHTS) {
  check(!ids.has(f.id), `duplicate id ${f.id}`); ids.add(f.id);
  check((FIGHT_MONSTER.get(f.id) ?? -1) >= 0, `${f.quest} / ${f.name}: monster "${f.monster}" not in engine data`);
  for (const fam of ['melee', 'ranged', 'magic', 'all'] as const) {
    const r = (f as any)[fam];
    for (const names of Object.values(r?.require ?? {}) as string[][]) {
      for (const n of names) check(equipment.some((e) => e.name.toLowerCase() === n.toLowerCase()), `${f.name}: required item "${n}" not in engine data`);
    }
  }
}
console.log(`${QUEST_FIGHTS.length} quests, ${ALL_FIGHTS.length} fights`);

// 2. behaviour on a mid-level bank
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury','Berserker ring (i)','Slayer helmet (i)','Toxic blowpipe','Magic shortbow (i)','Rune crossbow','Trident of the Seas','Occult necklace',"Ahrim's robetop","Ahrim's robeskirt","Black d'hide body","Black d'hide chaps",'Dragon arrow','Ruby dragon bolts (e)','Abyssal tentacle','Bandos tassets',"Ava's assembler",'Archers ring (i)','Seers ring (i)','Imbued Saradomin cape','Necklace of anguish','Dragon dart','Tormented bracelet','Eternal boots','Rune pickaxe','Ice gloves','Silverlight','Comp ogre bow','Rune brutal','Dragon scimitar','Mystic smoke staff'].map(id);
const skills = { atk: 85, str: 88, def: 80, ranged: 88, magic: 85, prayer: 74, hp: 88, mining: 70, herblore: 80, farming: 70 };
const buffs = {
  melee: { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: false, kandarinDiary: true },
  ranged: { potions: [Potion.RANGING], prayers: [Prayer.RIGOUR], onSlayerTask: false, kandarinDiary: true },
  magic: { potions: [Potion.SATURATED_HEART], prayers: [Prayer.MYSTIC_MIGHT], onSlayerTask: false, kandarinDiary: true },
};
const run = (fid: string) => {
  const f = ALL_FIGHTS.find((x) => x.id === fid)!;
  return optimize({ monster: monsters[FIGHT_MONSTER.get(fid)!], skills, buffs, ownedIds: bank, spellbooks: ['standard', 'ancient', 'arceuus'], fight: f });
};
const fam = (rs: ReturnType<typeof run>, f: string) => rs.find((r) => r.family === f)!;

let r = run('delrith');
check(fam(r, 'ranged').blocked === true && fam(r, 'magic').blocked === true, 'Delrith: ranged/magic blocked');
check(fam(r, 'melee').best?.equipment.weapon?.name === 'Silverlight', `Delrith: melee weapon is Silverlight (got ${fam(r, 'melee').best?.equipment.weapon?.name})`);

r = run('elvarg');
for (const f of ['melee', 'ranged', 'magic']) {
  const b = fam(r, f);
  check(!!b.missing?.shield, `Elvarg ${f}: reports missing anti-dragon shield`);
  check(!!b.best && /anti-dragon|dragonfire|wyvern/i.test(b.best.equipment.shield?.name ?? ''), `Elvarg ${f}: recommends with a dragonfire shield (got ${b.best?.equipment.shield?.name})`);
  check(!b.best?.equipment.weapon?.isTwoHanded, `Elvarg ${f}: no two-handed weapon (got ${b.best?.equipment.weapon?.name})`);
}

r = run('kamil');
check(/^Fire /.test(fam(r, 'magic').best?.spell?.name ?? ''), `Kamil: magic uses a fire spell (got ${fam(r, 'magic').best?.spell?.name})`);

r = run('fareed');
check(fam(r, 'melee').best?.equipment.hands?.name === 'Ice gloves', `Fareed: melee wears ice gloves (got ${fam(r, 'melee').best?.equipment.hands?.name})`);
check(/^Water /.test(fam(r, 'magic').best?.spell?.name ?? ''), `Fareed: magic uses water spells (got ${fam(r, 'magic').best?.spell?.name})`);
check(!fam(r, 'ranged').best, 'Fareed: no ranged option without ice arrows');

// a full void set in the bank must not override a required slot
{
  const voidBank = [...bank, ...['Void knight top', 'Void knight robe', 'Void knight gloves', 'Void melee helm'].map(id)];
  const f = ALL_FIGHTS.find((x) => x.id === 'fareed')!;
  const rv = optimize({ monster: monsters[FIGHT_MONSTER.get('fareed')!], skills, buffs, ownedIds: voidBank, spellbooks: ['standard'], fight: f });
  check(fam(rv, 'melee').best?.equipment.hands?.name === 'Ice gloves', `Fareed + void bank: melee still wears ice gloves (got ${fam(rv, 'melee').best?.equipment.hands?.name})`);
  const fe = ALL_FIGHTS.find((x) => x.id === 'elvarg')!;
  const re = optimize({ monster: monsters[FIGHT_MONSTER.get('elvarg')!], skills, buffs, ownedIds: voidBank, spellbooks: ['standard'], fight: fe });
  for (const x of re) check(/anti-dragon/i.test(x.best?.equipment.shield?.name ?? ''), `Elvarg + void bank ${x.family}: keeps the shield (got ${x.best?.equipment.shield?.name})`);
}

r = run('slagilith');
check(/pickaxe/i.test(fam(r, 'melee').best?.equipment.weapon?.name ?? ''), `Slagilith: melee picks a pickaxe (got ${fam(r, 'melee').best?.equipment.weapon?.name})`);

r = run('slash-bash');
check(fam(r, 'ranged').best?.equipment.weapon?.name === 'Comp ogre bow', `Slash Bash: ranged uses comp ogre bow (got ${fam(r, 'ranged').best?.equipment.weapon?.name})`);

r = run('dag-mother-red');
check(fam(r, 'melee').blocked && fam(r, 'ranged').blocked && /^Fire /.test(fam(r, 'magic').best?.spell?.name ?? ''), 'Dagannoth mother red: fire spells only');

r = run('inadequacy');
check(!!fam(r, 'magic').best, 'Inadequacy: magic result exists (no prayer)');

r = run('tanglefoot');
check(fam(r, 'melee').missing?.weapon !== undefined, 'Tanglefoot: reports missing magic secateurs');

// 3. speed across all fights
const t0 = performance.now();
let none = 0;
for (const f of ALL_FIGHTS) {
  if (f.manual) continue;
  const res = optimize({ monster: monsters[FIGHT_MONSTER.get(f.id)!], skills, buffs, ownedIds: bank, spellbooks: ['standard', 'ancient', 'arceuus'], fight: f });
  if (res.every((x) => !x.best)) { none++; console.log('  no damaging setup:', f.quest, '/', f.name); }
}
console.log(`optimized ${ALL_FIGHTS.length} fights (owned gear) in ${((performance.now() - t0) / 1000).toFixed(1)}s; ${none} with no setup`);
console.log(fail ? `${fail} FAILED` : 'all checks passed');
process.exitCode = fail ? 1 : 0;
