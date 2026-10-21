/**
 * The five 5e rules fixes of run D, in one file: paying for Fate and Fortune before the benefit is applied, a
 * Fate-chosen Critical picking its Hit Location, which class owns Overcasting, the Flee! Talent, and career Talent
 * specialisation matching.
 *
 * Expected values come from the 5th Edition Core Rulebook, not from the implementation - asserting what the code
 * already does would only lock in its bugs. Cited pages are in the comments.
 *
 * Test instances are built with Object.create rather than `new`, so the constructors' Foundry dependencies stay out
 * of the way and each test can say exactly what state it is exercising.
 *
 * The extra ambient Foundry globals live here rather than in tests/stubs.mjs, which is shared with the other runs in
 * this stack. Run: node tests/rules-singles.test.mjs
 */
import { install, suite } from "./stubs.mjs";

const homebrew = {
  fifthEdFate: true, fifthEdFortune: true, fifthEdMagic: true, fifthEdCriticalHits: true,
  fifthEdMomentum: true
};

install({
  homebrew,
  world: { useWoMOvercast: false },
  // "NAME.Flee" resolves the way en.json resolves it; the Talent is matched on its translated name
  lang: { "NAME.Flee": "Flee!" }
});

/** Localisation keys passed to ui.notifications, newest last. Assert on the key, never on the English. */
const notifications = [];

// Ambient globals the roll modules read at class-definition time - without them `import` throws before a single
// assertion runs - plus the handful FifthEdition.flee reaches for.
Number.isNumeric = value => (value instanceof Array ? false : ![null, ""].includes(value) && +value === +value);
const record = key => { notifications.push(key); };
globalThis.ui = { notifications: { warn: record, error: record, info: record, notify: record } };
globalThis.Hooks = { call: () => {}, on: () => {}, once: () => {} };
globalThis.warhammer = { utility: { log: () => {} } };
globalThis.ChatMessage = { create: () => {} };
for (const name of ["WarhammerTestBase", "WarhammerMessageModel", "WarhammerActor", "WarhammerItem", "SocketHandlers", "ItemDialog", "Item"]) {
  globalThis[name] = class {};
}
let confirmFlee = true;
globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => confirmFlee } } };
game.wfrp4e.utility.chatDataSetup = content => ({ content });

const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const TestWFRP = (await import("../src/system/rolls/test-wfrp4e.js")).default;
const AttackTest = (await import("../src/system/rolls/attack-test.js")).default;
const CastTest = (await import("../src/system/rolls/cast-test.js")).default;
const WomCastTest = (await import("../src/system/rolls/wom-cast-test.js")).default;
const { check, report } = suite("RulesSingles");

/** Re-point the settings stub at a different world without re-importing the modules under test */
const setWorld = ({ homebrew: hb = homebrew, world = {} } = {}) => {
  game.settings.get = (_namespace, key) => (key === "homebrew" ? hb : world[key]);
};

/**
 * A Test instance with the given preData, on an actor holding the given metacurrency. `actor` is a prototype getter
 * that resolves a speaker, so it is shadowed with an own property.
 */
const testWith = (Class, preData = {}, { fate = 0, fortune = 0 } = {}) => {
  const actor = {
    system: { status: { fate: { value: fate }, fortune: { value: fortune } } },
    updates: [],
    async update(data) {
      this.updates.push(data);
      if ("system.status.fate.value" in data) this.system.status.fate.value = data["system.status.fate.value"];
      if ("system.status.fortune.value" in data) this.system.status.fortune.value = data["system.status.fortune.value"];
    }
  };
  const test = Object.create(Class.prototype);
  test.data = { preData: { other: [], advSources: 0, disSources: 0, ...preData }, result: { other: [] }, context: {} };
  Object.defineProperty(test, "actor", { value: actor });
  return test;
};

/* -------------------------------------------- */
/*  Paying for Fate and Fortune (p.133)         */
/* -------------------------------------------- */

// p.133: "I Will Not Fail! Instead of rolling a Test, choose the result instead." A Fate Point buys that; with no
// Fate Point there is nothing to buy it with, and the Test is an ordinary Test.

