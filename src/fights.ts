// Resolve quest fights to engine monsters.
import { monsters } from './engine';
import { ALL_FIGHTS } from './data/quests';

export function monsterIndexForRef(ref: string): number {
  const [name, version = ''] = ref.split('#');
  return monsters.findIndex((m) => m.name === name && (m.version ?? '') === version);
}

export const FIGHT_MONSTER = new Map(ALL_FIGHTS.map((f) => [f.id, monsterIndexForRef(f.monster)]));
