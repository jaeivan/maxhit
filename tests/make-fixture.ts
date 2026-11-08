// Test fixture: a plugin-style export + a wiki-style /latest price file
import fs from 'node:fs';
import { equipment } from '../src/engine';
const id = (n: string) => equipment.find((x) => x.name === n)!.id;
const bank = ['Abyssal whip','Dragon defender','Fighter torso','Barrows gloves','Dragon boots','Fire cape','Amulet of fury','Berserker ring (i)','Slayer helmet (i)','Void knight top','Void knight robe','Void knight gloves','Void ranger helm','Void melee helm','Void mage helm','Toxic blowpipe','Magic shortbow (i)','Rune crossbow','Trident of the Seas','Occult necklace',"Ahrim's robetop","Ahrim's robeskirt","Black d'hide body","Black d'hide chaps",'Dragon arrow','Amethyst arrow','Ruby dragon bolts (e)','Adamant bolts','Dragon scimitar','Abyssal tentacle','Bandos tassets','Neitiznot faceguard',"Ava's assembler",'Archers ring (i)','Seers ring (i)','Imbued Saradomin cape','Necklace of anguish','Dragon dart','Salve amulet(ei)','Dragon warhammer',"Mage's book",'Tormented bracelet','Eternal boots','Infernal cape','Brimstone ring'].map(id);
fs.writeFileSync(process.argv[2] + '/123456789.json', JSON.stringify({ version: 1, account: '123456789', rsn: 'lowercasejunior', updatedAt: Date.now(), bankUpdatedAt: Date.now() - 20 * 60e3,
  skills: { atk: 90, str: 92, def: 85, ranged: 92, magic: 88, prayer: 77, hp: 92, mining: 70, herblore: 80, farming: 70 }, bank, worn: [], inventory: [] }));
const data: Record<number, { high: number; low: number }> = {};
for (const e of equipment) { if (e.version === 'Charged' || /\(i\)$/.test(e.name)) continue; const o = e.offensive, b = e.bonuses; const t = Math.max(0, o.stab+o.slash+o.crush+o.ranged+o.magic+b.str+b.ranged_str+b.magic_str*3); const p = Math.round(5000 * (1 + t * t / 4)); data[e.id] = { high: p, low: p }; }
fs.writeFileSync(process.argv[3], JSON.stringify({ data }));
console.log('fixture written', bank.length, 'items,', Object.keys(data).length, 'prices');
