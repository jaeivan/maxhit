// Generates src/data/meta.json from the engine source:
//  - specialNames: every item name the DPS engine checks for by name (effects not captured by stats).
//    These are never pruned by stat dominance.
//  - sets: all-or-nothing gear sets (wearingAll groups + void), used as search seeds.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('engine/src/lib');
const files = ['BaseCalc.ts', 'PlayerVsNPCCalc.ts', 'Equipment.ts', ...fs.readdirSync(path.join(root, 'dists')).map((f) => 'dists/' + f)];
const src = files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const equipment = JSON.parse(fs.readFileSync('engine/cdn/json/equipment.json', 'utf8'));
const names = new Set(equipment.map((e) => e.name.toLowerCase()));

const literals = new Set();
for (const m of src.matchAll(/(['"])((?:(?!\1).){3,80}?)\1/g)) {
  const s = m[2].split('#')[0].toLowerCase();
  if (names.has(s)) literals.add(s);
}
// substring checks used by the engine (e.g. "of vitur", "salve", "crystal")
for (const m of src.matchAll(/\.includes\((['"])([^'"]{3,40})\1\)/g)) {
  const sub = m[2].toLowerCase();
  for (const n of names) if (n.includes(sub)) literals.add(n);
}

const sets = [];
for (const m of src.matchAll(/wearingAll\(\[([^\]]+)\]\)/g)) {
  const items = [...m[1].matchAll(/(['"])((?:(?!\1).)+)\1/g)].map((x) => x[2]);
  sets.push(items);
}
for (const helm of ['Void melee helm', 'Void ranger helm', 'Void mage helm']) {
  sets.push([helm, 'Void knight top', 'Void knight robe', 'Void knight gloves']);
  sets.push([helm, 'Elite void top', 'Elite void robe', 'Void knight gloves']);
}
const uniq = [...new Map(sets.map((s) => [s.join('|').toLowerCase(), s])).values()];
fs.writeFileSync('src/data/meta.json', JSON.stringify({ specialNames: [...literals].sort(), sets: uniq }, null, 1));
console.log('special item names:', literals.size, 'sets:', uniq.length);
