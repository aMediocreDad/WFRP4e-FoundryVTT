/**
 * Size Fear announcements (src/system/combat.js) and the 5e Condition predicates (src/system/fifth-edition.js).
 * Expected values come from the 5th Edition Core Rulebook, cited by page in the comments - asserting what the code
 * already does would only lock in the two defects this file exists to pin.
 *
 * Run: node tests/fear-conditions.test.mjs
 */
import { install, suite } from "./stubs.mjs";

// Held rather than inlined so the toggle-off sections below can turn a rule off and put it back
const homebrew = { fifthEdSize: true, fifthEdConditions: true };

install({
  homebrew,
  // The Condition predicates match on translated Skill names, so these have to resolve for them to fire at all.
  // Anything else localize() is asked for echoes its key back, which is what the label assertions read.
  lang: {
    "NAME.Athletics": "Athletics", "NAME.Climb": "Climb", "NAME.Dodge": "Dodge", "NAME.Melee": "Melee",
    "NAME.Perception": "Perception", "NAME.Perform": "Perform", "NAME.Ride": "Ride", "NAME.Row": "Row",
    "NAME.Ranged": "Ranged", "NAME.Stealth": "Stealth", "NAME.Swim": "Swim"
  }
});

/* Foundry globals the two modules under test reach for. Defined here rather than in tests/stubs.mjs so no other run
   in this stack has to merge a change to the shared file - the same choice run A made in fifth-edition.test.mjs. */

const isPlainObject = value => value?.constructor === Object;
/** Enough of foundry.utils.mergeObject for config-wfrp4e.js and _applyConditions: a deep merge, optionally copying. */
foundry.utils.mergeObject = (original, other = {}, { inplace = true } = {}) => {
  let target = inplace ? original : structuredClone(original);
  for (let [key, value] of Object.entries(other)) {
    if (isPlainObject(value) && isPlainObject(target[key])) foundry.utils.mergeObject(target[key], value);
    else target[key] = isPlainObject(value) || Array.isArray(value) ? structuredClone(value) : value;
  }
  return target;
};

/** config-wfrp4e.js writes into CONFIG at module scope in a dozen places; none of them is under test here. */
const permissive = () => new Proxy(function () {}, {
  get: (target, key) => (key in target ? target[key] : (target[key] = permissive())),
  apply: () => permissive()
});
globalThis.CONFIG = permissive();
globalThis.defaultWarhammerConfig = permissive();
CONFIG.TextEditor.enrichers = [];
// Real arrays: _applyConditions checks Array.isArray before adding Besmirched to core's own copy of the list
CONFIG.statusEffects = [];

globalThis.WarhammerMessageModel = class {};
globalThis.WarhammerTestBase = class {};
globalThis.warhammer = { utility: { log: () => {} } };
globalThis.Hooks = { call: () => {} };
globalThis.ui = { notifications: { error: () => {}, warn: () => {}, notify: () => {} } };
globalThis.Number.isNumeric = n => +n === +n;
globalThis.fromUuid = async () => null;

const chat = [];
globalThis.ChatMessage = { create: data => chat.push(data) };
game.user = { isUniqueGM: true };
game.wfrp4e.utility.chatDataSetup = content => ({ content });

const WFRP4E = (await import("../src/system/config-wfrp4e.js")).default;
game.wfrp4e.config = WFRP4E;

const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const CombatHelpersWFRP = (await import("../src/system/combat.js")).default;
(await import("../src/system/audio-wfrp4e.js")).default.PlayContextAudio = () => {};

const { check, report } = suite("Fear & Conditions");

/* -------------------------------------------- */
/*  Size Fear announcements (p.360)             */
/* -------------------------------------------- */

/* Every announcement is built by game.i18n.format, so recording its arguments reads the announcement data rather
   than the localised chat text. It returns "" so the only tokens left in the chat card are checkFearTerror's own. */
const announcements = [];
game.i18n.format = (_key, data = {}) => {
  announcements.push(data);
  return "";
};

/**
 * @param {string} name
 * @param {object} options
 * @param {number} options.size Size step, as actor.sizeNum: 3 Average, 4 Large, 5 Enormous, 6 Monstrous
 * @param {number} options.fear Rating of the creature's printed Fear Trait; 0 for none
 * @param {number} options.side Token disposition. combat.js's chained comparison skips any pair that shares one
 */