const spendFate = async ({ fate, useFate = true, fateSpent = false, unopposed = false, hb = homebrew }) => {
  setWorld({ homebrew: hb });
  notifications.length = 0;
  const test = testWith(TestWFRP, { useFate }, { fate });
  test.context.fateSpent = fateSpent;
  test.context.unopposed = unopposed;
  await test.spendFate();
  return {
    fate: test.actor.system.status.fate.value,
    useFate: test.preData.useFate,
    charged: !!test.context.fateSpent,
    updates: test.actor.updates.length,
    warned: notifications.at(-1) ?? null
  };
};

check("one Fate Point pays for I Will Not Fail!",
  await spendFate({ fate: 2 }),
  { fate: 1, useFate: true, charged: true, updates: 1, warned: null });

check("at zero Fate the benefit is refused",
  await spendFate({ fate: 0 }),
  { fate: 0, useFate: false, charged: false, updates: 0, warned: "FIFTHED.NoFate" });

// The last point is still a point - the refusal is below 1, not at 1
check("the last Fate Point still pays",
  await spendFate({ fate: 1 }),
  { fate: 0, useFate: true, charged: true, updates: 1, warned: null });

// A negative or absent value is not a credit line
check("a negative Fate value cannot pay",
  await spendFate({ fate: -1 }),
  { fate: -1, useFate: false, charged: false, updates: 0, warned: "FIFTHED.NoFate" });

// The charge is once per Test: a reroll or an edit re-enters roll() with the point already paid
check("an already-charged Test is not charged twice",
  await spendFate({ fate: 2, fateSpent: true }),
  { fate: 2, useFate: true, charged: true, updates: 0, warned: null });

check("a Test that never asked for Fate is left alone",
  await spendFate({ fate: 2, useFate: false }),
  { fate: 2, useFate: false, charged: false, updates: 0, warned: null });

// Dummy unopposed tests resolve someone else's roll and must not spend that actor's Fate
check("an unopposed dummy Test spends nothing",
  await spendFate({ fate: 2, unopposed: true }),
  { fate: 2, useFate: true, charged: false, updates: 0, warned: null });

// Toggle-off regression: with fifthEdFate off the 4e path never charges and never warns
check("4e path: Fate toggle off charges nothing",
  await spendFate({ fate: 2, hb: { ...homebrew, fifthEdFate: false } }),
  { fate: 2, useFate: true, charged: false, updates: 0, warned: null });

const spendFortune = async ({ fortune, fortuneAdvantage = true, advSources = 1, spent = false, unopposed = false, hb = homebrew }) => {
  setWorld({ homebrew: hb });
  notifications.length = 0;
  const test = testWith(TestWFRP, { fortuneAdvantage, advSources }, { fortune });
  test.context.fortuneAdvantageSpent = spent;
  test.context.unopposed = unopposed;
  await test.spendFortuneAdvantage();
  return {
    fortune: test.actor.system.status.fortune.value,
    advSources: test.preData.advSources,
    charged: !!test.context.fortuneAdvantageSpent,
    updates: test.actor.updates.length,
    warned: notifications.at(-1) ?? null
  };
};

// p.133: "Spend a Fortune Point to: Gain Advantage on a Test before rolling."
check("one Fortune Point pays for the Advantage",
  await spendFortune({ fortune: 2 }),
  { fortune: 1, advSources: 1, charged: true, updates: 1, warned: null });

// The Advantage source RollDialog._computeFortuneAdvantage added has to come back off, or the roll keeps a benefit
// nobody paid for - which is the whole defect
check("at zero Fortune the Advantage source is taken back",
  await spendFortune({ fortune: 0 }),
  { fortune: 0, advSources: 0, charged: false, updates: 0, warned: "FIFTHED.NoFortuneAdvantage" });

check("the last Fortune Point still pays",
  await spendFortune({ fortune: 1 }),
  { fortune: 0, advSources: 1, charged: true, updates: 1, warned: null });

// Other sources of Advantage on the same roll are the actor's own and survive the refusal (p.130: sources stack)
check("a refusal only takes back its own source",
  await spendFortune({ fortune: 0, advSources: 3 }),
  { fortune: 0, advSources: 2, charged: false, updates: 0, warned: "FIFTHED.NoFortuneAdvantage" });

