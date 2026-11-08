# Gear optimizer

A personal OSRS gear optimizer. Pick a monster. For melee, ranged and magic, it shows the best setup
from what you own and which GE purchases would raise your DPS the most, overall and within a budget.
Every number comes from the OSRS Wiki's own DPS calculator engine; this project only decides which
loadouts to score.

```
RuneLite + plugin ──writes──▶ ~/.runelite/gear-optimizer/<account>.json
                                          │  (watched)
local web app (Vite) ◀────────────────────┘    GE prices ◀── prices.runescape.wiki (proxied, cached 5 min)
   └─ 3 web workers (melee / ranged / magic) running the optimizer on the wiki DPS engine
```

Nothing leaves your machine except the price request to the wiki.

## Setup

Requirements: Node 20+, git, and Java 11+ for the plugin.

```bash
npm install
npm run setup     # clones the wiki DPS engine at a pinned commit, applies the perf patch, builds item metadata
npm run dev       # http://localhost:5173
```

### The RuneLite plugin

The plugin isn't on the Plugin Hub, so it runs through RuneLite's developer launcher:

```bash
cd plugin
./gradlew run     # launches RuneLite with "Gear Optimizer Export" enabled
```

If you log in with a Jagex account, the dev client needs your credentials written once. See RuneLite's
wiki page "Using Jagex Accounts" (developer guide), which uses the `--insecure-write-credentials` launcher option.

After logging in, **open your bank once**. The plugin remembers it between sessions and rewrites the file
whenever your bank, worn gear, inventory or levels change. The web page updates by itself.

The plugin was written against the current RuneLite API (verified against the RuneLite source), but it
couldn't be compiled against the real client in the environment where it was built. If `./gradlew run`
reports a compile error, it'll be a one-line API rename.

## Using it

- Press `/` and type a monster. Results for gear you own appear in about 0.3 s, and GE upgrades about a second later.
- Click any equipment slot to see every item you own for that slot with its DPS change, and swap it in.
  The **Exclude** button there stops an item from being suggested (useful for gear you're saving, or
  can't wear because of a quest requirement).
- Click an upgrade or **Preview** on the budget plan to see the resulting loadout.
- **Settings**: prayers and potions per style, spellbooks, whether inventory counts, level overrides
  (handy for "what if I had 99 ranged"), and excluded items.

`npm run dev:offline` serves `./prices.json` (a saved copy of the wiki's `/latest` response) instead of
calling the API. `GEAROPT_DIR` points the app at a different export folder.

## How the search works

1. Your bank, worn gear and inventory are mapped to wiki item IDs. Charged and uncharged versions are merged;
   for buying, the uncharged version is priced and the charged one is scored.
2. Per slot, items that are no better in any relevant stat (and no cheaper) than another are dropped.
   Items with effects that stats don't capture (salve, slayer helm, void, crystal, inquisitor, keris, etc.)
   are never dropped. That list is pulled automatically from the engine source.
3. Weapons are ranked, the gear around the top few is settled by coordinate descent, and complete sets
   (void, barrows, obsidian, moons) are tried as starting points.
4. Upgrades: every buyable item is scored as a swap. Promising weapons get the gear re-settled around them.
   The budget plan picks greedily by gain and by DPS per GP, then re-optimizes.

Checked against brute force (every combination of owned items: 410k loadouts for melee, 2M for magic)
on Graardor, Vorkath, Abyssal demon, Jad, Vet'ion and Kalphite Queen: same answer every time.

```bash
npm test              # sample bank across 4 monsters
npm run test:stress   # every item priced, worst-case timings
npm run test:brute    # exhaustive comparison (about 1 min per monster)
```

## Known limits

- Level requirements are best-effort (osrsreboxed data, plus name matching for newer items). Quest and
  diary requirements are ignored. Use Exclude for anything you can't actually wear.
- Owned gear only covers the bank, worn items and inventory, not the POH costume room, group storage or the looting bag.
- Only GE-tradeable upgrades are suggested (no "go get an infernal cape").
- Ammo prices aren't counted against the budget. A blowpipe is assumed to use your best owned dart (or dragon darts).
- God spells, Iban Blast and Magic Dart are skipped, and special attacks aren't modelled.
- Monster-specific inputs (ToA invocation, CoX party size) use the engine's defaults.

## License

GPL-3.0, because it builds on the OSRS Wiki DPS calculator (weirdgloop/osrs-dps-calc, GPL-3.0).
The plugin's Gradle setup is adapted from runelite/example-plugin (BSD-2-Clause).
