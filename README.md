# MaxHit

An OSRS combat companion for RuneLite. Pick a monster and it shows your best melee, ranged and magic
setups from the gear you own, plus the GE upgrades that add the most DPS. All DPS numbers come from the
[OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) engine.

## Setup

Needs Node 20+, git and Java 11+.

```bash
npm install
npm run setup   # fetches the wiki DPS engine and prepares item data
npm run dev     # http://localhost:5173

cd plugin && ./gradlew run   # RuneLite with the MaxHit plugin
```

Log in and open your bank once. The plugin saves your bank, gear, inventory and levels to
`~/.runelite/maxhit/`, and the page updates by itself. With a Jagex account, the dev client needs a one-time
login setup: see RuneLite's "Using Jagex Accounts" wiki page.

## Use

- `/` to search monsters. Click a gear slot to compare everything you own for it; click an upgrade to preview it.
- Settings: prayers, potions, spellbooks, level overrides, excluded items.
- `npm test` runs a sample bank; `npm run test:brute` checks the optimizer against brute force.

## Limits

- Level requirements are best-effort and quest requirements are ignored, so exclude gear you can't wear.
- Only the bank, worn gear and inventory count as owned. Only GE-tradeable upgrades are suggested.
- No special attacks; god spells, Iban Blast and Magic Dart are skipped.

GPL-3.0 (builds on the OSRS Wiki DPS calculator).