check("an already-charged Test is not charged twice",
  await spendFortune({ fortune: 2, spent: true }),
  { fortune: 2, advSources: 1, charged: true, updates: 0, warned: null });

check("an unopposed dummy Test spends nothing",
  await spendFortune({ fortune: 2, unopposed: true }),
  { fortune: 2, advSources: 1, charged: false, updates: 0, warned: null });

// Toggle-off regression: RollDialog only adds the Advantage source while Fortune is on, so with it off there is no
// source to take back and nothing to charge - the 4e path is untouched either way
check("4e path: Fortune toggle off charges nothing and takes nothing back",
  await spendFortune({ fortune: 0, hb: { ...homebrew, fifthEdFortune: false } }),
  { fortune: 0, advSources: 1, charged: false, updates: 0, warned: null });

/* -------------------------------------------- */
/*  A Fate-chosen Critical picks its location   */
/*  (p.133, against p.171)                      */
/* -------------------------------------------- */

// p.171: a Critical Hit's Critical Wound normally lands on a freshly rolled location. p.133 lets I Will Not Fail!
// override that: "If you choose to score a Critical, you may pick the Hit Location instead of rolling randomly."

// The real hitloc RollTable, as hitLocKeyToResult reads it: a location key maps to the low end of its d100 range
const HITLOC = { head: 1, lArm: 10, rArm: 25, body: 45, lLeg: 80, rLeg: 90 };
let rolled = 0;
game.wfrp4e.tables = {
  hitLocKeyToResult: key => (key in HITLOC ? { result: key, description: key, roll: HITLOC[key] } : undefined),
  rollTable: async (_key, options = {}) => {
    if (options.lookup == null) { rolled++; return { result: "body", description: "body", roll: 45 }; }
    const entry = Object.entries(HITLOC).sort((a, b) => b[1] - a[1]).find(([, low]) => options.lookup >= low);
    return { result: entry[0], description: entry[0], roll: options.lookup };
  }
};

// A real Called Shot carries both fields: the constructor sets preData.hitLocation from the same dialog value that
// becomes selectedHitLocation, so the fixture sets them together unless a case is deliberately about one of them.
const fateCrit = (preData) => {
  const picked = "selectedHitLocation" in preData ? preData.selectedHitLocation : "head";
  const test = testWith(AttackTest, { fateRoll: 44, useFate: true, hitLocation: picked, selectedHitLocation: picked, ...preData });
  test.applyFateCriticalLocation();
  return test.preData.critHitloc;
};

check("a Fate-chosen double with a picked location writes that location's roll value", fateCrit({}), HITLOC.head);
// This exercises applyFateCriticalLocation over all six keys and shows it adds no arithmetic of its own; the real
// key-to-roll-value conversion lives in hitLocKeyToResult against the world's hit location table, which a stub
// cannot check. That half is verified in the test world - see evidence/05-runtime-*.txt.
check("every location is carried through without arithmetic", await (async () => {
  const out = {};
  for (const key of Object.keys(HITLOC)) {
    const value = fateCrit({ selectedHitLocation: key });
    out[key] = (await game.wfrp4e.tables.rollTable("hitloc", { lookup: value })).result;
  }
  return out;
})(), { head: "head", lArm: "lArm", rArm: "rArm", body: "body", lLeg: "lLeg", rLeg: "rLeg" });

