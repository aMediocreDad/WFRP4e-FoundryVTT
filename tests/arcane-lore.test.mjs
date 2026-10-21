/**
 * LOR-03: Arcane Spells take their caster's Lore (5e p.242).
 *
 * An Arcane Spell "is counted as [a] Lore Spell in all ways, meaning [it gets] the Lore Attributes of Lore Spells".
 * 4e shipped each Arcane spell once per Lore; the 5e content ships one untagged copy, so the fork derives the Lore
 * from the owner's `Arcane Magic (<Lore>)` and `Chaos Magic (<Lore>)` Talents. This file covers the two pure pieces
 * of that: the specialisation-to-Lore resolver, and the Talent scan built on it.
 *
 * Expected values come from the 5th Edition Core Rulebook and from the shipped content tables, not from the
 * implementation - asserting what the code already does would only lock in its bugs.
 *
 * Test instances are built with plain objects rather than Documents, so the constructors' Foundry dependencies stay
 * out of the way and each test can say exactly what state it is exercising.
 *
 * The extra ambient Foundry globals live here rather than in tests/stubs.mjs, which is shared with the other runs in
 * this stack. Run: node tests/arcane-lore.test.mjs
 */
import { install, suite } from "./stubs.mjs";

/**
 * config.magicLores and config.magicWind as they read at runtime: i18n.js translates every table named in
 * config.toTranslate at `i18nInit`, so by the time anything resolves a Lore these hold display names, not keys.
 * Values are en.json's, which is what an untranslated world shows.
 */
const magicLores = {
  petty: "Petty", beasts: "Beasts", death: "Death", fire: "Fire", heavens: "Heavens", metal: "Metal",
  life: "Life", light: "Light", shadow: "Shadow", hedgecraft: "Hedgecraft", witchcraft: "Witchcraft",
  daemonology: "Daemonology", necromancy: "Necromancy", undivided: "Undivided", nurgle: "Nurgle",
  slaanesh: "Slaanesh", tzeentch: "Tzeentch"
};

const magicWind = {
  petty: "None", beasts: "Ghur", death: "Shyish", fire: "Aqshy", heavens: "Azyr", metal: "Chamon",
  life: "Ghyran", light: "Hysh", shadow: "Ulgu", hedgecraft: "None", witchcraft: "None",
  daemonology: "Dhar", necromancy: "Dhar", undivided: "Dhar", nurgle: "Dhar", slaanesh: "Dhar",
  tzeentch: "Dhar"
};

/**
 * The Lore Attribute tables the wfrp5e-core content module installs, read off the deployed build on 2026-09-14.
 * Ten Lores have an Attribute; the six Dark Lores and Petty do not - Necromancy and Daemonology are present in
 * loreEffectDescriptions but empty, and absent from loreEffects entirely.
 */
const loreEffects = {
  beasts: {}, death: {}, fire: {}, heavens: {}, metal: {}, life: {}, light: {}, shadow: {},
  hedgecraft: {}, witchcraft: {}
};

const loreEffectDescriptions = {
  petty: "None", beasts: "...", death: "...", fire: "...", heavens: "...", metal: "...", life: "...",
  light: "...", shadow: "...", hedgecraft: "...", witchcraft: "...",
  daemonology: "", necromancy: "", nurgle: "", slaanesh: "", tzeentch: ""
};

const homebrew = { fifthEdMagic: true };

install({
  homebrew,
  config: { magicLores, magicWind, loreEffects, loreEffectDescriptions },
  // The Talent names are matched on their translated form, never on English literals
  lang: { "NAME.ArcaneMagic": "Arcane Magic", "NAME.ChaosMagic": "Chaos Magic" }
});

// warhammer-lib's findKey, which the resolver uses to map a display name back to a config key. Reproduced from
// modules/warhammer-lib/warhammer-lib.js: first match wins, and the comparison is exact unless caseInsensitive.
const findKey = (value, obj, options = {}) => {
  if (!value || !obj) return undefined;
  for (let key in obj) {
    if (options.caseInsensitive ? obj[key].toLowerCase() == String(value).toLowerCase() : obj[key] == value) return key;
  }
  return undefined;
};