const combatant = (name, { size = 3, fear = 0, side = 1 } = {}) => ({
  id: name,
  name,
  token: { disposition: side },
  actor: {
    sizeNum: size,
    has: trait => (trait == "CHAT.Fear" && fear ? { specification: { value: fear } } : null)
  }
});

/**
 * Start a combat through the real entry point and read back both halves of what it announced. Criterion 1 is that
 * neither half suppresses the other, and the suppression lives in the handoff between the two functions, so this
 * drives checkFearTerror rather than checkSizeFearTerror alone.
 * @returns {{size: string[], bare: string[]}} the Size section, per rating per opponent group, and the bare Trait
 *   ratings checkFearTerror announced to the table at large
 */
const startCombat = async (...turns) => {
  announcements.length = 0;
  chat.length = 0;
  let byId = Object.fromEntries(turns.map(turn => [turn.id, turn]));
  await CombatHelpersWFRP.checkFearTerror({ turns, combatants: { get: id => byId[id] } });
  return {
    size: announcements.map(a => `${a.actor} ${a.fear} -> ${a.target}`),
    bare: chat[0]?.content.match(/@(?:Fear|Terror)\[[^\]]+\]/g) || []
  };
};

/* The producer for every list below is combat.js's `bothFriendly` line, which is a chained comparison -
   (a == b) then boolean == 1 - and so skips any pair sharing a disposition rather than only friendly pairs. That
   line is deliberately unchanged, so these expectations are written against same-disposition-skipped: an opponent
   is a combatant on a different side, and your own side never appears in either list. */

// The defect. p.360 gives the smaller opponent the Size-inflated rating; the equal one still faces the printed
// Fear Trait, which base lost outright the moment the Size branch claimed the combatant.
let both = await startCombat(
  combatant("Ogre", { size: 4, fear: 2, side: -1 }),
  combatant("Grunt", { size: 3 }),
  combatant("Rival", { size: 4 })
);
check("the smaller opponent faces Size plus Trait", both.size[0], "Ogre @Fear[3, Ogre] -> Grunt");
check("...the equal one still faces the bare Trait", both.size[1], "Ogre @Fear[2, Ogre] -> Rival");
check("...two announcements, not one", both.size.length, 2);
check("...and neither is repeated to the table at large", both.bare, []);

// Filip ruled on 2026-09-06 that the Size rating is 1 + the creature's own Fear Trait, choosing it over a flat
// Fear 1 and over combining the two by p.183's "highest". The Frightening Talent is the argument (p.120: "the Fear
// Trait with a rating of 1, or 2 if you are Large"). Do not "correct" this to Fear 1.
let rated = await startCombat(
  combatant("Dragon", { size: 6, fear: 3, side: -1 }),
  combatant("Grunt", { size: 3 })
);
check("the Size rating is 1 + the printed Trait", rated.size, ["Dragon @Fear[4, Dragon] -> Grunt"]);

// A Fear Trait the Size branch did not claim is still announced the way it always was
let mixed = await startCombat(
  combatant("Ogre", { size: 4, fear: 2, side: -1 }),
  combatant("Grunt", { size: 3 }),
  combatant("Ghost", { size: 3, fear: 1 })
);
check("both smaller opponents share the one Size line", mixed.size, ["Ogre @Fear[3, Ogre] -> Grunt, Ghost"]);
check("...and a Trait on a creature with no smaller foe is untouched", mixed.bare, ["@Fear[1,Ghost]"]);

// p.360 gives no rating of its own, so a creature with no Fear Trait causes Fear 1 to those smaller and nothing to
// anyone else - unchanged from base, and the case the `trait &&` guard on the second announcement exists for.
let plain = await startCombat(
  combatant("Troll", { size: 4, side: -1 }),
  combatant("Grunt", { size: 3 }),
  combatant("Rival", { size: 4 })
);
check("a Size-only creature causes Fear 1 to the smaller", plain.size, ["Troll @Fear[1, Troll] -> Grunt"]);
check("...and says nothing to the equal one", plain.size.length, 1);
check("...and nothing to the table at large either", plain.bare, []);

// Same disposition, so nothing is an opponent: the Ogre frightens no one by Size, and because the Size branch never
// claimed it, its printed Trait is announced by checkFearTerror exactly as before
let warband = await startCombat(
  combatant("Ogre", { size: 4, fear: 2, side: -1 }),
  combatant("Goblin", { size: 3, side: -1 })
);
check("a smaller ally on the same side is not frightened", warband.size, []);
check("...and the Ogre's Trait is announced to the table instead", warband.bare, ["@Fear[2,Ogre]"]);