// The waiver in AttackDialog and the pick here agree on the same predicate: the chosen result must be a double
check("a Fate roll that is not a double picks nothing", fateCrit({ fateRoll: 45 }), undefined);
check("99 is a double and picks", fateCrit({ fateRoll: 99 }), HITLOC.head);
// 100 % 11 == 1, so a chosen 100 is not a double under this predicate - and AttackDialog agrees, which is the
// property that matters: the pick and the Called Shot waiver never disagree about what a double is.
check("a chosen 100 is not a double here", fateCrit({ fateRoll: 100 }), undefined);
check("a Test not spending Fate picks nothing", fateCrit({ useFate: false }), undefined);
check("no Called Shot means no pick", fateCrit({ selectedHitLocation: "roll" }), undefined);
check("hitLocation 'none' means no pick", fateCrit({ selectedHitLocation: "none" }), undefined);
check("an empty selection means no pick", fateCrit({ selectedHitLocation: "" }), undefined);
// A missing hit location table degrades to p.171's fresh roll rather than throwing
check("an unknown location key leaves the roll to p.171", fateCrit({ selectedHitLocation: "wing" }), undefined);
// An edit or a re-render arrives with the location already settled; it must not be recomputed
check("an existing critHitloc is left alone", fateCrit({ critHitloc: 77 }), 77);

// 5e (p.167): AttackDialog waives the Called Shot cost for a Fate-chosen Critical, because the pick is part of what
// the point buys. A refused point buys nothing, so the waiver has to come back off - otherwise "the roll proceeds
// unmodified" is false in exactly the direction that favours the player who could not pay.
const calledShotAfterSpend = async ({ fate, modifiers = true, fateRoll = 44, picked = "head", useFate = true }) => {
  setWorld({ homebrew: { ...homebrew, fifthEdModifiers: modifiers } });
  const test = testWith(AttackTest, { useFate, fateRoll, hitLocation: picked, selectedHitLocation: picked, slBonus: 0, testModifier: 0 }, { fate });
  await test.spendFate();
  return { slBonus: test.preData.slBonus, modifier: test.preData.testModifier, useFate: test.preData.useFate };
};

check("a refused Fate re-imposes the Called Shot cost (5e: -2 SL)",
  await calledShotAfterSpend({ fate: 0 }), { slBonus: -2, modifier: 0, useFate: false });
check("...and -20 when the Modifiers toggle is off",
  await calledShotAfterSpend({ fate: 0, modifiers: false }), { slBonus: 0, modifier: -20, useFate: false });
// A paid point keeps what it bought
check("a paid Fate keeps the waiver",
  await calledShotAfterSpend({ fate: 1 }), { slBonus: 0, modifier: 0, useFate: true });
// The dialog only waived the cost for a chosen double, so only a chosen double can have it re-imposed
check("a non-double never had the waiver, so nothing is re-imposed",
  await calledShotAfterSpend({ fate: 0, fateRoll: 45 }), { slBonus: 0, modifier: 0, useFate: false });
check("no Called Shot means nothing to re-impose",
  await calledShotAfterSpend({ fate: 0, picked: "roll" }), { slBonus: 0, modifier: 0, useFate: false });
check("a Test that never asked for Fate is untouched",
  await calledShotAfterSpend({ fate: 0, useFate: false }), { slBonus: 0, modifier: 0, useFate: false });
setWorld();

// Toggle-off regression: with fifthEdFate off the pick never happens and p.171's fresh roll stands
setWorld({ homebrew: { ...homebrew, fifthEdFate: false } });
check("4e path: Fate toggle off picks nothing", fateCrit({}), undefined);
// With CriticalHits off nothing consumes preData.critHitloc, but reset() would still copy a bare number into
// result.critHitloc on a later edit, and computeTables would point the Critical link at "critundefined".
setWorld({ homebrew: { ...homebrew, fifthEdCriticalHits: false } });
check("4e path: CriticalHits off writes no crit location", fateCrit({}), undefined);
setWorld();

// computeCriticalLocation is unchanged: it looks up a pick and rolls fresh without one
const criticalLocation = async (preData) => {
  rolled = 0;
  const test = testWith(AttackTest, preData);
  test.data.result = { other: [], critical: "Critical", hitloc: { result: "body" } };
  await test.computeCriticalLocation();
  return { location: test.result.critHitloc.result, freshRolls: rolled };
};

check("a picked location is looked up, not rolled",
  await criticalLocation({ critHitloc: HITLOC.rLeg }), { location: "rLeg", freshRolls: 0 });
check("no pick still rolls fresh (p.171)",
  await criticalLocation({}), { location: "body", freshRolls: 1 });

