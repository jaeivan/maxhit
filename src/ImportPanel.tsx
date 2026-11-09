import { useState, type ReactNode } from 'react';
import { equipment } from './engine';
import { fetchHiscores, fetchWikiSync, parseBankText, type ManualData } from './imports';

type Source = 'auto' | 'plugin' | 'manual';
const equipIds = new Set(equipment.map((e) => e.id));

export function ImportPanel({ manual, setManual, pluginFound, usingManual, dataSource, setDataSource, intro }: {
  manual: ManualData; setManual: (f: (m: ManualData) => ManualData) => void;
  pluginFound: boolean; usingManual: boolean; dataSource: Source; setDataSource: (s: Source) => void;
  intro: ReactNode;
}) {
  const [text, setText] = useState('');
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rsn, setRsn] = useState(manual.rsn ?? '');
  const [hsMsg, setHsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [looking, setLooking] = useState(false);

  const importBank = () => {
    const p = parseBankText(text);
    if (!p.ids.length) { setBankMsg({ ok: false, text: 'No items found. Paste the copied list from Bank Memory, or one item per line.' }); return; }
    const gear = p.ids.filter((id) => equipIds.has(id)).length;
    setManual((m) => ({ ...m, bank: p.ids, bankUpdatedAt: Date.now() }));
    setText('');
    setBankMsg({ ok: true, text: `Imported ${p.ids.length.toLocaleString()} items, ${gear.toLocaleString()} of them gear.`
      + (p.unmatched.length ? ` Couldn't match ${p.unmatched.length}: ${p.unmatched.slice(0, 4).join(', ')}${p.unmatched.length > 4 ? '…' : ''}` : '') });
  };

  const sync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const p = await fetchWikiSync();
      const now = Date.now();
      setManual((m) => ({ ...m, rsn: p.username, worn: p.worn, wornUpdatedAt: now,
        skills: { ...m.skills, ...p.skills }, skillsUpdatedAt: now, skillsFrom: 'wikisync' }));
      setRsn(p.username);
      setSyncMsg({ ok: true, text: `Synced ${p.username}: ${p.worn.length} worn items and levels.` });
    } catch (e) { setSyncMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setSyncing(false);
  };

  const lookup = async () => {
    if (!rsn.trim()) return;
    setLooking(true); setHsMsg(null);
    try {
      const skills = await fetchHiscores(rsn);
      setManual((m) => ({ ...m, rsn: rsn.trim(), skills: { ...m.skills, ...skills }, skillsUpdatedAt: Date.now(), skillsFrom: 'hiscores' }));
      setHsMsg({ ok: true, text: `Loaded ${Object.keys(skills).length} levels for ${rsn.trim()}.` });
    } catch (e) { setHsMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setLooking(false);
  };

  const msg = (m: { ok: boolean; text: string } | null) => m && <p className={m.ok ? 'dim' : 'warn'} role="status">{m.text}</p>;

  return (
    <>
      {intro}
      <section className="settings import" aria-label="Import gear and levels">
        <div className="settings-group">
          <h3>Bank</h3>
          <p className="dim">
            Install <b>Bank Memory</b> from the Plugin Hub and open your bank in-game. In its side panel, right-click
            the item list and copy the item data, then paste it here. A plain list of item names or ids works too.
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false}
            placeholder={'Item id\tItem name\tItem quantity\n4151\tAbyssal whip\t1'} aria-label="Bank items" />
          <div className="row">
            <button type="button" className="ghost" onClick={importBank} disabled={!text.trim()}>Import bank</button>
            {manual.bank.length > 0 && (
              <button type="button" className="ghost small" onClick={() => { setManual((m) => ({ ...m, bank: [], bankUpdatedAt: 0 })); setBankMsg(null); }}>
                Clear {manual.bank.length.toLocaleString()} items
              </button>
            )}
          </div>
          {msg(bankMsg)}
        </div>

        <div className="settings-group">
          <h3>Worn gear and levels</h3>
          <p className="dim">
            Install <b>WikiSync</b> from the Plugin Hub and log in. It shares what you're wearing and your combat levels with
            pages on this computer. Bank Memory doesn't include worn items, so sync again after changing gear.
          </p>
          <div className="row">
            <button type="button" className="ghost" onClick={sync} disabled={syncing}>{syncing ? 'Looking for RuneLite…' : 'Sync from WikiSync'}</button>
            {manual.worn.length > 0 && <span className="dim">{manual.worn.length} worn items saved</span>}
          </div>
          {msg(syncMsg)}
        </div>

        <div className="settings-group">
          <h3>Levels from the hiscores</h3>
          <p className="dim">No WikiSync? Look up your levels by name instead.</p>
          <form className="row" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
            <input className="text" value={rsn} onChange={(e) => setRsn(e.target.value)} maxLength={12} placeholder="Display name" aria-label="Display name" />
            <button type="submit" className="ghost" disabled={looking || !rsn.trim()}>{looking ? 'Looking up…' : 'Look up'}</button>
          </form>
          {msg(hsMsg)}
        </div>

        {pluginFound && (
          <div className="settings-group">
            <h3>Use</h3>
            <p className="dim">The MaxHit plugin export was found too. {usingManual ? 'Using imported data.' : 'Using the plugin export.'}</p>
            <select value={dataSource} onChange={(e) => setDataSource(e.target.value as Source)} aria-label="Data source">
              <option value="auto">Plugin when available</option>
              <option value="plugin">Plugin export</option>
              <option value="manual">Imported data</option>
            </select>
          </div>
        )}
      </section>
    </>
  );
}
