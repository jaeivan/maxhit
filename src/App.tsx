import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  basePlayer, Buffs, emptyEquipment, equipment, evaluate, EquipmentPiece, monsters, Monster, PlayerEquipment,
  PlayerSkills, Potion, Prayer, SKILL_DEFAULT, Spell,
} from './engine';
import {
  applyAdjust, availableSpells, Family, FAMILIES, FamilyResult, Loadout, makeAdjust, meetsReqs, resolveOwned, Spellbook,
  Upgrade, weaponFits,
} from './optimizer';
import { ALL_FIGHTS, Fight, QUEST_FIGHTS, styleRule } from './data/quests';
import { FIGHT_MONSTER } from './fights';
import type { WorkRequest, WorkResponse } from './worker';

// ---------- persisted settings ----------
interface Settings {
  mode: 'monsters' | 'quests';
  questName: string | null;
  fightId: string | null;
  monsterIndex: number;
  recent: number[];
  budget: number;
  onTask: boolean;
  kandarinDiary: boolean;
  prayers: Record<Family, Prayer | -1>;
  potions: Record<Family, Potion | -1>;
  spellbooks: Spellbook[];
  excluded: number[];
  includeInventory: boolean;
  manualSkills: PlayerSkills | null;
}
const DEFAULT_MONSTER = Math.max(0, monsters.findIndex((m) => m.name === 'Vorkath'));
function defaultSettings(): Settings {
  return {
    mode: 'monsters',
    questName: null,
    fightId: null,
    monsterIndex: DEFAULT_MONSTER,
    recent: [],
    budget: 50_000_000,
    onTask: false,
    kandarinDiary: true,
    prayers: { melee: Prayer.PIETY, ranged: Prayer.RIGOUR, magic: Prayer.AUGURY },
    potions: { melee: Potion.SUPER_COMBAT, ranged: Potion.RANGING, magic: Potion.SATURATED_HEART },
    spellbooks: ['standard', 'ancient', 'arceuus'],
    excluded: [],
    includeInventory: true,
    manualSkills: null,
  };
}
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('maxhit.settings');
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return defaultSettings();
}

const PRAYER_OPTIONS: Record<Family, { v: Prayer | -1; label: string }[]> = {
  melee: [{ v: Prayer.PIETY, label: 'Piety' }, { v: Prayer.CHIVALRY, label: 'Chivalry' },
    { v: Prayer.ULTIMATE_STRENGTH, label: 'Ultimate Strength' }, { v: -1, label: 'No prayer' }],
  ranged: [{ v: Prayer.RIGOUR, label: 'Rigour' }, { v: Prayer.DEADEYE, label: 'Deadeye' },
    { v: Prayer.EAGLE_EYE, label: 'Eagle Eye' }, { v: -1, label: 'No prayer' }],
  magic: [{ v: Prayer.AUGURY, label: 'Augury' }, { v: Prayer.MYSTIC_VIGOUR, label: 'Mystic Vigour' },
    { v: Prayer.MYSTIC_MIGHT, label: 'Mystic Might' }, { v: -1, label: 'No prayer' }],
};
const POTION_OPTIONS: Record<Family, { v: Potion | -1; label: string }[]> = {
  melee: [{ v: Potion.SUPER_COMBAT, label: 'Super combat' }, { v: Potion.OVERLOAD_PLUS, label: 'Overload (+)' },
    { v: Potion.STRENGTH, label: 'Strength' }, { v: -1, label: 'No potion' }],
  ranged: [{ v: Potion.RANGING, label: 'Ranging' }, { v: Potion.SUPER_RANGING, label: 'Super ranging' }, { v: -1, label: 'No potion' }],
  magic: [{ v: Potion.SATURATED_HEART, label: 'Saturated heart' }, { v: Potion.IMBUED_HEART, label: 'Imbued heart' },
    { v: Potion.MAGIC, label: 'Magic' }, { v: Potion.SUPER_MAGIC, label: 'Super magic' }, { v: -1, label: 'No potion' }],
};
const FAMILY_LABEL: Record<Family, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

// ---------- export file ----------
interface ExportState {
  rsn?: string; updatedAt: number; bankUpdatedAt: number;
  skills: Partial<PlayerSkills>; bank: number[]; worn: number[]; inventory: number[];
  /** Quest name -> NOT_STARTED | IN_PROGRESS; finished quests are absent. Missing entirely = not read yet. */
  unfinishedQuests?: Record<string, string>;
}

