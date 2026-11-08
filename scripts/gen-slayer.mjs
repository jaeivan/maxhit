// Generates src/data/slayer-tasks.json from RuneLite's slayer plugin Task.java (BSD-2-Clause).
// Usage: node scripts/gen-slayer.mjs path/to/runelite/.../plugins/slayer/Task.java
import fs from 'node:fs';

const src = fs.readFileSync(process.argv[2], 'utf8');
const tasks = [];
for (const m of src.matchAll(/^\s*[A-Z0-9_]+\(\s*"([^"]+)"\s*,\s*ItemID\.[A-Z0-9_]+((?:\s*,\s*[^,)]+)*)\)\s*[,;]/gm)) {
  const name = m[1];
  // remaining args: optional weakness threshold/item (ints/ItemIDs) then target name strings
  const targets = [...(m[2] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  tasks.push({ name, targets });
}
fs.writeFileSync('src/data/slayer-tasks.json', JSON.stringify(tasks, null, 1));
console.log(`${tasks.length} slayer tasks`);
