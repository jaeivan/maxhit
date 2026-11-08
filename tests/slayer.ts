import { SLAYER_TASKS, targetsForTask } from '../src/slayer';
let empty: string[] = [];
let total = 0, maxN = 0, maxT = '';
const t0 = performance.now();
for (const t of SLAYER_TASKS) {
  const r = targetsForTask(t.name);
  total += r.length;
  if (r.length > maxN) { maxN = r.length; maxT = t.name; }
  if (!r.length) empty.push(t.name);
}
console.log(`${SLAYER_TASKS.length} tasks, ${total} monster rows, matched in ${(performance.now() - t0).toFixed(0)}ms; largest: ${maxT} (${maxN})`);
console.log('tasks with no monsters in the DPS data:', empty.length, empty.join(', '));
for (const n of ['Abyssal demons', 'Dagannoth', 'Black demons', 'Kalphites', 'Gargoyles', 'Bloodveld', 'Hellhounds']) {
  console.log(`\n${n}:`, targetsForTask(n).map((x) => `${x.name}${x.versions.length ? ` [${x.versions.join(', ')}]` : ''} (lvl ${x.level ?? '?'})`).join(' | '));
}

// timing: full owned-gear optimization for every monster on the largest tasks
import { slayerRows } from '../src/slayerRun';
import { equipment, Prayer, Potion } from '../src/engine';
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury','Berserker ring (i)','Slayer helmet (i)','Toxic blowpipe','Magic shortbow (i)','Trident of the Seas','Occult necklace',"Ahrim's robetop","Ahrim's robeskirt","Black d'hide body","Black d'hide chaps",'Dragon arrow','Abyssal tentacle','Bandos tassets',"Ava's assembler",'Archers ring (i)','Seers ring (i)','Imbued Saradomin cape','Necklace of anguish','Dragon dart','Tormented bracelet','Eternal boots','Salve amulet(ei)','Arclight'].map(id);
const skills = { atk: 85, str: 88, def: 80, ranged: 88, magic: 85, prayer: 74, hp: 88, mining: 70, herblore: 80, farming: 70 };
const buffs = {
  melee: { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: false, kandarinDiary: true },
  ranged: { potions: [Potion.RANGING], prayers: [Prayer.RIGOUR], onSlayerTask: false, kandarinDiary: true },
  magic: { potions: [Potion.SATURATED_HEART], prayers: [Prayer.MYSTIC_MIGHT], onSlayerTask: false, kandarinDiary: true },
};
for (const task of ['Zombies', 'Black demons', 'Dagannoth']) {
  const idx = targetsForTask(task).map((x) => x.index);
  const per: Record<string, number> = {};
  let rows: any[] = [];
  for (const fam of ['melee', 'ranged', 'magic'] as const) {
    const t0 = performance.now();
    for (const r of slayerRows({ skills, buffs, ownedIds: bank, spellbooks: ['standard', 'ancient', 'arceuus'] }, idx, fam)) rows.push(r);
    per[fam] = performance.now() - t0;
  }
  console.log(`\n${task}: ${idx.length} monsters; ms per style:`, Object.fromEntries(Object.entries(per).map(([k, v]) => [k, Math.round(v)])));
  if (task === 'Black demons') {
    for (const i of idx.slice(0, 4)) {
      const rs = rows.filter((r) => r.monsterIndex === i);
      console.log('  ', i, rs.map((r) => `${r.family} ${r.dps.toFixed(2)} (${r.weapon}, ${r.style})`).join(' | '));
    }
  }
}