// Ambient globals fifth-edition.js and the module it imports reach for at class-definition time
globalThis.warhammer = { utility: { findKey, log: () => {} } };
globalThis.Hooks = { call: () => {}, on: () => {}, once: () => {} };
globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {}, notify: () => {} } };
globalThis.ChatMessage = { create: () => {} };
for (const name of ["WarhammerTestBase", "WarhammerMessageModel", "WarhammerActor", "WarhammerItem", "SocketHandlers", "ItemDialog", "Item"]) {
  globalThis[name] = class {};
}

const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const { check, report } = suite("ArcaneLore");

/** Re-point the settings stub at a different set of toggles without re-importing the module under test */
const setToggles = hb => { game.settings.get = (_namespace, key) => (key === "homebrew" ? hb : undefined); };

/** An actor carrying exactly these Talent names, plus one Skill that must never be mistaken for a Talent */
const actorWith = (...talentNames) => ({
  items: [
    { type: "skill", name: "Arcane Magic (Fire)" },
    ...talentNames.map(name => ({ type: "talent", name }))
  ]
});

/* -------------------------------------------- */
/*  The specialisation resolver                 */
/* -------------------------------------------- */

// p.242: the Talent names the Lore. The Lore's own name is the spelling the content uses.
check("spec: Fire is the Lore of Fire", FifthEdition.loreKeyForSpec("Fire"), "fire");
check("spec: Shadow", FifthEdition.loreKeyForSpec("Shadow"), "shadow");
check("spec: Heavens", FifthEdition.loreKeyForSpec("Heavens"), "heavens");
check("spec: lower case still resolves", FifthEdition.loreKeyForSpec("fire"), "fire");
check("spec: surrounding whitespace is ignored", FifthEdition.loreKeyForSpec("  Fire  "), "fire");

// p.228: each Lore is the Lore of one Wind, and players name Lores by their Wind at least as often.
check("wind: Aqshy is Fire", FifthEdition.loreKeyForSpec("Aqshy"), "fire");
check("wind: Azyr is Heavens", FifthEdition.loreKeyForSpec("Azyr"), "heavens");
check("wind: Ulgu is Shadow", FifthEdition.loreKeyForSpec("Ulgu"), "shadow");
check("wind: Ghur is Beasts", FifthEdition.loreKeyForSpec("Ghur"), "beasts");
check("wind: Shyish is Death", FifthEdition.loreKeyForSpec("Shyish"), "death");
check("wind: Ghyran is Life", FifthEdition.loreKeyForSpec("Ghyran"), "life");
check("wind: Hysh is Light", FifthEdition.loreKeyForSpec("Hysh"), "light");
check("wind: Chamon is Metal", FifthEdition.loreKeyForSpec("Chamon"), "metal");

// The 5e Arcane Magic Talent's own text tells players to pick "Shadows"; magicLores says "Shadow".
check("alias: Shadows", FifthEdition.loreKeyForSpec("Shadows"), "shadow");
check("alias: Celestial", FifthEdition.loreKeyForSpec("Celestial"), "heavens");
check("alias: Witchery", FifthEdition.loreKeyForSpec("Witchery"), "witchcraft");
check("alias: case-insensitive", FifthEdition.loreKeyForSpec("SHADOWS"), "shadow");

// The localised tables are consulted first, so a translation or a content module always beats the English fallback.
// Here "Shadows" is made the display name of Light, and it must resolve to Light rather than to the alias' Shadow.
game.wfrp4e.config.magicLores = { ...magicLores, light: "Shadows" };
check("order: magicLores beats the alias table", FifthEdition.loreKeyForSpec("Shadows"), "light");
game.wfrp4e.config.magicLores = magicLores;

// Wildcards name a family, not a Lore, so there is nothing to derive.
check("wildcard: Any", FifthEdition.loreKeyForSpec("Any"), undefined);
check("wildcard: Any One", FifthEdition.loreKeyForSpec("Any One"), undefined);
check("wildcard: All", FifthEdition.loreKeyForSpec("All"), undefined);
check("wildcard: Any  One with a double space", FifthEdition.loreKeyForSpec("Any  One"), undefined);