// reroll() deletes preData.critHitloc, and the pick is re-derived on every computeResult rather than cached, so a
// reroll genuinely re-decides it. Without Fate that means p.171's fresh roll comes back; with Fate still in play
// p.133 still lets the player pick, and re-rolling the location would contradict the rule the pick came from.
const afterReroll = (preData) => {
  const test = testWith(AttackTest, { fateRoll: 44, useFate: true, hitLocation: "lLeg", selectedHitLocation: "lLeg", critHitloc: HITLOC.head, ...preData });
  delete test.preData.critHitloc; // what reroll() does
  test.applyFateCriticalLocation();
  return test.preData.critHitloc;
};
check("a reroll re-decides the pick rather than reusing it", afterReroll({}), HITLOC.lLeg);
check("a reroll with Fate refused leaves it to p.171", afterReroll({ useFate: false }), undefined);

/* -------------------------------------------- */
/*  Which class owns Overcasting (p.236)        */
/* -------------------------------------------- */

// p.236: "If a Casting Test generates SL beyond those required to cast a spell, you can spend the remaining SL on
// Overcasting. You can spend a number of SL equal to your Intelligence Bonus plus Willpower Bonus in this way."
// One for one, capped at IB + WPB - which is WomCastTest. CastTest halves the surplus, which is the 4e rule.

const selected = (fifthEdMagic, useWoMOvercast) => {
  setWorld({ homebrew: { ...homebrew, fifthEdMagic }, world: { useWoMOvercast } });
  return WomCastTest.selected;
};

check("5e Magic on selects the 5e implementation", selected(true, false), true);
check("the Winds of Magic option alone still selects it", selected(false, true), true);
check("both together select it", selected(true, true), true);
check("4e path: neither toggle leaves CastTest in charge", selected(false, false), false);

/**
 * Overcasts a Test of the given class computes from a surplus, on a caster with the given bonuses.
 * `limitOvercasts` reads the spell and the actor, so both are supplied.
 */
const overcasts = (Class, slOver, { int = 4, wp = 4, lore = "fire", memorized = true, totalPower = 0, roll = 0 } = {}) => {
  setWorld({ homebrew, world: { useWoMOvercast: false } });
  game.wfrp4e.config.overCastTable = () => ({
    range: [{ cost: 2 }], target: [{ cost: 2 }], AoE: [{ cost: 5 }], duration: [{ cost: 3 }], damage: [{ cost: 1 }], other: [{ cost: 2 }]
  });
  const test = Object.create(Class.prototype);
  test.data = {
    preData: {},
    result: { SL: 4, roll, totalPower, overcast: { usage: {} } },
    context: {}
  };
  Object.defineProperty(test, "actor", { value: { system: { characteristics: { int: { bonus: int }, wp: { bonus: wp } } } } });
  Object.defineProperty(test, "item", { value: { system: { lore: { value: lore }, memorized: { value: memorized } } } });
  Object.defineProperty(test, "spell", { value: { lore: { value: lore } } });
  test._calculateOverCast(slOver);
  return test.result.overcasts;
};

// The defect: 4 SL over yields 2 overcasts under CastTest's 4e halving, 4 under the 5e rule
check("5e: 4 SL over buys 4 overcasts", overcasts(WomCastTest, 4), 4);
check("4e: the same surplus buys 2", overcasts(CastTest, 4), 2);
check("5e: an odd surplus is not rounded away", overcasts(WomCastTest, 3), 3);
check("5e: the cap is Intelligence Bonus + Willpower Bonus", overcasts(WomCastTest, 9, { int: 3, wp: 2 }), 5);
check("5e: a surplus under the cap is not raised to it", overcasts(WomCastTest, 2, { int: 4, wp: 4 }), 2);
check("5e: no surplus buys nothing", overcasts(WomCastTest, 0), 0);
check("5e: a negative surplus does not go negative", overcasts(WomCastTest, -3), 0);
// p.236: "Petty Spells cannot be Overcast." An unmemorised spell read from a grimoire likewise.
check("5e: a Petty Spell cannot Overcast", overcasts(WomCastTest, 4, { lore: "petty" }), 0);
check("5e: an unmemorised Spell cannot Overcast", overcasts(WomCastTest, 4, { memorized: false }), 0);
// p.235, Critical Casting: "Total Power: ... You may add the tens digit of your Casting Test to your SL for the
// purpose of Overcasting." Still capped at IB + WPB, which is a limit on what may be spent.
check("5e: Total Power adds the tens digit", overcasts(WomCastTest, 1, { totalPower: 1, roll: 63 }), 7);
check("5e: Total Power does not lift the cap", overcasts(WomCastTest, 1, { totalPower: 1, roll: 63, int: 2, wp: 2 }), 4);
check("5e: no Total Power adds nothing", overcasts(WomCastTest, 1, { totalPower: 0, roll: 63 }), 1);

