// Quest combat encounters and the rules that change what gear works.
// Sources: OSRS Wiki boss and quest pages (checked November 2026). Quest names match RuneLite's Quest enum
// so the plugin's quest progress lines up. Monster refs are "Name#Version" in the wiki DPS calculator data.
import type { Family } from '../optimizer';

export type Slot = 'head' | 'cape' | 'neck' | 'ammo' | 'weapon' | 'body' | 'shield' | 'legs' | 'hands' | 'feet' | 'ring';

/** Rules for one combat style in one fight. `false` = this style can't damage it. */
export interface StyleRule {
  /** Must wear one of these items in the slot (case-insensitive; "Name" also matches "Name (variant)"). */
  require?: Partial<Record<Slot, string[]>>;
  /** Only these spells work (prefix match, e.g. "Fire " matches Fire Strike…Fire Surge). */
  spells?: string[];
  /** Damage multiplier when a condition holds; first match wins, otherwise `otherwise` (default 1). */
  damage?: { weapon?: string; ammo?: string; spell?: string; mult: number }[];
  otherwise?: number;
}

export interface Fight {
  id: string;
  name: string;
  monster: string; // "Name" or "Name#Version"
  melee?: StyleRule | false;
  ranged?: StyleRule | false;
  magic?: StyleRule | false;
  /** Rules that apply to every style (merged under the style's own rule). */
  all?: StyleRule;
  noPrayer?: boolean;
  /** Gear can't be chosen (fixed or banned); shown as a note instead of a recommendation. */
  manual?: string;
  note?: string;
}

export interface QuestFights { quest: string; fights: Fight[] }

// Weapons that can hurt tier 3 vampyres (from the DPS engine's vampyrebane list).
const VAMPYREBANE = ['Ivandis flail', 'Blisterwood flail', 'Blisterwood sickle', 'Hallowed flail', 'Sunspear'];
const tier3 = { melee: { require: { weapon: VAMPYREBANE } }, ranged: { require: { weapon: ['Blisterwood stake'] } }, magic: false as const };
const ADS = ['Anti-dragon shield', 'Dragonfire shield', 'Dragonfire ward', 'Ancient wyvern shield'];
const STANDARD = (el: string) => [`${el} Strike`, `${el} Bolt`, `${el} Blast`, `${el} Wave`, `${el} Surge`];
const motherPhases = (prefix: string, quest: string, monster: string): Fight[] => [
  { id: `${prefix}-white`, name: `${quest} (white)`, monster, melee: false, ranged: false, magic: { spells: STANDARD('Wind') }, note: 'White: only air spells hurt her.' },
  { id: `${prefix}-blue`, name: `${quest} (blue)`, monster, melee: false, ranged: false, magic: { spells: STANDARD('Water') }, note: 'Blue: only water spells hurt her.' },
  { id: `${prefix}-brown`, name: `${quest} (brown)`, monster, melee: false, ranged: false, magic: { spells: STANDARD('Earth') }, note: 'Brown: only earth spells hurt her.' },
  { id: `${prefix}-red`, name: `${quest} (red)`, monster, melee: false, ranged: false, magic: { spells: STANDARD('Fire') }, note: 'Red: only fire spells hurt her.' },
  { id: `${prefix}-green`, name: `${quest} (green)`, monster, melee: false, magic: false, note: 'Green: only ranged hurts her.' },
  { id: `${prefix}-orange`, name: `${quest} (orange)`, monster, ranged: false, magic: false, note: 'Orange: only melee hurts her.' },
];

