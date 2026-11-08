import { basePlayer, evaluate, emptyEquipment, equipment, monsters, SKILL_DEFAULT, Prayer, Potion } from '../src/engine';
const f = (n: string) => equipment.find((e) => e.name === n)!;
const mon = monsters.find((m) => m.name === 'Vorkath')!;
const p = basePlayer(SKILL_DEFAULT, { potions: [Potion.RANGING], prayers: [Prayer.RIGOUR], onSlayerTask: false, kandarinDiary: true });
const eq = { ...emptyEquipment(), weapon: f('Twisted bow'), ammo: f('Dragon arrow'), head: f('Masori mask (f)'), body: f('Masori body (f)'), legs: f('Masori chaps (f)'), cape: f("Dizana's quiver"), neck: f('Necklace of anguish'), hands: f('Zaryte vambraces'), feet: f('Pegasian boots'), ring: f('Venator ring') };
let r; const N = 3000; const t0 = performance.now();
for (let i = 0; i < N; i++) r = evaluate(p, mon, eq, 'ranged', null);
console.log(r!.dps.toFixed(3), r!.maxHit, (r!.accuracy*100).toFixed(1)+'%', r!.style.name, 'ms/eval', ((performance.now()-t0)/N).toFixed(4));
