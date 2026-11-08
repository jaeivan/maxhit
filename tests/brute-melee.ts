import { optimize, resolveOwned, meetsReqs } from '../src/optimizer';
import { equipment, monsters, Prayer, Potion, basePlayer, evaluate, emptyEquipment, SLOTS } from '../src/engine';
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury','Berserker ring (i)','Slayer helmet (i)','Abyssal tentacle','Bandos tassets','Dragon scimitar','Neitiznot faceguard','Amulet of glory','Dragon warhammer','Salve amulet(ei)',"Obsidian helmet","Obsidian platebody","Obsidian platelegs",'Toktz-xil-ak','Tzhaar-ket-om','Berserker necklace','Void knight top','Void knight robe','Void knight gloves','Void melee helm','Rune defender','Infernal cape','Brimstone ring'].map(id);
const skills = { atk: 90, str: 92, def: 85, ranged: 92, magic: 88, prayer: 77, hp: 92, mining: 70, herblore: 80, farming: 70 };
const b = { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: false, kandarinDiary: true };
const buffs = { melee: b, ranged: b, magic: b };
const owned = resolveOwned(bank);
let worst = 0;
for (const mname of (process.argv[2] ?? 'Kalphite Queen').split(',')) {
  const mon = monsters.find((m) => m.name === mname)!;
  const fast = optimize({ monster: mon, skills, buffs, ownedIds: bank, spellbooks: ['standard'], families: ['melee'] })[0];
  // brute force over every owned item per slot (incl. empty)
  const per = SLOTS.map((s) => [null, ...owned.filter((e) => e.slot === s && meetsReqs(e, skills))]);
  const p = basePlayer(skills, b);
  let best = 0, n = 0, bestEq: any = null;
  const eq: any = emptyEquipment();
  const rec = (i: number) => {
    if (i === SLOTS.length) { if (eq.weapon?.isTwoHanded && eq.shield) return; n++; const r = evaluate(p, mon, { ...eq }, 'melee', null); if (r && r.dps > best) { best = r.dps; bestEq = { ...eq }; } return; }
    for (const it of per[i]) { eq[SLOTS[i]] = it; rec(i + 1); }
  };
  const t0 = performance.now(); rec(0);
  const gap = best - (fast.best?.result.dps ?? 0); worst = Math.max(worst, gap);
  console.log(mname.padEnd(18), 'fast', fast.best?.result.dps.toFixed(4), `(${fast.ms.toFixed(0)}ms)`, 'brute', best.toFixed(4), `(${n} combos, ${((performance.now()-t0)/1000).toFixed(1)}s)`, gap > 1e-6 ? 'GAP ' + gap.toFixed(4) + ' brute=' + Object.values(bestEq).filter(Boolean).map((e: any) => e.name).join(',') : 'OK');
}
console.log('worst gap', worst);
