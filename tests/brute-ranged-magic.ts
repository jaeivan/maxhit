import { optimize, resolveOwned, meetsReqs, availableSpells, weaponFits } from '../src/optimizer';
import { equipment, monsters, Prayer, Potion, basePlayer, evaluate, emptyEquipment, SLOTS } from '../src/engine';
import { ammoApplicability, AmmoApplicability } from '@/lib/Equipment';
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const skills = { atk: 90, str: 92, def: 85, ranged: 92, magic: 88, prayer: 77, hp: 92, mining: 70, herblore: 80, farming: 70 };
const sets: Record<string, string[]> = {
  ranged: ['Toxic blowpipe','Magic shortbow (i)','Rune crossbow','Dragon hunter crossbow','Dragon arrow','Amethyst arrow','Ruby dragon bolts (e)','Diamond dragon bolts (e)','Void knight top','Void knight robe','Void knight gloves','Void ranger helm',"Black d'hide body","Black d'hide chaps",'Necklace of anguish','Amulet of fury',"Ava's assembler",'Fire cape','Archers ring (i)','Slayer helmet (i)','Barrows gloves','Pegasian boots','Dragon dart','Salve amulet(ei)'],
  magic: ['Trident of the Seas','Kodai wand','Master wand','Occult necklace','Amulet of fury',"Ahrim's robetop","Ahrim's robeskirt",'Void knight top','Void knight robe','Void knight gloves','Void mage helm','Imbued Saradomin cape','Tormented bracelet','Barrows gloves','Eternal boots',"Mage's book",'Seers ring (i)','Slayer helmet (i)','Salve amulet(ei)','Smoke battlestaff','Ancient wyvern shield'],
};
const buffs = {
  melee: { potions: [Potion.SUPER_COMBAT], prayers: [Prayer.PIETY], onSlayerTask: false, kandarinDiary: true },
  ranged: { potions: [Potion.RANGING], prayers: [Prayer.EAGLE_EYE], onSlayerTask: false, kandarinDiary: true },
  magic: { potions: [Potion.SATURATED_HEART], prayers: [Prayer.MYSTIC_MIGHT], onSlayerTask: false, kandarinDiary: true },
};
const books = ['standard', 'ancient', 'arceuus'] as const;
for (const fam of ['ranged', 'magic'] as const) {
  const bank = sets[fam].map(id);
  const owned = resolveOwned(bank).filter((e) => meetsReqs(e, skills));
  for (const mname of (process.argv[2] ?? 'Vorkath,Abyssal demon').split(',')) {
    const mon = monsters.find((m) => m.name === mname)!;
    const fast = optimize({ monster: mon, skills, buffs, ownedIds: bank, spellbooks: [...books], families: [fam] })[0];
    const per = SLOTS.map((s) => [null, ...owned.filter((e) => e.slot === s && (s !== 'weapon' || weaponFits(e, fam)))]);
    const spells = fam === 'magic' ? availableSpells(skills.magic, [...books]) : [null];
    const p = basePlayer(skills, buffs[fam]);
    let best = 0, n = 0, bestDesc = '';
    const eq: any = emptyEquipment();
    const rec = (i: number) => {
      if (i === SLOTS.length) {
        if (eq.weapon?.isTwoHanded && eq.shield) return;
        if (fam === 'ranged' && eq.ammo && ammoApplicability(eq.weapon?.id, eq.ammo.id) === AmmoApplicability.INVALID) return;
        for (const sp of spells) {
          n++; const r = evaluate(p, mon, { ...eq }, fam, sp as any);
          if (r && r.dps > best) { best = r.dps; bestDesc = Object.values(eq).filter(Boolean).map((e: any) => e.name).join(',') + (sp ? ' +' + (sp as any).name : ''); }
        }
        return;
      }
      for (const it of per[i]) { eq[SLOTS[i]] = it; rec(i + 1); }
    };
    const t0 = performance.now(); rec(0);
    const gap = best - (fast.best?.result.dps ?? 0);
    console.log(fam.padEnd(7), mname.padEnd(14), 'fast', fast.best?.result.dps.toFixed(4), `(${fast.ms.toFixed(0)}ms)`, 'brute', best.toFixed(4), `(${n} evals, ${((performance.now()-t0)/1000).toFixed(0)}s)`, gap > 1e-6 ? `GAP ${gap.toFixed(4)} brute=${bestDesc}` : 'OK');
  }
}