// Toggle-off regression: with fifthEdMagic off, limitOvercasts steps aside entirely and each class keeps its own
// arithmetic - including the uncapped WoM behaviour a 4e world with the Winds option set already had
setWorld({ homebrew: { ...homebrew, fifthEdMagic: false }, world: { useWoMOvercast: false } });
const overcasts4e = (Class, slOver) => {
  const test = Object.create(Class.prototype);
  test.data = { preData: {}, result: { SL: 4, roll: 0, totalPower: 0, overcast: { usage: {} } }, context: {} };
  Object.defineProperty(test, "spell", { value: { lore: { value: "fire" } } });
  test._calculateOverCast(slOver);
  return test.result.overcasts;
};
check("4e path: CastTest still halves", overcasts4e(CastTest, 9), 4);
check("4e path: WoM is still uncapped one-for-one", overcasts4e(WomCastTest, 9), 9);
// The settings stub was last pointed at a 4e world by the section above; the FifthEdition rules below start from
// the run's own toggles again.
setWorld();

/* -------------------------------------------- */
/*  Flee! (p.120, against p.163)                */
/* -------------------------------------------- */

// p.163, Fleeing: "When you choose to Flee, each Engaged opponent immediately gains Momentum, which they may lose to
// make one free Melee Attack against you. You gain 1 Broken Condition for each enemy you were Engaged with."
// p.120, Flee!: "If you choose to Flee in combat (page 163), you do not gain any Broken Conditions." Only the
// Conditions - the Talent exempts neither the opponents' Momentum nor leaving the Engagement.


let foeId = 0;
const opponent = () => ({ id: `foe${++foeId}`, name: "Opponent", status: { advantage: { value: 0 } }, momentum: 0, async setAdvantage(v) { this.status.advantage.value = v; this.momentum = v; } });

const fleeing = (talents = []) => ({
  id: "fleeing", name: "Runner",
  itemTypes: { talent: talents.map(name => ({ name })) },
  conditions: {}, removed: [],
  async addCondition(key, count = 1) { this.conditions[key] = (this.conditions[key] || 0) + count; },
  async removeCondition(key) { this.removed.push(key); }
});

const flee = async (talents, count = 2) => {
  const foes = Array.from({ length: count }, opponent);
  game.user = { targets: foes.map(actor => ({ actor })) }; // engagedOpponents reads Tokens, not Actors
  const actor = fleeing(talents);
  await FifthEdition.flee(actor);
  return { broken: actor.conditions.broken ?? 0, removed: actor.removed, momentum: foes.map(f => f.momentum) };
};

check("Fleeing without the Talent takes one Broken per Engaged foe",
  await flee([]), { broken: 2, removed: ["engaged"], momentum: [1, 1] });
check("the Flee! Talent waives the Broken Conditions",
  await flee(["Flee!"]), { broken: 0, removed: ["engaged"], momentum: [1, 1] });
// The Talent is about Conditions only, so a lone opponent still gets their Momentum and the Engagement still ends
check("...and nothing else about Fleeing changes",
  await flee(["Flee!"], 1), { broken: 0, removed: ["engaged"], momentum: [1] });
// Talents are matched by name; an unrelated Talent is not the Flee! Talent
check("another Talent does not waive them",
  await flee(["Fleet-footed"]), { broken: 2, removed: ["engaged"], momentum: [1, 1] });
