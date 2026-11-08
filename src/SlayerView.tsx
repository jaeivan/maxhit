import { useMemo, useState } from 'react';
import { monsters } from './engine';
import { Family, FAMILIES } from './optimizer';
import { findTask, SLAYER_TASKS, SlayerTarget, targetsForTask } from './slayer';
import type { SlayerRow } from './slayerRun';

const FAMILY_LABEL: Record<Family, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

export interface CurrentTask { name: string; remaining: number }

export function SlayerPicker({ taskName, current, onPick }: {
  taskName: string | null; current: CurrentTask | null | undefined; onPick: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return SLAYER_TASKS.filter((t) => t.name.toLowerCase().includes(s)
      || t.targets.some((x) => x.toLowerCase().includes(s))).slice(0, 24);
  }, [q]);
  const currentTask = findTask(current?.name);

  return (
    <div className="quest-picker">
      <label htmlFor="task-search" className="picker-label">Which slayer task?</label>
      <input
        id="task-search" className="quest-search" value={q} autoComplete="off"
        placeholder={taskName ?? 'Search tasks or monsters'}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { onPick(matches[0].name); setQ(''); } }}
      />
      <div className="task-row">
        {currentTask && (
          <button type="button" className="current-task" aria-pressed={currentTask.name === taskName}
            onClick={() => { onPick(currentTask.name); setQ(''); }}>
            Your task: {currentTask.name} <span className="dim">{current!.remaining} left</span>
          </button>
        )}
        {!currentTask && !q && <p className="dim">{current === null ? 'No slayer task right now.' : 'Search for any task.'}</p>}
      </div>
      {matches.length > 0 && (
        <ul className="quest-list">
          {matches.map((t) => (
            <li key={t.name}>
              <button type="button" aria-pressed={t.name === taskName} onClick={() => { onPick(t.name); setQ(''); }}>
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SortKey = 'best' | 'level' | Family;

export function SlayerTable({ taskName, rows, onOpen }: {
  taskName: string; rows: Map<string, SlayerRow>; onOpen: (monsterIndex: number) => void;
}) {
  const [sort, setSort] = useState<SortKey>('best');
  const targets = useMemo(() => targetsForTask(taskName), [taskName]);
  const get = (t: SlayerTarget, f: Family) => rows.get(`${f}:${t.index}`);
  const bestOf = (t: SlayerTarget) => {
    let best: SlayerRow | undefined;
    for (const f of FAMILIES) { const r = get(t, f); if (r && r.dps > 0 && (!best || r.dps > best.dps)) best = r; }
    return best;
  };
  const done = targets.filter((t) => FAMILIES.every((f) => get(t, f))).length;
  const exact = targets.filter((t) => FAMILIES.every((f) => get(t, f)?.exact)).length;

  const sorted = useMemo(() => {
    const list = [...targets];
    const key = (t: SlayerTarget) => {
      if (sort === 'level') return -(t.level ?? 0);
      if (sort === 'best') return bestOf(t)?.dps ?? -1;
      return get(t, sort)?.dps ?? -1;
    };
    return list.sort((a, b) => key(b) - key(a));
  }, [targets, rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const th = (k: SortKey, label: string, cls = '') => (
    <th key={k} className={cls} aria-sort={sort === k ? 'descending' : 'none'}>
      <button type="button" onClick={() => setSort(k)}>{label}</button>
    </th>
  );

  return (
    <section className="slayer" aria-label={`${taskName} monsters`}>
      <p className="dim slayer-meta">
        {targets.length} monsters count for this task. DPS uses your best owned setup for each style, with on-task bonuses.
        {done < targets.length ? ` Working out ${targets.length - done} more…`
          : exact < targets.length ? ' Double-checking the numbers…' : ''}
      </p>
      <table className="slayer-table">
        <thead>
          <tr>
            <th>Monster</th>
            {th('level', 'Level', 'num')}
            <th className="num">HP</th>
            {FAMILIES.map((f) => th(f, FAMILY_LABEL[f], `num fam-${f}`))}
            {th('best', 'Best', 'num')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const best = bestOf(t);
            return (
              <tr key={t.index} onClick={() => onOpen(t.index)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t.index); }} title="Open this monster">
                <td>
                  <span className="mon-name">{t.name}</span>
                  {t.versions.length > 0 && <span className="dim mon-versions">{t.versions.join(', ')}</span>}
                </td>
                <td className="num">{t.level ?? ''}</td>
                <td className="num">{monsters[t.index].skills.hp}</td>
                {FAMILIES.map((f) => {
                  const r = get(t, f);
                  const isBest = best && r === best;
                  return (
                    <td key={f} className={`num dps-cell fam-${f}${isBest ? ' is-best' : ''}`}
                      title={r && r.dps > 0 ? `${r.weapon ?? 'No weapon'}, ${r.style}` : undefined}>
                      {!r ? <span className="pending" aria-label="working" /> : r.dps > 0 ? r.dps.toFixed(2) : <span className="dim">–</span>}
                    </td>
                  );
                })}
                <td className="num">
                  {best && (
                    <span>{Number.isFinite(best.ttk) ? `${best.ttk.toFixed(1)}s ` : ''}<span className="dim">{best.weapon ?? best.style}</span></span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
