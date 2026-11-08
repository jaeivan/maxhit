// Which monsters count for a slayer task, matched the way RuneLite's slayer plugin does:
// the task's extra target names plus the task name without its trailing "s", as whole words.
import { monsters, Monster } from './engine';
import tasksRaw from './data/slayer-tasks.json';
import rawMonsters from '@/../cdn/json/monsters.json';
import { ALL_FIGHTS } from './data/quests';

export interface SlayerTask { name: string; targets: string[] }
// RuneLite matches these two by in-game names it doesn't list; name the bosses explicitly.
const EXTRA_TARGETS: Record<string, string[]> = {
  'Barrows Brothers': ['Ahrim the Blighted', 'Dharok the Wretched', 'Guthan the Infested', 'Karil the Tainted', 'Torag the Corrupted', 'Verac the Defiled'],
  'Dagannoth Kings': ['Dagannoth Rex', 'Dagannoth Prime', 'Dagannoth Supreme'],
};
export const SLAYER_TASKS: SlayerTask[] = (tasksRaw as SlayerTask[])
  .map((t) => ({ ...t, targets: [...t.targets, ...(EXTRA_TARGETS[t.name] ?? [])] }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Fields the engine's loader drops: combat level and whether the wiki counts it as a slayer monster.
const RAW = new Map<string, { level?: number; slayer: boolean }>();
for (const r of rawMonsters as { id: number; version: string; level?: number; is_slayer_monster?: boolean }[]) {
  RAW.set(`${r.id}#${r.version ?? ''}`, { level: r.level, slayer: !!r.is_slayer_monster });
}
const rawOf = (m: Monster) => RAW.get(`${m.id}#${m.version ?? ''}`);
export const monsterLevel = (m: Monster) => rawOf(m)?.level;

// Quest-only versions (e.g. the Dagannoth mother) can't be fought on task.
const QUEST_ONLY = new Set(ALL_FIGHTS.map((f) => f.monster));

// Copies of monsters that don't count on task (minigames, raids, other game modes).
const NOT_ON_TASK = /\((Nightmare Zone|Deadman|Last Man Standing|Chambers of Xeric|Theatre of Blood|Tombs of Amascut|Pest Control|Soul Wars|Castle Wars|Emir's Arena|Barbarian Assault|beta|historical|Halloween|Christmas|Easter|Leagues|Tutorial)/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function patterns(task: SlayerTask): RegExp[] {
  const names = [...task.targets, task.name.replace(/s$/, ''), task.name.replace(/^The /, '')];
  return [...new Set(names)].map((n) => new RegExp(`(?:\\s|^)${escape(n)}(?:\\s|$)`, 'i'));
}

/** One row in the slayer table: a monster plus every version with identical combat stats. */
export interface SlayerTarget { index: number; name: string; versions: string[]; level?: number; hp: number }

const statKey = (m: Monster) => JSON.stringify([m.name, m.skills, m.defensive, m.attributes, (m as any).weakness ?? null, m.size]);

const cache = new Map<string, SlayerTarget[]>();

export function targetsForTask(taskName: string): SlayerTarget[] {
  const hit = cache.get(taskName);
  if (hit) return hit;
  const task = SLAYER_TASKS.find((t) => t.name.toLowerCase() === taskName.toLowerCase());
  if (!task) return [];
  const pats = patterns(task);
  const groups = new Map<string, SlayerTarget>();
  monsters.forEach((m, index) => {
    if (NOT_ON_TASK.test(m.name) || NOT_ON_TASK.test(m.version ?? '') || !(m.skills.hp > 0)) return;
    if (rawOf(m)?.slayer === false || /^Reanimated /.test(m.name)) return;
    if (QUEST_ONLY.has(m.version ? `${m.name}#${m.version}` : m.name)) return;
    if (!pats.some((p) => p.test(m.name))) return;
    const key = statKey(m);
    const g = groups.get(key);
    if (g) { if (m.version) g.versions.push(m.version); return; }
    groups.set(key, { index, name: m.name, versions: m.version ? [m.version] : [], level: monsterLevel(m), hp: m.skills.hp });
  });
  const out = [...groups.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  cache.set(taskName, out);
  return out;
}

/** RuneLite reports the task name in its own casing; map it to our task list. */
export function findTask(name: string | undefined | null): SlayerTask | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  return SLAYER_TASKS.find((t) => t.name.toLowerCase() === n);
}