check("the localisation key is accepted as well as its translation", FifthEdition.hasFleeTalent(fleeing(["NAME.Flee"])), true);
check("an actor with no Talents at all is not an error", FifthEdition.hasFleeTalent(fleeing([])), false);
check("nothing has no Talents", FifthEdition.hasFleeTalent(null), false);

// Toggle-off regression: Fleeing is a Momentum-toggle feature, so with it off the button does nothing either way
homebrew.fifthEdMomentum = false;
check("4e path: Momentum off, Fleeing does nothing", await flee([]), { broken: 0, removed: [], momentum: [0, 0] });
check("4e path: ...with the Talent too", await flee(["Flee!"]), { broken: 0, removed: [], momentum: [0, 0] });
homebrew.fifthEdMomentum = true;

/* -------------------------------------------- */
/*  Career Talent specialisation (p.191)        */
/* -------------------------------------------- */

// A Career grants named Talents. The specialisation is part of the name: a Career listing Etiquette (Soldiers) has
// not granted Etiquette (Nobles), and buying the latter must not fill the Advancement box the former promised.
// The list is what upstream's CharacterCareerModel.handleTalentAdvancement passes: the Career Path tier's Talents.
const career = (listed, bought) => FifthEdition.isCareerTalent([].concat(listed), bought);

check("the same Talent", career("Flee!", "Flee!"), true);
check("a Talent the Career never listed", career("Flee!", "Sharp"), false);
check("the same specialisation", career("Etiquette (Soldiers)", "Etiquette (Soldiers)"), true);
check("a different specialisation is a different Talent", career("Etiquette (Soldiers)", "Etiquette (Nobles)"), false);
check("...in either direction", career("Etiquette (Nobles)", "Etiquette (Soldiers)"), false);
check("a bare listing does not grant a specialisation", career("Etiquette", "Etiquette (Nobles)"), false);
check("a specialised listing does not grant the bare Talent", career("Etiquette (Nobles)", "Etiquette"), false);
check("one entry among several still matches", career(["Sharp", "Etiquette (Nobles)", "Flee!"], "Etiquette (Nobles)"), true);

// The converted content writes "any specialisation" three ways, and carries the lower-case spelling too
check("(Any One) is a wildcard", career("Etiquette (Any One)", "Etiquette (Nobles)"), true);
check("(Any) is a wildcard", career("Etiquette (Any)", "Etiquette (Guilder)"), true);
check("(any) is a wildcard", career("Etiquette (any)", "Etiquette (Cultists)"), true);
check("(All) is a wildcard", career("Striding Gait (All)", "Striding Gait (Rocky)"), true);
check("(ANY ONE) is a wildcard", career("Acute Sense (ANY ONE)", "Acute Sense (Sight)"), true);
check("a wildcard does not cross to another base name", career("Etiquette (Any)", "Fearless (Nobles)"), false);
// A wildcard names the whole family, so it covers a member written without a specialisation too. Unreachable in
// the converted content - no bare career-talent name is also the base of a specialised one - but the forgiving
// direction is the right one for a rule about which Talents a Career offers.
check("a wildcard also covers the bare Talent", career("Etiquette (Any)", "Etiquette"), true);
// The wildcard is the Career's to offer, not the buyer's to claim
check("buying (Any) does not match a specific listing", career("Etiquette (Soldiers)", "Etiquette (Any)"), false);
check("...but does match the Career's own wildcard", career("Etiquette (Any One)", "Etiquette (Any One)"), true);
// Everything else is a specific specialisation, however wildcard-ish it reads
check("(Everything) is not a wildcard", career("Fearless (Everything)", "Fearless (Rats)"), false);
check("a compound choice is not a wildcard", career("Etiquette (Criminals or Scholars)", "Etiquette (Criminals)"), false);

// Names come from content and from translations, so case and spacing must not decide the answer
check("case does not decide it", career("Etiquette (Soldiers)", "etiquette (soldiers)"), true);
check("spacing does not decide it", career("Etiquette  (Soldiers)", "Etiquette (Soldiers) "), true);
check("a missing name is not a match", career("Etiquette (Soldiers)", ""), false);
check("no Career Talents match nothing", FifthEdition.isCareerTalent(undefined, "Flee!"), false);

report();