// The Careers grant this placeholder string. It names no Lore and resolves through none of the three tables.
check("placeholder: Any Colour Lore", FifthEdition.loreKeyForSpec("Any Colour Lore"), undefined);
check("spec: empty", FifthEdition.loreKeyForSpec(""), undefined);
check("spec: undefined", FifthEdition.loreKeyForSpec(undefined), undefined);
check("spec: not a Lore at all", FifthEdition.loreKeyForSpec("Soldiers"), undefined);

// Necromancy and Daemonology are real Lores and resolve as such. What they have no share of is a Lore Attribute:
// p.242 grants Arcane Spells the Lore Attributes of Lore Spells, and these two Lores have none to grant. That half
// cannot be asserted here - it happens in SpellModel, which needs a real Document and so belongs in the test world,
// and asserting it against the fixture tables at the top of this file would only compare them to themselves. The
// runtime evidence for it is `.claude/lead/evidence/06-any-colour-lore-derives-nothing.png` and the Talent-rename
// table in EVIDENCE.md, both taken against the deployed wfrp5e-core.
check("dark: Necromancy is a real Lore", FifthEdition.loreKeyForSpec("Necromancy"), "necromancy");
check("dark: Daemonology is a real Lore", FifthEdition.loreKeyForSpec("Daemonology"), "daemonology");

/* -------------------------------------------- */
/*  The Talent scan                             */
/* -------------------------------------------- */

check("talents: Arcane Magic (Fire)", FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)")), ["fire"]);
// p.242 names Chaos Magic alongside Arcane Magic
check("talents: Chaos Magic (Tzeentch)", FifthEdition.arcaneLores(actorWith("Chaos Magic (Tzeentch)")), ["tzeentch"]);
check("talents: both Talents on one actor",
  FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)", "Chaos Magic (Nurgle)")), ["fire", "nurgle"]);

// A bare Arcane Magic names no Lore, so it grants none - which is what the content module actually ships.
check("talents: bare Arcane Magic", FifthEdition.arcaneLores(actorWith("Arcane Magic")), []);
check("talents: bare Chaos Magic", FifthEdition.arcaneLores(actorWith("Chaos Magic")), []);
check("talents: the career placeholder", FifthEdition.arcaneLores(actorWith("Arcane Magic (Any Colour Lore)")), []);
check("talents: a wildcard", FifthEdition.arcaneLores(actorWith("Arcane Magic (Any One)")), []);

check("talents: two Lores, in Item order",
  FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)", "Arcane Magic (Necromancy)")), ["fire", "necromancy"]);
check("talents: the same Lore twice is one Lore",
  FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)", "Arcane Magic (Aqshy)")), ["fire"]);

check("talents: an unrelated Talent grants nothing",
  FifthEdition.arcaneLores(actorWith("Etiquette (Soldiers)")), []);
// Runs of whitespace collapse in the base name too, which is the only two-word thing here to collapse
check("talents: a doubled space in the Talent name still matches",
  FifthEdition.arcaneLores(actorWith("Arcane  Magic (Fire)")), ["fire"]);
check("talents: a Skill of the same name is not a Talent",
  FifthEdition.arcaneLores({ items: [{ type: "skill", name: "Arcane Magic (Fire)" }] }), []);
check("talents: no actor", FifthEdition.arcaneLores(undefined), []);
check("talents: an actor with no items", FifthEdition.arcaneLores({ items: [] }), []);

// Never hardcode English: the base name is matched against the translated NAME.ArcaneMagic.
game.i18n.localize = key => ({ "NAME.ArcaneMagic": "Arkan magi", "NAME.ChaosMagic": "Kaosmagi" })[key] ?? key;
check("talents: a translated Talent name resolves",
  FifthEdition.arcaneLores(actorWith("Arkan magi (Fire)")), ["fire"]);
check("talents: the English name does not resolve in a translated world",
  FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)")), []);
game.i18n.localize = key => ({ "NAME.ArcaneMagic": "Arcane Magic", "NAME.ChaosMagic": "Chaos Magic" })[key] ?? key;

// Everything is gated on the existing Magic toggle: with it off a world behaves exactly as 4e did.
setToggles({ fifthEdMagic: false });
check("toggle off: derives nothing", FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)")), []);
setToggles(homebrew);
check("toggle back on: derives again", FifthEdition.arcaneLores(actorWith("Arcane Magic (Fire)")), ["fire"]);

report();