// ---------- formatting ----------
const gp = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`);
function parseGp(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kmb]?)$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[m[2]]);
}
const ago = (t: number) => {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
// combat level is in the wiki data but not in the engine's Monster type
const levelOf = (m: Monster) => (m as Monster & { level?: number }).level;
const monsterLabel = (m: Monster) => (m.version ? `${m.name} (${m.version})` : m.name);
const img = (e: EquipmentPiece) => `/img/equipment/${encodeURIComponent(e.image)}`;

// ---------- app ----------
export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);
  useEffect(() => { try { localStorage.setItem('maxhit.settings', JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);
  const fight: (Fight & { quest: string }) | null = settings.mode === 'quests' && settings.fightId
    ? ALL_FIGHTS.find((f) => f.id === settings.fightId) ?? null : null;
  const activeMonsterIndex = fight ? FIGHT_MONSTER.get(fight.id) ?? settings.monsterIndex : settings.monsterIndex;

  const [exp, setExp] = useState<ExportState | null>(null);
  const [expError, setExpError] = useState<string | null>(null);
  const [prices, setPrices] = useState<[number, number][] | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // export file: load, then reload whenever the plugin rewrites it
  const loadExport = useCallback(async () => {
    try {
      const r = await fetch('/api/state');
      if (!r.ok) { setExpError((await r.json()).error ?? `HTTP ${r.status}`); return; }
      setExp(await r.json()); setExpError(null);
    } catch (e) { setExpError(String(e)); }
  }, []);
  useEffect(() => {
    loadExport();
    const es = new EventSource('/api/state/events');
    es.onmessage = (m) => { if (m.data === 'changed') loadExport(); };
    return () => es.close();
  }, [loadExport]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/prices');
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        const j = await r.json() as { data: Record<string, { high: number | null; low: number | null }> };
        const out: [number, number][] = [];
        for (const [id, p] of Object.entries(j.data)) {
          const v = p.high ?? p.low; // instant-buy price, falling back to the last sale
          if (v) out.push([Number(id), v]);
        }
        setPrices(out); setPriceError(null);
      } catch (e) { setPriceError(String(e)); }
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const skills: PlayerSkills = useMemo(() => ({
    ...SKILL_DEFAULT, ...(exp?.skills ?? {}), ...(settings.manualSkills ?? {}),
  }), [exp, settings.manualSkills]);

  const ownedIds = useMemo(() => {
    if (!exp) return [];
    return [...exp.bank, ...exp.worn, ...(settings.includeInventory ? exp.inventory : [])];
  }, [exp, settings.includeInventory]);

  const buffs: Record<Family, Buffs> = useMemo(() => {
    const b = {} as Record<Family, Buffs>;
    for (const f of FAMILIES) {
      b[f] = {
        prayers: settings.prayers[f] === -1 ? [] : [settings.prayers[f] as Prayer],
        potions: settings.potions[f] === -1 ? [] : [settings.potions[f] as Potion],
        onSlayerTask: settings.onTask,
        kandarinDiary: settings.kandarinDiary,
      };
    }
    return b;
  }, [settings.prayers, settings.potions, settings.onTask, settings.kandarinDiary]);

  // ---------- workers ----------
  const workers = useRef<Record<Family, Worker> | null>(null);
  const reqId = useRef(0);
  const [results, setResults] = useState<Record<Family, { phase: 'owned' | 'full'; r: FamilyResult; id: number } | null>>({ melee: null, ranged: null, magic: null });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const w = {} as Record<Family, Worker>;
    for (const f of FAMILIES) {
      w[f] = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w[f].onmessage = (e: MessageEvent<WorkResponse>) => {
        const { id, family, phase, result, error } = e.data;
        if (error) { console.error(error); return; }
        if (id !== reqId.current) return;
        setResults((prev) => ({ ...prev, [family]: { phase, r: result, id } }));
      };
    }
    workers.current = w;
    return () => { for (const f of FAMILIES) w[f].terminate(); };
  }, []);

  useEffect(() => {
    if (!workers.current || !exp) return;
    const id = ++reqId.current;
    setPending(true);
    for (const f of FAMILIES) {
      const req: WorkRequest = {
        id, family: f, monsterIndex: activeMonsterIndex, skills, buffs, ownedIds,
        excluded: settings.excluded, spellbooks: settings.spellbooks, prices, budget: settings.budget,
        fightId: fight?.id ?? null,
      };
      workers.current[f].postMessage(req);
    }
  }, [exp, activeMonsterIndex, fight, skills, buffs, ownedIds, settings.excluded, settings.spellbooks, prices, settings.budget]);

  useEffect(() => {
    const done = FAMILIES.every((f) => results[f]?.id === reqId.current && (results[f]?.phase === 'full' || !prices || !results[f]?.r.best));
    if (done) setPending(false);
  }, [results, prices]);

  const monster = monsters[activeMonsterIndex];
  const selectMonster = (i: number) => patch({
    monsterIndex: i,
    recent: [i, ...settings.recent.filter((x) => x !== i)].slice(0, 8),
  });
  const exclude = (id: number) => patch({ excluded: [...new Set([...settings.excluded, id])] });

  return (
    <div className="app">
      <nav className="modes" aria-label="What to plan for">
        <button type="button" aria-pressed={settings.mode === 'monsters'} onClick={() => patch({ mode: 'monsters' })}>Monsters</button>
        <button type="button" aria-pressed={settings.mode === 'quests'} onClick={() => patch({ mode: 'quests' })}>Quests</button>
      </nav>
      <header className="top">
        {settings.mode === 'monsters'
          ? <MonsterPicker monster={monster} onPick={selectMonster} recent={settings.recent} />
          : <QuestPicker exp={exp} questName={settings.questName} fightId={settings.fightId}
              onPick={(questName, fightId) => patch({ questName, fightId })} />}
        <div className="status">
          <SyncStatus exp={exp} error={expError} />
          <span className={priceError ? 'warn' : ''}>
            {priceError ? 'GE prices unavailable, showing owned gear only' : prices ? `${prices.length.toLocaleString()} GE prices loaded` : 'Loading GE prices'}
          </span>
          <BudgetInput value={settings.budget} onChange={(budget) => patch({ budget })} />
          <label className="check">
            <input type="checkbox" checked={settings.onTask} onChange={(e) => patch({ onTask: e.target.checked })} />
            On slayer task
          </label>
          <button type="button" className="ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
            {showSettings ? 'Close settings' : 'Settings'}
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel settings={settings} patch={patch} skills={skills} fromPlugin={!!exp} />
      )}

      {!exp && <EmptyState error={expError} />}

      {exp && fight && <FightInfo fight={fight} />}
      {exp && settings.mode === 'quests' && !fight && (
        <section className="empty"><p>Pick a quest and one of its fights to see what to bring.</p></section>
      )}
      {exp && (settings.mode === 'monsters' || fight) && (
        <main className={`columns${pending ? ' is-pending' : ''}`}>
          {FAMILIES.map((f) => (
            <FamilyColumn
              key={f + activeMonsterIndex + (fight?.id ?? '')}
              family={f}
              monster={monster}
              fight={fight}
              state={results[f]}
              skills={skills}
              buffs={buffs[f]}
              ownedIds={ownedIds}
              excluded={settings.excluded}
              spellbooks={settings.spellbooks}
              hasPrices={!!prices}
              budget={settings.budget}
              onExclude={exclude}
            />
          ))}
        </main>
      )}
    </div>
  );
}

// ---------- header pieces ----------
function MonsterPicker({ monster, onPick, recent }: { monster: Monster; onPick: (i: number) => void; recent: number[] }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return recent.map((i) => ({ i, m: monsters[i] }));
    const scored: { i: number; m: Monster; score: number }[] = [];
    monsters.forEach((m, i) => {
      const n = monsterLabel(m).toLowerCase();
      const at = n.indexOf(s);
      if (at >= 0) scored.push({ i, m, score: (at === 0 ? 0 : 10) + n.length / 100 });
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, 40);
  }, [q, recent]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (i: number) => { onPick(i); setQ(''); setOpen(false); inputRef.current?.blur(); };

  return (
    <div className="picker">
      <label htmlFor="monster" className="picker-label">What are you fighting?</label>
      <input
        id="monster"
        ref={inputRef}
        className="picker-input"
        placeholder={monsterLabel(monster)}
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="monster-list"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && matches[hi]) pick(matches[hi].i);
          if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
        }}
      />
      <div className="picker-meta">
        {levelOf(monster) ? <span>Level {levelOf(monster)}</span> : null}
        <span>{monster.skills.hp} hitpoints</span>
        <span>Defence {monster.skills.def}</span>
        <span className="hint">Press / to search</span>
      </div>
      {open && matches.length > 0 && (
        <ul id="monster-list" className="picker-list" role="listbox">
          {!q && <li className="picker-heading" aria-hidden>Recent</li>}
          {matches.map(({ i, m }, k) => (
            <li
              key={i}
              role="option"
              aria-selected={k === hi}
              className={k === hi ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setHi(k)}
            >
              <span>{monsterLabel(m)}</span>
              {levelOf(m) ? <span className="dim">Level {levelOf(m)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SyncStatus({ exp, error }: { exp: ExportState | null; error: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  if (!exp) return <span className="warn">{error ? 'No RuneLite export found' : 'Reading RuneLite export'}</span>;
  if (!exp.bankUpdatedAt) return <span className="warn">{exp.rsn ?? 'Account'}: open your bank once so it can be read</span>;
  return <span>{exp.rsn ?? 'Account'}, bank synced {ago(exp.bankUpdatedAt)}</span>;
}

function BudgetInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(gp(value));
  useEffect(() => { setText(gp(value)); }, [value]);
  const commit = () => { const n = parseGp(text); if (n !== null) onChange(n); else setText(gp(value)); };
  return (
    <label className="budget">
      Budget
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        aria-describedby="budget-hint"
      />
      <span id="budget-hint" className="sr-only">Accepts values like 25m or 1.2b</span>
    </label>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="empty">
      <h2>Connect RuneLite</h2>
      <p>
        The optimizer reads the file the MaxHit plugin writes to
        <code> ~/.runelite/maxhit/</code>. Start RuneLite with the plugin enabled, log in, and open your bank once.
        This page updates by itself as soon as the file appears.
      </p>
      {error && <p className="dim">Details: {error}</p>}
    </section>
  );
}

// ---------- settings ----------
function SettingsPanel({ settings, patch, skills, fromPlugin }: {
  settings: Settings; patch: (p: Partial<Settings>) => void; skills: PlayerSkills; fromPlugin: boolean;
}) {
  const excludedItems = settings.excluded.map((id) => equipment.find((e) => e.id === id)).filter(Boolean) as EquipmentPiece[];
  const toggleBook = (b: Spellbook) => patch({
    spellbooks: settings.spellbooks.includes(b) ? settings.spellbooks.filter((x) => x !== b) : [...settings.spellbooks, b],
  });
  const skillKeys: [keyof PlayerSkills, string][] = [['atk', 'Attack'], ['str', 'Strength'], ['def', 'Defence'], ['ranged', 'Ranged'], ['magic', 'Magic'], ['prayer', 'Prayer'], ['hp', 'Hitpoints']];
  return (
    <section className="settings" aria-label="Settings">
      <div className="settings-group">
        <h3>Boosts</h3>
        {FAMILIES.map((f) => (
          <div key={f} className={`boost-row fam-${f}`}>
            <span className="fam-name">{FAMILY_LABEL[f]}</span>
            <select value={settings.prayers[f]} onChange={(e) => patch({ prayers: { ...settings.prayers, [f]: Number(e.target.value) } })}>
              {PRAYER_OPTIONS[f].map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
            <select value={settings.potions[f]} onChange={(e) => patch({ potions: { ...settings.potions, [f]: Number(e.target.value) } })}>
              {POTION_OPTIONS[f].map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        ))}
        <p className="dim">Pick only prayers you have unlocked. Rigour, Augury, Deadeye and Mystic Vigour need their prayer scrolls.</p>
      </div>
      <div className="settings-group">
        <h3>Spellbooks</h3>
        {(['standard', 'ancient', 'arceuus'] as Spellbook[]).map((b) => (
          <label key={b} className="check">
            <input type="checkbox" checked={settings.spellbooks.includes(b)} onChange={() => toggleBook(b)} />
            {b[0].toUpperCase() + b.slice(1)}
          </label>
        ))}
        <h3>Gear sources</h3>
        <label className="check">
          <input type="checkbox" checked={settings.includeInventory} onChange={(e) => patch({ includeInventory: e.target.checked })} />
          Count items in my inventory
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.kandarinDiary} onChange={(e) => patch({ kandarinDiary: e.target.checked })} />
          Kandarin hard diary (enchanted bolt procs)
        </label>
      </div>
      <div className="settings-group">
        <h3>Levels</h3>
        <p className="dim">{fromPlugin ? 'Read from RuneLite. Override a level to test a goal.' : 'Not connected to RuneLite yet.'}</p>
        <div className="skills">
          {skillKeys.map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type="number" min={1} max={99} value={skills[k]}
                onChange={(e) => patch({ manualSkills: { ...(settings.manualSkills ?? skills), [k]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) } })}
              />
            </label>
          ))}
        </div>
        {settings.manualSkills && <button type="button" className="ghost" onClick={() => patch({ manualSkills: null })}>Use RuneLite levels</button>}
      </div>
      <div className="settings-group">
        <h3>Excluded items</h3>
        {excludedItems.length === 0 && <p className="dim">None. Exclude an item from any slot menu and it stops being suggested.</p>}
        <ul className="excluded">
          {excludedItems.map((e) => (
            <li key={e.id}>
              <img src={img(e)} alt="" width={24} height={24} />
              {e.name}
              <button type="button" className="ghost" onClick={() => patch({ excluded: settings.excluded.filter((x) => x !== e.id) })}>Include again</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- results ----------
const GRID: (keyof PlayerEquipment | null)[][] = [
  [null, 'head', null],
  ['cape', 'neck', 'ammo'],
  ['weapon', 'body', 'shield'],
  [null, 'legs', null],
  ['hands', 'feet', 'ring'],
];
const SLOT_LABEL: Record<keyof PlayerEquipment, string> = {
  head: 'Head', cape: 'Cape', neck: 'Neck', ammo: 'Ammo', weapon: 'Weapon', body: 'Body',
  shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring',
};

function FamilyColumn(props: {
  family: Family; monster: Monster; fight: Fight | null; state: { phase: 'owned' | 'full'; r: FamilyResult } | null;
  skills: PlayerSkills; buffs: Buffs; ownedIds: number[]; excluded: number[]; spellbooks: Spellbook[];
  hasPrices: boolean; budget: number; onExclude: (id: number) => void;
}) {
  const { family, monster, state, skills, buffs } = props;
  const best = state?.r.best ?? null;
  // manual edits / previews live per column and reset when the optimal loadout changes
  const [custom, setCustom] = useState<{ eq: PlayerEquipment; spell: Spell | null; note: string } | null>(null);
  const bestKey = best ? Object.values(best.equipment).map((e) => e?.id ?? 0).join(',') + (best.spell?.name ?? '') : '';
  useEffect(() => { setCustom(null); }, [bestKey]);

  const rule = props.fight ? styleRule(props.fight, family) : undefined;
  const adjust = useMemo(() => makeAdjust(rule || undefined), [props.fight, family]); // eslint-disable-line react-hooks/exhaustive-deps
  const player = useMemo(
    () => basePlayer(skills, props.fight?.noPrayer ? { ...buffs, prayers: [] } : buffs),
    [skills, buffs, props.fight],
  );
  const score = useCallback((eq: PlayerEquipment, spell: Spell | null) => {
    const r = evaluate(player, monster, eq, family, spell);
    return adjust ? applyAdjust(r, adjust(eq, spell)) : r;
  }, [player, monster, family, adjust]);
  const shownEq = custom?.eq ?? best?.equipment ?? emptyEquipment();
  const shownSpell = custom ? custom.spell : best?.spell ?? null;
  const shown = useMemo(() => (custom ? score(custom.eq, custom.spell) : best?.result ?? null), [custom, best, score]);
  const delta = custom && best && shown ? shown.dps - best.result.dps : 0;

  const owned = useMemo(() => resolveOwned(props.ownedIds).filter((e) => !props.excluded.includes(e.id) && meetsReqs(e, skills)),
    [props.ownedIds, props.excluded, skills]);

  const preview = (lo: Loadout, note: string) => setCustom({ eq: lo.equipment, spell: lo.spell, note });

  return (
    <section className={`col fam-${family}`} aria-label={`${FAMILY_LABEL[family]} setup`}>
      <header className="col-head">
        <h2>{FAMILY_LABEL[family]}</h2>
        {props.fight?.manual && <p className="dim">{props.fight.manual}</p>}
        {!props.fight?.manual && !state && <p className="dim">Working out your best gear</p>}
        {!props.fight?.manual && state?.r.blocked && <p className="dim">{FAMILY_LABEL[family]} can't damage {monster.name} in this fight.</p>}
        {!props.fight?.manual && state && !state.r.blocked && !best && (
          <p className="dim">You can't damage {monster.name} with {family} using what you own.</p>
        )}
        {!props.fight?.manual && state?.r.missing && (
          <p className="missing">
            Not in your bank: {Object.values(state.r.missing).map((names) => (names.length > 1
              ? `${names[0]} (or ${names.slice(1).join(', ')})` : names[0])).join(', and ')}.
            {best ? ' This setup assumes you get it.' : ''}
          </p>
        )}
        {shown && !props.fight?.manual && (
          <>
            <div className="dps">
              <span className="dps-num">{shown.dps.toFixed(2)}</span>
              <span className="dps-unit">DPS</span>
              {custom && Math.abs(delta) > 0.005 && (
                <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(2)}</span>
              )}
            </div>
            <dl className="stats">
              <div><dt>Max hit</dt><dd>{shown.maxHit}</dd></div>
              <div><dt>Accuracy</dt><dd>{(shown.accuracy * 100).toFixed(1)}%</dd></div>
              <div><dt>Kill time</dt><dd>{Number.isFinite(shown.ttk) ? `${shown.ttk.toFixed(1)}s` : 'n/a'}</dd></div>
              <div><dt>Style</dt><dd>{shownSpell ? shownSpell.name : shown.style.name}</dd></div>
            </dl>
          </>
        )}
        {custom && (
          <p className="custom-note">
            {custom.note}
            <button type="button" className="ghost" onClick={() => setCustom(null)}>Back to best owned</button>
          </p>
        )}
      </header>

      {best && !props.fight?.manual && (
        <GearGrid
          family={family} eq={shownEq} spell={shownSpell} owned={owned} score={score}
          baseline={shown?.dps ?? 0}
          onSwap={(eq, spell, note) => setCustom({ eq, spell, note })}
          onExclude={props.onExclude}
          spellbooks={props.spellbooks} magicLevel={skills.magic}
        />
      )}

      {best && !props.fight?.manual && <Upgrades state={state!} hasPrices={props.hasPrices} budget={props.budget} onPreview={preview} />}
    </section>
  );
}

function GearGrid(props: {
  family: Family; eq: PlayerEquipment; spell: Spell | null; owned: EquipmentPiece[];
  score: (eq: PlayerEquipment, spell: Spell | null) => { dps: number } | null; baseline: number;
  onSwap: (eq: PlayerEquipment, spell: Spell | null, note: string) => void; onExclude: (id: number) => void;
  spellbooks: Spellbook[]; magicLevel: number;
}) {
  const [openSlot, setOpenSlot] = useState<keyof PlayerEquipment | 'spell' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openSlot) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpenSlot(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenSlot(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [openSlot]);

  // DPS for every owned option in the open slot, computed on demand (each eval is ~0.1 ms)
  const options = useMemo(() => {
    if (!openSlot) return [];
    if (openSlot === 'spell') {
      return availableSpells(props.magicLevel, props.spellbooks).map((sp) => ({
        key: sp.name, label: sp.name, item: null as EquipmentPiece | null, spell: sp,
        dps: props.score(props.eq, sp)?.dps ?? 0,
      })).sort((a, b) => b.dps - a.dps);
    }
    const list = [null, ...props.owned.filter((e) => e.slot === openSlot && (openSlot !== 'weapon' || weaponFits(e, props.family)))];
    return list.map((item) => {
      const eq = { ...props.eq, [openSlot]: item };
      if (openSlot === 'weapon' && item?.isTwoHanded) eq.shield = null;
      if (openSlot === 'shield' && item && props.eq.weapon?.isTwoHanded) eq.weapon = null;
      return {
        key: String(item?.id ?? 'none'), label: item?.name ?? 'Nothing', item, spell: props.spell,
        dps: props.score(eq, props.spell)?.dps ?? 0,
      };
    }).sort((a, b) => b.dps - a.dps);
  }, [openSlot, props.owned, props.eq, props.spell, props.score, props.family, props.magicLevel, props.spellbooks]);

  const choose = (o: typeof options[number]) => {
    if (openSlot === 'spell') { props.onSwap(props.eq, o.spell, `Casting ${o.label}`); setOpenSlot(null); return; }
    const slot = openSlot as keyof PlayerEquipment;
    const eq = { ...props.eq, [slot]: o.item };
    if (slot === 'weapon' && o.item?.isTwoHanded) eq.shield = null;
    if (slot === 'shield' && o.item && props.eq.weapon?.isTwoHanded) eq.weapon = null;
    props.onSwap(eq, o.spell, `${SLOT_LABEL[slot]}: ${o.label}`);
    setOpenSlot(null);
  };

  return (
    <div className="gear" ref={ref}>
      <div className="grid">
        {GRID.flat().map((slot, i) => {
          if (!slot) return <span key={i} className="cell blank" aria-hidden />;
          const item = props.eq[slot];
          return (
            <button
              key={slot} type="button"
              className={`cell${item ? '' : ' empty-slot'}${openSlot === slot ? ' open' : ''}`}
              title={item ? `${SLOT_LABEL[slot]}: ${item.name}` : `${SLOT_LABEL[slot]}: empty`}
              aria-label={item ? `${SLOT_LABEL[slot]}: ${item.name}. Change` : `${SLOT_LABEL[slot]}: empty. Change`}
              onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
            >
              {item ? <img src={img(item)} alt="" /> : <span className="slot-name">{SLOT_LABEL[slot]}</span>}
            </button>
          );
        })}
      </div>
      <ul className="gear-list">
        {GRID.flat().filter(Boolean).map((slot) => {
          const item = props.eq[slot!];
          return item ? <li key={slot}><span className="dim">{SLOT_LABEL[slot!]}</span> {item.name}</li> : null;
        })}
        {props.spell && (
          <li>
            <span className="dim">Spell</span>{' '}
            <button type="button" className="link" onClick={() => setOpenSlot(openSlot === 'spell' ? null : 'spell')}>{props.spell.name}</button>
          </li>
        )}
      </ul>
      {openSlot && (
        <div className="slot-menu" role="dialog" aria-label={`Choose ${openSlot}`}>
          <p className="slot-menu-title">
            {openSlot === 'spell' ? 'Spells you can cast' : `Your ${SLOT_LABEL[openSlot].toLowerCase()} options`}
          </p>
          <ul>
            {options.map((o) => {
              const d = o.dps - props.baseline;
              const current = openSlot === 'spell' ? o.spell?.name === props.spell?.name : (o.item?.id ?? null) === (props.eq[openSlot as keyof PlayerEquipment]?.id ?? null);
              return (
                <li key={o.key} className={current ? 'current' : ''}>
                  <button type="button" className="opt" onClick={() => choose(o)}>
                    {o.item ? <img src={img(o.item)} alt="" width={28} height={28} /> : <span className="opt-blank" />}
                    <span className="opt-name">{o.label}</span>
                    <span className={`opt-dps ${current ? '' : d > 0.005 ? 'up' : d < -0.005 ? 'down' : ''}`}>
                      {current ? 'worn' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}`}
                    </span>
                  </button>
                  {o.item && (
                    <button type="button" className="ghost small" onClick={() => { props.onExclude(o.item!.id); setOpenSlot(null); }}
                      title="Stop suggesting this item">Exclude</button>
                  )}
                </li>
              );
            })}
            {options.length <= 1 && openSlot !== 'spell' && <li className="dim">Nothing else you own fits this slot.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Upgrades({ state, hasPrices, budget, onPreview }: {
  state: { phase: 'owned' | 'full'; r: FamilyResult }; hasPrices: boolean; budget: number;
  onPreview: (lo: Loadout, note: string) => void;
}) {
  const [sort, setSort] = useState<'gain' | 'value'>('gain');
  if (!hasPrices) return null;
  if (state.phase !== 'full') return <div className="upgrades"><h3>Upgrades</h3><p className="dim">Checking the GE for upgrades</p></div>;
  const ups = [...state.r.upgrades].sort((a, b) => (sort === 'gain' ? b.gain - a.gain : b.perMil - a.perMil)).slice(0, 10);
  const plan = state.r.budgetPlan;
  const baseDps = state.r.best!.result.dps;
  return (
    <div className="upgrades">
      {plan ? (
        <div className="plan">
          <h3>Best use of {gp(budget)}</h3>
          <ul>
            {plan.buys.map((u) => (
              <li key={u.item.id}>
                <img src={img(u.item)} alt="" width={24} height={24} />
                <span>{u.buyItem.name}</span>
                <span className="gold">{gp(u.price)}</span>
              </li>
            ))}
          </ul>
          <p>
            {baseDps.toFixed(2)} to <strong>{plan.loadout.result.dps.toFixed(2)} DPS</strong> for <span className="gold">{gp(plan.spent)}</span>
            <button type="button" className="ghost" onClick={() => onPreview(plan.loadout, `Previewing the ${gp(budget)} plan`)}>Preview</button>
          </p>
        </div>
      ) : (
        <div className="plan"><h3>Best use of {gp(budget)}</h3><p className="dim">Nothing within budget improves this setup.</p></div>
      )}
      <div className="up-head">
        <h3>Single upgrades</h3>
        <div className="seg" role="group" aria-label="Sort upgrades">
          <button type="button" aria-pressed={sort === 'gain'} onClick={() => setSort('gain')}>Biggest gain</button>
          <button type="button" aria-pressed={sort === 'value'} onClick={() => setSort('value')}>Best value</button>
        </div>
      </div>
      {ups.length === 0 && <p className="dim">Nothing on the GE beats your current gear here.</p>}
      <ul className="up-list">
        {ups.map((u: Upgrade) => (
          <li key={u.item.id}>
            <button type="button" className="up-row" onClick={() => onPreview(u.loadout, `Previewing ${u.buyItem.name} (${gp(u.price)})`)}>
              <img src={img(u.item)} alt="" width={28} height={28} />
              <span className="up-name">{u.buyItem.name}</span>
              <span className="up-gain">+{u.gain.toFixed(2)}</span>
              <span className="gold">{gp(u.price)}</span>
              <span className="dim up-val">{u.perMil.toFixed(u.perMil < 0.1 ? 3 : 2)}/m</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- quests ----------
const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: 'In progress', NOT_STARTED: 'Not started' };

function QuestPicker({ exp, questName, fightId, onPick }: {
  exp: ExportState | null; questName: string | null; fightId: string | null;
  onPick: (quest: string | null, fight: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const known = exp?.unfinishedQuests !== undefined;
  const unfinished = exp?.unfinishedQuests ?? {};
  const statusOf = (name: string) => (known ? (unfinished[name] ?? 'FINISHED') : null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = QUEST_FIGHTS.map((x) => x.quest);
    if (s) return all.filter((n) => n.toLowerCase().includes(s));
    // default: your unfinished quests with fights, in-progress first
    if (known) {
      return all.filter((n) => unfinished[n]).sort((a, b) => (unfinished[a] === 'IN_PROGRESS' ? -1 : 0) - (unfinished[b] === 'IN_PROGRESS' ? -1 : 0));
    }
    return all;
  }, [q, known, unfinished]);

  const quest = QUEST_FIGHTS.find((x) => x.quest === questName) ?? null;

  return (
    <div className="quest-picker">
      <label htmlFor="quest-search" className="picker-label">Which quest are you doing?</label>
      <input
        id="quest-search" className="quest-search" value={q} autoComplete="off"
        placeholder={known ? 'Search all quests with fights' : 'Search quests with fights'}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="dim quest-hint">
        {q ? `${list.length} matching` : known
          ? `${list.length} of your unfinished quests have fights`
          : 'Your quest progress appears here once the plugin has read it'}
      </p>
      <ul className="quest-list">
        {list.map((name) => {
          const st = statusOf(name);
          return (
            <li key={name}>
              <button
                type="button" aria-pressed={name === questName}
                onClick={() => { const first = QUEST_FIGHTS.find((x) => x.quest === name)!.fights[0]; onPick(name, first.id); setQ(''); }}
              >
                <span>{name}</span>
                {st && st !== 'FINISHED' && <span className={`status s-${st}`}>{STATUS_LABEL[st]}</span>}
                {st === 'FINISHED' && <span className="status s-done">Done</span>}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="dim">{known && !q ? 'No unfinished quests with fights. Search to revisit one.' : 'No quest with a fight matches that.'}</li>}
      </ul>
      {quest && (
        <div className="fight-tabs" role="group" aria-label={`${quest.quest} fights`}>
          {quest.fights.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === fightId} onClick={() => onPick(quest.quest, f.id)}>{f.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function FightInfo({ fight }: { fight: Fight & { quest: string } }) {
  const rules: string[] = [];
  const blocked = FAMILIES.filter((f) => styleRule(fight, f) === false).map((f) => FAMILY_LABEL[f].toLowerCase());
  if (blocked.length) rules.push(`Can't be damaged with ${blocked.join(' or ')}.`);
  if (fight.noPrayer) rules.push('Prayer is disabled in this fight.');
  const allReq = { ...(fight.all?.require ?? {}) };
  for (const [slot, names] of Object.entries(allReq)) rules.push(`${slotLabel(slot)}: must wear ${names!.join(' or ')}.`);
  return (
    <section className="fight-info" aria-label="Fight rules">
      <h2>{fight.name} <span className="dim">{fight.quest}</span></h2>
      {rules.length > 0 && <ul>{rules.map((r) => <li key={r}>{r}</li>)}</ul>}
      {fight.note && <p>{fight.note}</p>}
      {!rules.length && !fight.note && !fight.manual && <p className="dim">No special gear rules for this fight.</p>}
    </section>
  );
}

function slotLabel(slot: string) {
  return (SLOT_LABEL as Record<string, string>)[slot] ?? slot;
}