/* Toggle off: combat.js is shared with 4e, so with fifthEdSize off the 4e Size ladder has to come back untouched -
   Fear at one step, Terror at two and up - and the Trait announcement stays with checkFearTerror. */
homebrew.fifthEdSize = false;
let ladder = await startCombat(
  combatant("Dragon", { size: 6, fear: 2, side: -1 }),
  combatant("Grunt", { size: 5 }),
  combatant("Halfling", { size: 4 })
);
check("4e announces a Size ladder, not one rating", ladder.size, [
  "Dragon @Fear[1, Dragon] -> Grunt",
  "Dragon @Terror[2, Dragon] -> Halfling"
]);
check("...and 4e never suppresses the Trait announcement", ladder.bare, ["@Fear[2,Dragon]"]);
homebrew.fifthEdSize = true;

/* -------------------------------------------- */
/*  Condition predicates (p.185-186)            */
/* -------------------------------------------- */

WFRP4E.PrepareSystemItems();
FifthEdition._applyConditions(WFRP4E);

/** Run a dialog subscript the way warhammer-lib's WarhammerScript._runSubscript does. */
const run = (script, args) => new Function("args", script)(args);
const scriptsFor = id => WFRP4E.statusEffects.find(effect => effect.id == id).system.scriptData.filter(s => s.trigger == "dialog");
const activates = (id, index, args) => !!run(scriptsFor(id)[index].options.activateScript, args);
const hides = (id, index, args) => !!run(scriptsFor(id)[index].options.hideScript, args);

/* The `args` a roll dialog presents to a subscript, read off src/apps/roll-dialog/: `skill` is the Skill Item and
   is absent on a bare Characteristic Test, `characteristic` is the key, `item` is the weapon on a weapon Test. */
const skillTest = (name, characteristic) => ({ skill: { name, type: "skill" }, characteristic });
const meleeAttack = { skill: { name: "Melee (Basic)", type: "skill" }, characteristic: "ws", item: { attackType: "melee" } };
const rangedAttack = { skill: { name: "Ranged (Bow)", type: "skill" }, characteristic: "bs", item: { attackType: "ranged" } };
// p.167: "you must make an Opposed Strength Test for your Action" - a bare Strength Characteristic Test, the same
// shape OpposedTest.isStrengthTest matches
const grapple = { characteristic: "s" };

// p.186: "all your actions involving movement of any kind suffer a penalty of -1 SL (including Grappling)"
check("Entangled penalises a Dodge", activates("entangled", 0, skillTest("Dodge", "ag")), true);
check("...Athletics", activates("entangled", 0, skillTest("Athletics", "ag")), true);
check("...Climb", activates("entangled", 0, skillTest("Climb", "s")), true);
check("...Ride, specialisation and all", activates("entangled", 0, skillTest("Ride (Horse)", "ag")), true);
check("...Swim", activates("entangled", 0, skillTest("Swim", "s")), true);
check("...Stealth", activates("entangled", 0, skillTest("Stealth (Urban)", "ag")), true);
check("...a Melee Attack", activates("entangled", 0, meleeAttack), true);
check("...and a Grapple, which p.186 names", activates("entangled", 0, grapple), true);
// The finding: the base predicate asked which characteristic was being rolled, so a bow shot counted as movement
// and a Strength-based Grapple did not
check("Entangled leaves a Ranged Attack alone", activates("entangled", 0, rangedAttack), false);
check("...an Intimidate Test, Strength or not", activates("entangled", 0, skillTest("Intimidate", "s")), false);
check("...and a Gossip Test", activates("entangled", 0, skillTest("Gossip", "fel")), false);

