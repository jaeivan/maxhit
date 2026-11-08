# MaxHit

An OSRS combat companion for RuneLite. Pick a monster, a quest fight or a slayer task and it shows your best
melee, ranged and magic setups from the gear you own, plus the GE upgrades that add the most DPS. All DPS numbers come from the
[OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) engine.

## Setup

Needs Node 20+, git and Java 11+.

```bash
npm install
npm run setup   # fetches the wiki DPS engine and prepares item data
npm run dev     # http://localhost:5173

cd plugin && ./gradlew run   # RuneLite with the MaxHit plugin
```

Log in and open your bank once. The plugin saves your bank, gear, inventory, levels, quest progress and slayer task to
`~/.runelite/maxhit/`, and the page updates by itself. With a Jagex account, the dev client needs a one-time
login setup: see RuneLite's "Using Jagex Accounts" wiki page.

## Use

- `/` to search monsters. Click a gear slot to compare everything you own for it; click an upgrade to preview it.
- **Quests** lists your unfinished quests that have fights (108 fights across 57 quests). Recommendations follow
  each fight's rules, like Elvarg's anti-dragon shield or Kamil's fire-spells-only, and flag required items you don't own.
- **Slayer** opens on your current task and lists every monster that counts for it (matched like RuneLite's slayer
  plugin), with your on-task DPS per style. Click a monster to see the full setup.
- Settings: prayers, potions, spellbooks, level overrides, excluded items.
- `npm test` runs a sample bank, `npm run test:quests` / `test:slayer` check the quest and slayer data, and
  `npm run test:brute` compares the optimizer against brute force.

## Limits

- Level requirements are best-effort and quest requirements are ignored, so exclude gear you can't wear.
- Only the bank, worn gear and inventory count as owned. Only GE-tradeable upgrades are suggested.
- No special attacks; god spells, Iban Blast and Magic Dart are skipped.

GPL-3.0 (builds on the OSRS Wiki DPS calculator). Slayer task data comes from RuneLite's slayer plugin (BSD-2-Clause).