export const QUEST_FIGHTS: QuestFights[] = [
  // ---------- Novice / free-to-play ----------
  { quest: 'Demon Slayer', fights: [{
    id: 'delrith', name: 'Delrith', monster: 'Delrith',
    melee: { require: { weapon: ['Silverlight'] } }, ranged: false, magic: false,
    note: 'Fight him with Silverlight equipped, then pick the right incantation when he weakens.',
  }] },
  { quest: 'Vampyre Slayer', fights: [{
    id: 'count-draynor', name: 'Count Draynor', monster: 'Count Draynor',
    note: 'Bring a stake and hammer to finish him; garlic in your inventory weakens him.',
  }] },
  { quest: 'Dragon Slayer I', fights: [{
    id: 'elvarg', name: 'Elvarg', monster: 'Elvarg', all: { require: { shield: ADS } },
    note: 'Keep an anti-dragon shield equipped; her dragonfire hits up to 70 without one.',
  }] },
  { quest: 'The Corsair Curse', fights: [{ id: 'corsair-traitor', name: 'Corsair Traitor', monster: 'Corsair Traitor#Normal Mode' }] },
  { quest: "Witch's House", fights: ['Spider', 'Bear', 'Wolf', 'Skavid'].map((v, i) => ({
    id: `witch-exp-${i}`, name: `Witch's experiment (${['1st', '2nd', '3rd', '4th'][i]} form)`, monster: `Witch's experiment#${v}`,
  })) },

  // ---------- Members ----------
  { quest: 'Lost City', fights: [{ id: 'tree-spirit', name: 'Tree spirit', monster: 'Tree spirit (Lost City)' }] },
  { quest: 'Fight Arena', fights: [
    { id: 'khazard-ogre', name: 'Khazard Ogre', monster: 'Khazard Ogre' },
    { id: 'khazard-scorpion', name: 'Khazard Scorpion', monster: 'Khazard Scorpion' },
    { id: 'bouncer', name: 'Bouncer', monster: 'Bouncer' },
    { id: 'general-khazard', name: 'General Khazard', monster: 'General Khazard' },
  ] },
  { quest: 'Tree Gnome Village', fights: [{ id: 'khazard-warlord', name: 'Khazard warlord', monster: 'Khazard warlord' }] },
  { quest: 'Holy Grail', fights: [{
    id: 'bkt', name: 'Black Knight Titan', monster: 'Black Knight Titan',
    note: 'Use any weapon, but the killing blow must be from Excalibur or he heals to full. Very resistant to ranged and magic.',
  }] },
  { quest: 'Family Crest', fights: [{
    id: 'chronozon', name: 'Chronozon', monster: 'Chronozon',
    note: 'Land one hit each of Wind, Water, Earth and Fire Blast (splashes don\'t count) before he dies, or he heals. Bring runes for all four.',
  }] },
  { quest: 'Horror from the Deep', fights: motherPhases('dag-mother', 'Dagannoth mother', 'Dagannoth mother') },
  { quest: 'Haunted Mine', fights: [{ id: 'treus-dayth', name: 'Treus Dayth', monster: 'Treus Dayth#In combat', note: 'Counts as a ghost for slayer helm bonuses; most damage comes from the possessed machinery.' }] },
  { quest: "Legends' Quest", fights: [
    { id: 'nezikchened', name: 'Nezikchened', monster: 'Nezikchened#Normal', note: 'Fought more than once during the quest.' },
    { id: 'ungadulu', name: 'Ungadulu (possessed)', monster: 'Ungadulu#Possessed' },
  ] },
  { quest: 'Monkey Madness I', fights: [{
    id: 'jungle-demon', name: 'Jungle Demon', monster: 'Jungle Demon',
    note: 'High magic defence; ranged from range with Protect from Magic is the usual approach. You must land the final blow.',
  }] },
  { quest: 'Shilo Village', fights: ['Zombie', 'Skeleton', 'Ghost'].map((v) => ({
    id: `nazastarool-${v.toLowerCase()}`, name: `Nazastarool (${v.toLowerCase()})`, monster: `Nazastarool#${v}`,
    note: 'Not undead for salve or Crumble Undead purposes.',
  })) },
  { quest: 'Lunar Diplomacy', fights: [{
    id: 'me', name: 'Me', monster: 'Me#Type A',
    manual: 'You fight in the Lunar outfit and can\'t change equipment; bring runes and cast your best combat spell (fire spells work well).',
  }] },
  { quest: 'Dream Mentor', fights: [
    { id: 'inadequacy', name: 'The Inadequacy', monster: 'The Inadequacy', noPrayer: true, note: 'No prayer in any of the four fights. Magic is recommended.' },
    { id: 'everlasting', name: 'The Everlasting', monster: 'The Everlasting', noPrayer: true },
    { id: 'untouchable', name: 'The Untouchable', monster: 'The Untouchable', noPrayer: true },
    { id: 'illusive', name: 'The Illusive', monster: 'The Illusive', noPrayer: true },
  ] },
  { quest: 'Desert Treasure I', fights: [
    { id: 'dessous', name: 'Dessous', monster: 'Dessous', note: 'Very high melee defence; use ranged or magic.' },
    { id: 'kamil', name: 'Kamil', monster: 'Kamil', magic: { spells: STANDARD('Fire') }, note: 'Only fire spells work if you use magic.' },
    { id: 'fareed', name: 'Fareed', monster: 'Fareed',
      melee: { require: { hands: ['Ice gloves'] } }, ranged: { damage: [{ ammo: 'Ice arrows', mult: 1 }], otherwise: 0 }, magic: { spells: STANDARD('Water') },
      note: 'Melee needs ice gloves, ranged needs ice arrows (other ammo burns up), magic must be water spells.' },
    { id: 'damis-1', name: 'Damis (first form)', monster: 'Damis#First form', all: { require: { ring: ['Ring of visibility', 'Ring of shadows'] } }, note: 'Wear the ring of visibility (or ring of shadows) to see him.' },
    { id: 'damis-2', name: 'Damis (second form)', monster: 'Damis#Second form', all: { require: { ring: ['Ring of visibility', 'Ring of shadows'] } } },
  ] },
  { quest: 'Grim Tales', fights: [{ id: 'glod', name: 'Glod', monster: 'Glod' }] },
  { quest: 'Recipe for Disaster - Sir Amik Varze', fights: [{ id: 'evil-chicken', name: 'Evil Chicken', monster: 'Evil Chicken (Recipe for Disaster)' }] },
  { quest: 'Recipe for Disaster - Culinaromancer', fights: [
    { id: 'agrith-na-na', name: 'Agrith-Na-Na', monster: 'Agrith-Na-Na', note: 'Decent magic defence; ranged or melee works best.' },
    { id: 'flambeed', name: 'Flambeed', monster: 'Flambeed', all: { require: { hands: ['Ice gloves'] } }, note: 'You need ice gloves to wield a weapon. Water spells and ranged are effective.' },
    { id: 'karamel', name: 'Karamel', monster: 'Karamel', note: 'Fire spells are effective; she drains stats, so bring restores.' },
    { id: 'dessourt', name: 'Dessourt', monster: 'Dessourt', note: 'Melee is ineffective; use ranged or magic.' },
    ...motherPhases('gel-mother', 'Gelatinnoth Mother', 'Gelatinnoth Mother'),
    { id: 'culinaromancer', name: 'Culinaromancer', monster: 'Culinaromancer' },
  ] },
  { quest: 'Troll Stronghold', fights: [{ id: 'dad', name: 'Dad', monster: 'Dad' }] },
  { quest: 'Troll Romance', fights: [{ id: 'arrg', name: 'Arrg', monster: 'Arrg' }] },
  { quest: 'The Fremennik Isles', fights: [{ id: 'ice-troll-king', name: 'Ice Troll King', monster: 'Ice Troll King' }] },
  { quest: 'The Fremennik Trials', fights: [
    { id: 'draugen', name: 'The Draugen', monster: 'The Draugen' },
    { id: 'koschei', name: 'Koschei the deathless', monster: 'Koschei the deathless#The Fremennik Trials (Form 1)',
      manual: 'No weapons, armour or runes allowed. Fight unarmed, or bring a dramen branch and knife to make a dramen staff inside.' },
  ] },
  { quest: 'Getting Ahead', fights: [{ id: 'headless-beast', name: 'Headless Beast', monster: 'Headless Beast' }] },
  { quest: 'Roving Elves', fights: [{ id: 'moss-guardian', name: 'Moss Guardian', monster: 'Moss Guardian' }] },
  { quest: 'One Small Favour', fights: [{
    id: 'slagilith', name: 'Slagilith', monster: 'Slagilith', all: { damage: [{ weapon: 'pickaxe', mult: 1 }], otherwise: 0.34 },
    note: 'Damage is cut by two thirds unless you wield a pickaxe (this also applies while casting). Weak to crush and magic.',
  }] },
  { quest: 'Contact!', fights: [{ id: 'giant-scarab', name: 'Giant Scarab', monster: 'Giant Scarab' }] },
  { quest: 'The Great Brain Robbery', fights: [{ id: 'barrelchest', name: 'Barrelchest', monster: 'Barrelchest' }] },
  { quest: 'Mountain Daughter', fights: [{ id: 'kendal', name: 'The Kendal', monster: 'The Kendal' }] },
  { quest: "My Arm's Big Adventure", fights: [{ id: 'giant-roc', name: 'Giant Roc', monster: 'Giant Roc' }] },
  { quest: 'Shadow of the Storm', fights: [{
    id: 'agrith-naar', name: 'Agrith-Naar', monster: 'Agrith Naar',
    note: 'Use any weapon, but the final blow must be from Silverlight (dyed). Don\'t run off as the last hit lands.',
  }] },
  { quest: 'In Search of the Myreque', fights: [{ id: 'skeleton-hellhound', name: 'Skeleton Hellhound', monster: 'Skeleton Hellhound' }] },
  { quest: 'What Lies Below', fights: [{
    id: 'king-roald', name: 'King Roald', monster: 'King Roald#In combat',
    note: 'Bring him to 2 hitpoints or less, then operate the beacon ring (it doesn\'t need to be worn).',
  }] },
  { quest: 'The Grand Tree', fights: [{ id: 'grand-tree-demon', name: 'Black demon', monster: 'Black demon (The Grand Tree)' }] },
  { quest: 'Tale of the Righteous', fights: [{ id: 'corrupt-lizardman', name: 'Corrupt Lizardman', monster: 'Corrupt Lizardman' }] },
  { quest: 'The Depths of Despair', fights: [{ id: 'sand-snake', name: 'Sand Snake', monster: 'Sand Snake' }] },
  { quest: 'The Ascent of Arceuus', fights: [{ id: 'trapped-soul', name: 'Trapped Soul', monster: 'Trapped Soul' }] },
  { quest: 'Fairytale I - Growing Pains', fights: [{
    id: 'tanglefoot', name: 'Tanglefoot', monster: 'Tanglefoot',
    melee: { require: { weapon: ['Magic secateurs'] } }, ranged: false, magic: false,
    note: 'Only magic secateurs can damage it; your Farming level also raises your max hit (not modelled here).',
  }] },
  { quest: 'Zogre Flesh Eaters', fights: [{
    id: 'slash-bash', name: 'Slash Bash', monster: 'Slash Bash',
    melee: { otherwise: 0.25 },
    ranged: { damage: [{ weapon: 'Comp ogre bow', ammo: 'brutal', mult: 1 }], otherwise: 0.25 },
    magic: { damage: [{ spell: 'Crumble Undead', mult: 0.5 }], otherwise: 0.25 },
    note: 'Takes a quarter damage from everything except brutal arrows from a comp ogre bow (full) and Crumble Undead (half). Despawns after 5 minutes.',
  }] },
  { quest: 'Swan Song', fights: [{ id: 'sea-troll-queen', name: 'Sea Troll Queen', monster: 'Sea Troll Queen' }] },
  { quest: "Olaf's Quest", fights: [{ id: 'ulfric', name: 'Ulfric', monster: 'Ulfric' }] },

  // ---------- Master / Grandmaster ----------
  { quest: 'Song of the Elves', fights: [
    { id: 'essyllt', name: 'Essyllt', monster: 'Essyllt#Normal' },
    { id: 'fragment-of-seren', name: 'Fragment of Seren', monster: 'Fragment of Seren' },
  ] },
  { quest: 'Dragon Slayer II', fights: [
    { id: 'robert', name: 'Robert the Strong', monster: 'Robert the Strong' },
    { id: 'vorkath-ds2', name: 'Vorkath', monster: 'Vorkath#Dragon Slayer II', note: 'Bring dragonfire protection (an anti-dragon shield type item plus antifire is safest).' },
    ...['Air', 'Earth', 'Fire', 'Water'].map((v) => ({
      id: `galvek-${v.toLowerCase()}`, name: `Galvek (${v.toLowerCase()} phase)`, monster: `Galvek#${v}`,
      note: 'Four phases of 300 hitpoints each. Weak to water spells.',
    })),
  ] },
  { quest: 'Monkey Madness II', fights: [
    { id: 'kruk', name: 'Kruk', monster: 'Kruk', note: 'Can be flinched or kited with ranged.' },
    { id: 'glough', name: 'Glough', monster: 'Glough', note: 'Multi-phase final fight across three rooms.' },
  ] },
  { quest: 'A Taste of Hope', fights: [{ id: 'ranis', name: 'Ranis Drakan', monster: 'Ranis Drakan#A Taste of Hope', ...tier3, note: 'A tier 3 vampyre: needs a vampyrebane weapon such as the Ivandis or blisterwood flail.' }] },
  { quest: 'Sins of the Father', fights: [
    { id: 'kroy', name: 'Kroy', monster: 'Kroy' },
    { id: 'damien', name: 'Damien Leucurte', monster: 'Damien Leucurte', ...tier3, note: 'A tier 3 vampyre: needs a vampyrebane weapon.' },
    { id: 'vanstrom', name: 'Vanstrom Klause', monster: 'Vanstrom Klause#Sins of the Father', ...tier3, note: 'A tier 3 vampyre: needs a vampyrebane weapon such as the blisterwood flail.' },
  ] },
  { quest: 'Desert Treasure II - The Fallen Empire', fights: [
    { id: 'stranger', name: 'Stranger', monster: 'Stranger' },
    { id: 'vardorvis-q', name: 'Vardorvis', monster: 'Vardorvis#Quest' },
    { id: 'duke-q', name: 'Duke Sucellus', monster: 'Duke Sucellus#Quest, Awake' },
    { id: 'leviathan-q', name: 'The Leviathan', monster: 'The Leviathan#Quest' },
    { id: 'whisperer-q', name: 'The Whisperer', monster: 'The Whisperer#Quest' },
  ] },
  { quest: 'Secrets of the North', fights: [
    { id: 'muspah-ranged', name: 'Strange creature (ranged form)', monster: 'Phantom Muspah#Ranged (Quest)', note: 'Switches between ranged and melee forms; its shield phase is drained with Smite or enchanted sapphire bolts.' },
    { id: 'muspah-melee', name: 'Strange creature (melee form)', monster: 'Phantom Muspah#Melee (Quest)' },
  ] },
  { quest: 'Beneath Cursed Sands', fights: [
    { id: 'champion-scabaras', name: 'Champion of Scabaras', monster: 'Champion of Scabaras' },
    { id: 'menaphite-akh', name: 'Menaphite Akh', monster: 'Menaphite Akh' },
  ] },
  { quest: 'While Guthix Sleeps', fights: [
    { id: 'balance-ranged', name: 'Balance Elemental (fiery)', monster: 'Balance Elemental#Ranged', note: 'Below 550 HP it prays against styles, so you need all three. Prayer switching matters more than gear switching.' },
    { id: 'balance-melee', name: 'Balance Elemental (airy)', monster: 'Balance Elemental#Melee' },
    { id: 'balance-magic', name: 'Balance Elemental (watery)', monster: 'Balance Elemental#Magic' },
  ] },
  { quest: 'A Kingdom Divided', fights: [
    { id: 'judge-yama', name: 'Judge of Yama', monster: 'Judge of Yama (A Kingdom Divided)' },
    { id: 'xamphur', name: 'Xamphur', monster: 'Xamphur' },
  ] },
  { quest: 'The Fremennik Exiles', fights: [
    { id: 'typhor', name: 'Typhor', monster: 'Typhor', all: { require: { shield: ["V's shield", 'Mirror shield'] } } },
    { id: 'jormungand', name: 'The Jormungand', monster: 'The Jormungand', all: { require: { shield: ["V's shield", 'Mirror shield'] } },
      note: "Wield V's shield (or a mirror shield) the whole fight, so use a one-handed weapon." },
  ] },
  { quest: 'The Heart of Darkness', fights: [{ id: 'amoxliatl-q', name: 'Amoxliatl', monster: 'Amoxliatl#Quest' }] },
  { quest: 'The Curse of Arrav', fights: [{ id: 'arrav', name: 'Arrav', monster: 'Arrav' }] },
  { quest: 'Shadows of Custodia', fights: [{ id: 'custodia-creature', name: 'Strange creature', monster: 'Strange creature (Shadows of Custodia)' }] },
];

export const ALL_FIGHTS: (Fight & { quest: string })[] = QUEST_FIGHTS.flatMap((q) => q.fights.map((f) => ({ ...f, quest: q.quest })));

export function styleRule(f: Fight, family: Family): StyleRule | false {
  const own = f[family];
  if (own === false) return false;
  const base = f.all ?? {};
  return {
    require: { ...(base.require ?? {}), ...(own?.require ?? {}) },
    spells: own?.spells ?? base.spells,
    damage: own?.damage ?? base.damage,
    otherwise: own?.otherwise ?? base.otherwise,
  };
}