// p.185: Disadvantage on "Melee Attacks and other Tests that rely heavily on sight ... such as Climb or Ride", and
// p.130's Darkness box names the same family - "Melee Tests, Ranged Tests, and Perception Tests based on sight"
check("Blinded disadvantages a Melee Attack", activates("blinded", 0, meleeAttack), true);
check("...a Ranged Attack", activates("blinded", 0, rangedAttack), true);
// p.130 says Melee and Ranged *Tests*, so the Skill rolled on its own counts too - which is how an opposed defence
// resolves, and which the base ws/bs predicate did catch
check("...a Melee Test rolled from the Skill alone", activates("blinded", 0, skillTest("Melee (Basic)", "ws")), true);
check("...a Ranged Test rolled from the Skill alone", activates("blinded", 0, skillTest("Ranged (Bow)", "bs")), true);
check("...Climb", activates("blinded", 0, skillTest("Climb", "s")), true);
check("...Ride", activates("blinded", 0, skillTest("Ride (Horse)", "ag")), true);
check("...and a Perception Test", activates("blinded", 0, skillTest("Perception", "i")), true);
// Dodge is not on p.185's list and 5e gives a Blinded defender no penalty of its own beyond the Advantage its
// attackers get, so it is left out rather than guessed at
check("Blinded does not touch a Dodge", activates("blinded", 0, skillTest("Dodge", "ag")), false);
check("...a Grapple", activates("blinded", 0, grapple), false);
check("...or a Gossip Test", activates("blinded", 0, skillTest("Gossip", "fel")), false);

// p.185: "Melee Attacks against you benefit from Advantage, unless your foe is also Blinded." A targeter script
// runs in the attacker's dialog, so args.actor is the foe.
const foe = blinded => ({ ...meleeAttack, actor: { statuses: new Set(blinded ? ["blinded"] : []) } });
check("a sighted foe gets Advantage against the Blinded", activates("blinded", 1, foe(false)), true);
check("...a Blinded foe does not", activates("blinded", 1, foe(true)), false);
check("...and the row is hidden rather than shown inert", hides("blinded", 1, foe(true)), true);
check("...but shown to a sighted foe", hides("blinded", 1, foe(false)), false);
check("...and hidden on a Ranged Attack, as before", hides("blinded", 1, { ...rangedAttack, actor: { statuses: new Set() } }), true);

// p.186 Prone: "Disadvantage to all Tests involving movement of any kind"
check("Prone disadvantages Athletics", activates("prone", 0, skillTest("Athletics", "ag")), true);
check("...a Melee Attack", activates("prone", 0, meleeAttack), true);
check("...and a Grapple", activates("prone", 0, grapple), true);
check("Prone leaves a Ranged Attack alone", activates("prone", 0, rangedAttack), false);
check("...and a Perception Test", activates("prone", 0, skillTest("Perception", "i")), false);
// p.186: "Prone does not stack - you are either Prone or you are not", which the Condition already encodes by being
// unnumbered, so one Prone is one Disadvantage source and _applyConditions must not turn it into a counted penalty
check("Prone is not a numbered Condition", WFRP4E.statusEffects.find(e => e.id == "prone").system.condition.numbered, false);
check("...so its Disadvantage is a single source", scriptsFor("prone")[0].script, "args.fields.disSources++");

// Each predicate is labelled for what it tests, rather than three Conditions sharing one movement predicate under
// three different labels - which is how base came to put "Disadvantage on Tests relying on sight" on a movement test
check("Entangled's label names movement and Grappling", scriptsFor("entangled")[0].label, "FIFTHED.ConditionEntangledMovement");
check("Blinded's label names sight", scriptsFor("blinded")[0].label, "FIFTHED.ConditionBlindedSight");
check("...and its Advantage names the carve-out", scriptsFor("blinded")[1].label, "FIFTHED.ConditionBlindedAdvantage");
check("Prone's label names movement", scriptsFor("prone")[0].label, "FIFTHED.ConditionProneMovement");

// The Condition penalty itself is untouched: it still reads conditionValue through the p.184 "highest penalty"
// helper, which is the contract anything calling addCondition depends on
check("the Condition penalty still reads conditionValue", scriptsFor("entangled")[0].script, FifthEdition._penaltyScript("this.effect.conditionValue"));

/* Toggle off. fifth-edition.js edits the status effects 4e ships, in place, so with fifthEdConditions off every one
   of them has to come back exactly as config-wfrp4e.js built it. Only the toggle under test is flipped - every
   other rule is off too, so nothing else in apply() can move the result. */
WFRP4E.PrepareSystemItems();
const untouched = structuredClone(WFRP4E.statusEffects);
/** Which status effects a pass changed, by id - a readable answer to "did the 4e path move?" */
const changed = (before, after) => after.filter((e, i) => JSON.stringify(e) != JSON.stringify(before[i])).map(e => e.id);
for (let key of Object.keys(homebrew)) delete homebrew[key];
FifthEdition.apply();
check("no 4e Condition changes with fifthEdConditions off", changed(untouched, WFRP4E.statusEffects), []);
check("...and Besmirched is not added", WFRP4E.statusEffects.length, untouched.length);

report();
