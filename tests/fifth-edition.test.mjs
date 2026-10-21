/**
 * FifthEdition pure logic. Expected values come from the 5th Edition Core Rulebook, not from the implementation -
 * asserting what the code already does would only lock in its bugs. Cited pages are in the comments.
 *
 * Run: node tests/fifth-edition.test.mjs
 */
import { install, suite } from "./stubs.mjs";

// Held rather than inlined so the Luck section below can flip a toggle and put it back
const homebrew = { fifthEdOutcome: true, fifthEdAdvantage: true, fifthEdMomentum: true, fifthEdSize: true, fifthEdMagic: true, fifthEdMetacurrency: true };

install({
  homebrew,
  world: { automaticSuccess: 5, automaticFailure: 96 },
  config: { conditions: { entangled: "Entangled", prone: "Prone", bleeding: "Bleeding" } },
  // TALENT_MAX is keyed by localisation key and matched against the Talent's translated name, so the lookup only
  // works if these resolve. "NAME.Luck" is deliberately German here to prove the match is not on the English name.
  lang: { "NAME.Melee": "Melee", "NAME.AA": "Aethyric Attunement", "NAME.Luck": "Glück", "NAME.MagnumOpus": "Magnum Opus", "NAME.StrongBack": "Strong Back", "NAME.Wealthy": "Wealthy" }
});

const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const { check, report } = suite("FifthEdition");

/* -------------------------------------------- */
/*  resolveOutcome (p.130-131)                  */
/* -------------------------------------------- */

const outcome = (roll, sl, target = 50) => {
  let test = { result: { roll, SL: sl, target, outcome: sl > 0 ? "success" : "failure" }, targetModifiers: 0 };
  FifthEdition.resolveOutcome(test);
  return { outcome: test.result.outcome, SL: test.result.SL, desc: test.result.description };
};

check("SL +1 is a plain success", outcome(60, 1), { outcome: "success", SL: "+1", desc: "ROLL.Success" });
check("SL -3 is an Impressive failure", outcome(60, -3), { outcome: "failure", SL: -3, desc: "ROLL.ImpressiveFailure" });
check("SL +5 is an Astounding success", outcome(60, 5), { outcome: "success", SL: "+5", desc: "ROLL.AstoundingSuccess" });
// At exactly 0 SL the unmodified roll against the unmodified Skill decides
check("SL 0 under the target is Marginal success", outcome(40, 0), { outcome: "success", SL: "+0", desc: "ROLL.MarginalSuccess" });
check("SL 0 over the target is Marginal failure", outcome(70, 0), { outcome: "failure", SL: "-0", desc: "ROLL.MarginalFailure" });
// p.130: 96-100 is always a failure "resulting in at least a Marginal Failure", 01-05 always a success "achieving
// at least a Marginal Success" - a bound on how far the roll carries the result, never a magnitude
check("automatic failure keeps a negative SL", outcome(98, -3), { outcome: "failure", SL: -3, desc: "ROLL.ImpressiveFailure" });
check("automatic failure is at most Marginal", outcome(98, 5), { outcome: "failure", SL: "-0", desc: "ROLL.MarginalFailure" });
check("automatic success is at least Marginal", outcome(3, -5), { outcome: "success", SL: "+0", desc: "ROLL.MarginalSuccess" });
check("automatic success keeps a positive SL", outcome(3, 4), { outcome: "success", SL: "+4", desc: "ROLL.ImpressiveSuccess" });

/* -------------------------------------------- */
/*  flags / usesAdvantage                       */
/* -------------------------------------------- */

// The template snapshot must agree with enabled() for every toggle, since flags reads the setting once itself
const flags = FifthEdition.flags;
check("a toggle that is on", flags.momentum, true);
check("agrees with enabled()", flags.momentum, FifthEdition.enabled("Momentum"));
check("a toggle that is off", flags.corruption, false);
check("also agrees with enabled()", flags.corruption, FifthEdition.enabled("Corruption"));
check("one flag per toggle, plus usesAdvantage", Object.keys(flags).length, FifthEdition.TOGGLES.length + 1);
// Momentum, Conditions and Fortune all produce the digit-reversal mechanic, so any of them enables it
check("Momentum implies the Advantage mechanic", flags.usesAdvantage, true);
check("and the getter agrees", FifthEdition.usesAdvantage, true);

/* -------------------------------------------- */
/*  isMeleeItem (p.168)                         */
/* -------------------------------------------- */

// Momentum grants Advantage on Melee Tests and is won and lost on Melee Tests, so one predicate answers both
check("a melee weapon", FifthEdition.isMeleeItem({ attackType: "melee" }), true);
check("a ranged weapon is not", FifthEdition.isMeleeItem({ attackType: "ranged" }), false);
check("the Melee Skill itself", FifthEdition.isMeleeItem({ type: "skill", name: "Melee (Basic)" }), true);
check("a bare Melee Skill", FifthEdition.isMeleeItem({ type: "skill", name: "Melee" }), true);
check("another Skill is not", FifthEdition.isMeleeItem({ type: "skill", name: "Dodge" }), false);
check("a Skill merely containing the word is not", FifthEdition.isMeleeItem({ type: "skill", name: "Trade (Melee Smith)" }), false);
check("nothing is not", FifthEdition.isMeleeItem(null), false);

/* -------------------------------------------- */
/*  criticalFumble (p.130)                      */
/* -------------------------------------------- */

// 5e: any double is a Critical or a Fumble whatever the target number - 4e also required the roll to land under
// the Skill. Which one it is follows the Test's outcome once SL modifiers are in.
check("a double on a success is a Critical", FifthEdition.criticalFumble(55, "success"), "critical");
check("the same double on a failure is a Fumble", FifthEdition.criticalFumble(55, "failure"), "fumble");
check("a low double still follows the outcome", FifthEdition.criticalFumble(11, "failure"), "fumble");
check("a high double on a success is a Critical", FifthEdition.criticalFumble(99, "success"), "critical");
check("00 counts as a double", FifthEdition.criticalFumble(100, "failure"), "fumble");
check("a non-double is neither", FifthEdition.criticalFumble(54, "success"), "");
check("a non-double failure is neither", FifthEdition.criticalFumble(54, "failure"), "");
check("a missing roll is neither", FifthEdition.criticalFumble(undefined, "success"), "");
// The dummy test built for an unopposed defender carries roll 0, which would otherwise read as a double
check("an unopposed dummy's roll of 0 is neither", FifthEdition.criticalFumble(0, "failure"), "");

/* -------------------------------------------- */
/*  misfires (p.165)                            */
/* -------------------------------------------- */

// p.165, verbatim: "If you are using a Blackpowder, Engineering, or Explosive weapon and roll 99 or 00, your weapon
// Misfires: roll on the Misfire Table instead of the Oops! Table." Both halves differ from 4e, which Misfires on any
// even Fumble - so the 4e triggers are asserted as non-triggers here, not merely left untested.
check("99 on a Blackpowder weapon Misfires", FifthEdition.misfires(99, "blackpowder"), true);
check("00 on a Blackpowder weapon Misfires", FifthEdition.misfires(100, "blackpowder"), true);
check("Engineering is one of the three groups", FifthEdition.misfires(99, "engineering"), true);
check("so is Explosives", FifthEdition.misfires(100, "explosives"), true);
// The 4e trigger: any even roll. None of these is 99 or 00, so none of them Misfires under 5e
check("22 no longer Misfires", FifthEdition.misfires(22, "blackpowder"), false);
check("nor 44", FifthEdition.misfires(44, "blackpowder"), false);
check("nor 66", FifthEdition.misfires(66, "blackpowder"), false);
check("nor 88", FifthEdition.misfires(88, "blackpowder"), false);
// 98 and 00 bracket the trigger from below and above; 11 is the double just under it
check("98 is not 99", FifthEdition.misfires(98, "blackpowder"), false);
check("11 is a double but not 99 or 00", FifthEdition.misfires(11, "blackpowder"), false);
// The weapon group is half the rule
check("a Sword does not Misfire at 99", FifthEdition.misfires(99, "basic"), false);
check("nor a Bow at 00", FifthEdition.misfires(100, "bow"), false);
check("nor a weapon with no group", FifthEdition.misfires(99, undefined), false);
// 00 is carried as 100 throughout the pipeline; a literal 0 is the unopposed dummy's roll, not a result of 00
check("a raw 0 is not 00", FifthEdition.misfires(0, "blackpowder"), false);
check("a missing roll does not Misfire", FifthEdition.misfires(undefined, "blackpowder"), false);
// result.roll is a number, but a string would coerce to the same d100 value
check("a numeric string still reads as 99", FifthEdition.misfires("99", "blackpowder"), true);

/* -------------------------------------------- */
/*  resolveAdvantage (p.130)                    */
/* -------------------------------------------- */

const advantage = (adv, dis, legacy) => {
  let preData = { advSources: adv, disSources: dis, reversal: legacy };
  let result = FifthEdition.resolveAdvantage(preData);
  return result && { net: result.net, extraSL: result.extraSL, reversal: preData.reversal };
};

check("one Advantage reverses if better", advantage(1, 0), { net: 1, extraSL: 0, reversal: { allowed: true, if: "better" } });
// "each one after the first grants +1 SL"
check("two Advantage add +1 SL", advantage(2, 0), { net: 2, extraSL: 1, reversal: { allowed: true, if: "better" } });
check("three Advantage add +2 SL", advantage(3, 0), { net: 3, extraSL: 2, reversal: { allowed: true, if: "better" } });
check("two Disadvantage add -1 SL", advantage(0, 2), { net: -2, extraSL: -1, reversal: { allowed: true, if: "worse" } });
// "Advantage and Disadvantage cancel each other out"
check("one of each cancels exactly", advantage(1, 1), { net: 0, extraSL: 0, reversal: { allowed: false, if: "better" } });
check("no sources changes nothing", advantage(0, 0), null);
check("a script's plain reversal is one source", advantage(0, 0, { allowed: true, if: "better" }), { net: 1, extraSL: 0, reversal: { allowed: true, if: "better" } });

/* -------------------------------------------- */
/*  talentMax (p.114-128, p.191)                */
/* -------------------------------------------- */

// Translated: the world above renders NAME.Luck as "Glück", and that is the name the Talent Item carries
check("a translated Talent still finds its max", FifthEdition.talentMax("Glück"), 3);
check("a translated specialisation too", FifthEdition.talentMax("Glück (Something)"), 3);
check("the untranslated English name no longer matches", FifthEdition.talentMax("Luck"), 1);
// A module may key an override by plain name rather than by localisation key
check("a plain-name key still works", FifthEdition.talentMax("NAME.Luck"), 3);
check("Magnum Opus has no limit", FifthEdition.talentMax("Magnum Opus"), "-");
check("Aethyric Attunement twice", FifthEdition.talentMax("Aethyric Attunement"), 2);
check("Strong Back twice", FifthEdition.talentMax("Strong Back"), 2);
check("Wealthy twice", FifthEdition.talentMax("Wealthy"), 2);
check("specialisation Talents are bought once", FifthEdition.talentMax("Acute Sense (Sight)"), 1);
check("anything unlisted is bought once", FifthEdition.talentMax("Warrior Born"), 1);

/* -------------------------------------------- */
/*  Size (p.360)                                */
/* -------------------------------------------- */

const actor = size => ({ details: { size: { value: size } } });

check("Little collapses to Tiny", FifthEdition.mapSize("ltl"), "tiny");
check("Small collapses to Average", FifthEdition.mapSize("sml"), "avg");
check("Average is untouched", FifthEdition.mapSize("avg"), "avg");
// config.actorSizeNums still numbers all seven 4e sizes, so the collapsed rungs sit at 0, 3, 4, 5, 6 - the step
// count has to come off the five-step ladder, or Average would read as three steps above Tiny
check("same size is no steps", FifthEdition.sizeSteps(actor("avg"), actor("avg")), 0);
check("Large is one step over Average", FifthEdition.sizeSteps(actor("lrg"), actor("avg")), 1);
check("Enormous is two steps over Average", FifthEdition.sizeSteps(actor("enor"), actor("avg")), 2);
check("Monstrous is three steps over Average", FifthEdition.sizeSteps(actor("mnst"), actor("avg")), 3);
check("Average is one step over Tiny", FifthEdition.sizeSteps(actor("avg"), actor("tiny")), 1);
check("a Halfling is the same size as a Human", FifthEdition.sizeSteps(actor("avg"), actor("sml")), 0);
check("steps go negative the other way", FifthEdition.sizeSteps(actor("avg"), actor("lrg")), -1);
check("an unknown size has no step count", FifthEdition.sizeSteps(actor("bogus"), actor("avg")), null);

/* -------------------------------------------- */
/*  parseInflict (p.304)                        */
/* -------------------------------------------- */

check("a rated Condition", FifthEdition.parseInflict("Entangled 50"), [{ key: "entangled", name: "Entangled", strength: 50 }]);
check("an unrated Condition", FifthEdition.parseInflict("Prone"), [{ key: "prone", name: "Prone", strength: null }]);
check("two, only one rated", FifthEdition.parseInflict("Entangled 35, Prone"), [{ key: "entangled", name: "Entangled", strength: 35 }, { key: "prone", name: "Prone", strength: null }]);
check("an unknown Condition is ignored", FifthEdition.parseInflict("Baffled 10"), []);
check("nothing to parse", FifthEdition.parseInflict(""), []);

/* -------------------------------------------- */
/*  limitOvercasts (p.236-237)                  */
/* -------------------------------------------- */

const spell = (lore, memorized, int = 3, wp = 4) => ({
  item: { system: { lore: { value: lore }, memorized: { value: memorized } } },
  actor: { system: { characteristics: { int: { bonus: int }, wp: { bonus: wp } } } }
});

check("Petty spells cannot Overcast", FifthEdition.limitOvercasts(spell("petty", true), 10), 0);
check("unmemorised spells cannot Overcast", FifthEdition.limitOvercasts(spell("fire", false), 10), 0);
check("Overcasting caps at IB + WPB", FifthEdition.limitOvercasts(spell("fire", true), 10), 7);
check("under the cap is untouched", FifthEdition.limitOvercasts(spell("fire", true), 2), 2);

/* -------------------------------------------- */
/*  Advancement XP costs (p.191, p.364)         */
/* -------------------------------------------- */

// Bands are five Advances wide, so index = floor(advances / 5) and the array position is the band the *next*
// Advance falls in: 40 prior Advances means the 41st, which is the 41-45 band.
const band = (advances, type) => FifthEdition.XP_COST[type][Math.floor(advances / 5)];

check("first Characteristic Advance", band(0, "characteristic"), 25);
check("first Skill Advance", band(0, "skill"), 10);
check("36-40 Skill band", band(35, "skill"), 170);
check("41-45 Characteristic band", band(40, "characteristic"), 360);
check("71+ Skill band", band(70, "skill"), 1700);

// The one value in the table that is not printed in the book: p.364 repeats 170 here and p.191 repeats 850, but
// p.364 is p.191 / 5 throughout, so that is a single misprinted number. See FifthEdition.SKILL_XP_41_45 for why
// the reconstruction is 240 — this pins it, since anyone checking against the book will read it as an error.
check("41-45 Skill band corrects the misprint", band(40, "skill"), 240);
check("...and so no longer repeats 36-40", band(40, "skill") !== band(35, "skill"), true);

// Every cost is the geometric mean of its neighbours to within the book's own rounding: at worst 3.35% across
// the Characteristic column and 6.07% across the Skill column, the larger cases being the small low bands where
// rounding to a nice number costs proportionally more. That is the property the printed 41-45 Skill value breaks,
// and because one wrong cell also distorts the means either side of it, the right value has to repair three bands
// at once — as printed they sit at +19.02%, -29.29% and +16.62%, and 240 moves all three into the noise, which no
// other candidate does (220 and 250 each leave two of the three outside it).
//
// That same spread is a trap when reading a failure: three consecutive bands are flagged but only the middle one
// is wrong, and printing each one's computed mean beside it would be an instruction to overwrite two correctly
// printed values with rubbish (143 and 292 in this case). So identify the culprit by substitution rather than by
// position: replace each flagged cell with its neighbours' mean and re-run the sweep. The culprit is the one whose
// replacement puts the *whole* table back inside tolerance, which also means nothing is ever measured against
// SKILL_XP_41_45 — a tampered constant cannot be reported as its own expected value.
//
// Two blind spots, both deliberate. The sweep needs a cell on each side, so the first and last bands are never
// checked and a wrong value there is reported against its neighbour. And with more than one bad cell no single
// substitution repairs the table, which is reported as an ambiguous diagnosis rather than a clean bill.

const BANDS = ["1-5", "6-10", "11-15", "16-20", "21-25", "26-30", "31-35", "36-40", "41-45", "46-50", "51-55", "56-60", "61-65", "66-70", "71+"];
const TOLERANCE = 7;

const mean = (t, i) => Math.sqrt(t[i - 1] * t[i + 1]);
const deviation = (t, i) => 100 * (t[i] / mean(t, i) - 1);
const flagged = t => t.slice(1, -1).map((v, k) => ({ i: k + 1, v, d: deviation(t, k + 1) })).filter(({ d }) => Math.abs(d) > TOLERANCE);

const diagnose = (label, t) => {
  const bad = flagged(t);
  if (!bad.length) return [];
  // A cell is the culprit if substituting its neighbours' mean for it clears every violation in the table
  const culprits = bad.filter(({ i }) => {
    const patched = [...t];
    patched[i] = mean(t, i);
    return !flagged(patched).length;
  });
  const verdict = culprits.length === 1
    ? `one bad cell explains every line below — band ${BANDS[culprits[0].i]} should be near ${Math.round(mean(t, culprits[0].i))}`
    : culprits.length
      ? `ambiguous — any one of ${culprits.map(c => BANDS[c.i]).join(", ")} would explain it`
      : `no single cell explains this — treat every line below as suspect`;
  return [`${label}: ${verdict}`, ...bad.map(({ i, v, d }) => {
    const note = culprits.length !== 1 ? "suspect" : culprits[0].i === i ? "wrong" : "collateral, leave it alone";
    return `  band ${BANDS[i]} is ${v}, ${d > 0 ? "+" : ""}${d.toFixed(2)}% off its neighbours' mean -> ${note}`;
  })];
};

check("no cost sits off the curve", [
  ...diagnose("characteristic", FifthEdition.XP_COST.characteristic),
  ...diagnose("skill", FifthEdition.XP_COST.skill)
], []);

/* The diagnosis above is only worth trusting if it has been run against tables that are actually broken. Building
   those here rather than patching the source file: a find-and-replace that silently fails to match yields a clean
   run that looks like a pass for the case you thought you were testing. */

const withCell = (type, i, v) => Object.assign([...FifthEdition.XP_COST[type]], { [i]: v });
const verdictOf = lines => (lines[0] || "").split(": ")[1];
const notesOf = lines => lines.slice(1).map(l => l.split("-> ")[1]);

// The book's own value, which is the case this whole section exists for
const printed = diagnose("skill", withCell("skill", 8, 170));
check("names the misprinted band", verdictOf(printed), "one bad cell explains every line below — band 41-45 should be near 240");
check("...and labels the collateral", notesOf(printed), ["collateral, leave it alone", "wrong", "collateral, leave it alone"]);

// An unrelated single cell, to show the diagnosis is not hardcoded to one position or one table
const elsewhere = diagnose("characteristic", withCell("characteristic", 5, 400));
check("names an unrelated bad cell", verdictOf(elsewhere), "one bad cell explains every line below — band 26-30 should be near 138");

// Two bad cells must never come back clean, which is the failure mode of gating the verdict on a single culprit
const doubly = withCell("skill", 4, 999);
doubly[10] = 111;
check("the corruption took", [doubly[4], doubly[10]], [999, 111]);
check("two bad cells are not a clean bill", verdictOf(diagnose("skill", doubly)), "no single cell explains this — treat every line below as suspect");
check("...and nothing is waved through", [...new Set(notesOf(diagnose("skill", doubly)))], ["suspect"]);

/* -------------------------------------------- */
/*  Luck (p.122)                                */
/* -------------------------------------------- */

// "You gain +1 maximum Fortune. If you wish, you may purchase this Talent up to three times, for a maximum of +3
// Fortune." The Talent Item carries no effect in any content module, so the maximum reads its Advances directly.
// TalentModel.Advances already totals Advances across duplicate Items, so this only has to find one of them.
const withTalents = (...talents) => ({ itemTypes: { talent: talents } });
const talent = (name, advances) => ({ name, system: { Advances: advances } });

// The world above renders NAME.Luck as "Glück", so an implementation matching on the English name scores nothing
check("Luck adds its Advances", FifthEdition.luckFortune(withTalents(talent("Glück", 2))), 2);
check("three purchases add three", FifthEdition.luckFortune(withTalents(talent("Glück", 3))), 3);
check("...and the English name is not it", FifthEdition.luckFortune(withTalents(talent("Luck", 3))), 0);
check("another Talent adds nothing", FifthEdition.luckFortune(withTalents(talent("Strong Back", 2))), 0);
check("no Talents at all", FifthEdition.luckFortune(withTalents()), 0);
// Called during data preparation, where an actor may not be the shape you hoped for
check("an actor without items", FifthEdition.luckFortune({}), 0);
check("no actor", FifthEdition.luckFortune(undefined), 0);

// 4e's wording for Luck was not available to check, so the bonus is deliberately confined to the 5e path
homebrew.fifthEdMetacurrency = false;
check("nothing without the 5e toggle", FifthEdition.luckFortune(withTalents(talent("Glück", 3))), 0);
homebrew.fifthEdMetacurrency = true;
check("...and it comes back with it", FifthEdition.luckFortune(withTalents(talent("Glück", 3))), 3);

/* -------------------------------------------- */
/*  Accurate -> Precise (p.303-305)             */
/* -------------------------------------------- */

// 5e's Quality list has no Accurate, and Precise is what it prints on the one weapon 4e gave Accurate to, so the
// 4e Quality has to stop writing a percentage and start doing what Precise does.
const accurateEffect = () => ({
  propertyEffects: {
    accurate: {
      system: {
        scriptData: [
          { label: "Accurate", trigger: "dialog", script: "args.fields.modifier += 10;" },
          { label: "Accurate", trigger: "immediate", script: "args.fields.modifier += 10;" }
        ]
      }
    }
  }
});

const accurateScripts = config => config.propertyEffects.accurate.system.scriptData.map(s => s.script);

const converted = accurateEffect();
FifthEdition._applyAccurate(converted);
check("Accurate becomes Precise's +1 SL", accurateScripts(converted)[0], "args.fields.successBonus += 1;");
// Only the dialog script is the modifier; anything else on the effect is not this rule's business
check("...and no other trigger is touched", accurateScripts(converted)[1], "args.fields.modifier += 10;");

// A world whose content module has already replaced or removed the effect must not throw on the way past
const bare = { propertyEffects: {} };
FifthEdition._applyAccurate(bare);
check("a missing Accurate effect is not an error", bare, { propertyEffects: {} });

/* -------------------------------------------- */
/*  Outnumbering (p.167, p.360)                 */
/* -------------------------------------------- */

// p.360's table, read off the printed rows. Tiny is not printed at all and nothing below 1 is, so it counts as one.
check("Average counts as one creature", FifthEdition.sizeCount(actor("avg")), 1);
check("Small collapses to Average, still one", FifthEdition.sizeCount(actor("sml")), 1);
check("Large counts as two", FifthEdition.sizeCount(actor("lrg")), 2);
check("Enormous counts as three", FifthEdition.sizeCount(actor("enor")), 3);
check("Monstrous counts as four", FifthEdition.sizeCount(actor("mnst")), 4);
check("Tiny is unprinted and counts as one", FifthEdition.sizeCount(actor("tiny")), 1);
check("an unknown size counts as one", FifthEdition.sizeCount(actor("bogus")), 1);
check("no actor counts as one", FifthEdition.sizeCount(undefined), 1);

// p.167: "You outnumber an opponent only if your side has at least twice as many Engaged combatants as theirs."
// p.360 weights only the side *being* outnumbered - see FifthEdition.outnumbering for the two quotes that pin it.
const outnumbered = (size, ...opponents) => FifthEdition.outnumbering(actor(size), opponents.map(actor)).outnumbered;

check("one opponent never outnumbers", outnumbered("avg", "avg"), false);
check("two opponents do", outnumbered("avg", "avg", "avg"), true);
// "2 Size (Large) Ogres outnumber 1 Size (Average) Human 2 to 1, not 4 to 1" - 2 to 1 is still 2 to 1
check("two Ogres outnumber a Human", outnumbered("avg", "lrg", "lrg"), true);
// ...and the same clause says a lone Ogre is one opponent, not two, so it cannot outnumber anybody
check("one Ogre does not, despite counting as two", outnumbered("avg", "lrg"), false);
check("nor one Dragon", outnumbered("avg", "mnst"), false);
// "you would need 4 Size (Average) creatures to outnumber a Size (Large) creature by 2 to 1"
check("three do not outnumber an Ogre", outnumbered("lrg", "avg", "avg", "avg"), false);
check("four do", outnumbered("lrg", "avg", "avg", "avg", "avg"), true);
check("eight are needed against a Dragon", outnumbered("mnst", ...Array(7).fill("avg")), false);
check("...and eight suffice", outnumbered("mnst", ...Array(8).fill("avg")), true);
check("nobody outnumbers nobody", outnumbered("avg"), false);

// The Size-weighted opposing total is reported alongside so the prompt can show it, but it is not the ratio
check("the counts the prompt shows", FifthEdition.outnumbering(actor("lrg"), [actor("lrg"), actor("avg")]), { theirs: 2, weighted: 3, ours: 2, outnumbered: false });

// With the Size toggle off every creature counts as one, so the ratio falls back to a plain headcount
homebrew.fifthEdSize = false;
check("no Size weighting without the toggle", FifthEdition.sizeCount(actor("mnst")), 1);
check("...so an Ogre is outnumbered by two", outnumbered("lrg", "avg", "avg"), true);
homebrew.fifthEdSize = true;
check("...and with it, two is not enough", outnumbered("lrg", "avg", "avg"), false);

/* -------------------------------------------- */
/*  Opposed resolution order (p.133, p.360)     */
/* -------------------------------------------- */

/* OpposedTest reaches further into Foundry than the functions above, so this section stubs the rest of what
   evaluate() touches on the way through. Two of those stubs exist to stop a false pass rather than to make one:
   evaluate() wraps its whole body in try/catch and returns undefined on a throw, so `errors` is asserted empty at
   the end and every expectation is an object that `undefined` cannot match. */

const errors = [];
globalThis.WarhammerMessageModel = class {};
globalThis.WarhammerTestBase = class {};
globalThis.warhammer = { utility: { log: () => {} } };
globalThis.Hooks = { call: () => {} };
globalThis.ui = { notifications: { error: message => errors.push(String(message)), warn: () => {}, notify: () => {} } };
// Foundry adds this to Number; the attacker-wins branch calls it, and without it that branch throws into the catch
globalThis.Number.isNumeric = function (n) {
  if (n instanceof Array) return false;
  else if ([null, ""].includes(n)) return false;
  return +n === +n;
};

const uuids = {};
globalThis.fromUuid = async uuid => uuids[uuid];

const chat = [];
globalThis.ChatMessage = { create: data => chat.push(data) };
game.wfrp4e.utility.chatDataSetup = text => ({ content: text });

const OpposedTest = (await import("../src/system/opposed-test.js")).default;
(await import("../src/system/audio-wfrp4e.js")).default.PlayContextAudio = () => {};

/** An actor as much of it as the paths under test read, with its calls recorded rather than performed. */
const combatant = (name, size = "avg", advantage = 0) => {
  let self = {
    uuid: `Actor.${name}`,
    id: name,
    name,
    prototypeToken: { name },
    details: { size: { value: size } },
    status: { advantage: { value: advantage } },
    removed: [],
    setAdvantage: value => { self.status.advantage.value = value; },
    removeCondition: condition => { self.removed.push(condition); },
    runScripts: () => []
  };
  uuids[self.uuid] = self;
  return self;
};

/** One side's Test. `item: "s"` is a Strength Test, which is what Size overpowers by default. */
const sideTest = (owner, { item = "s", SL = 0, target = 50, useFate = false, crit = "", options = {}, context = {}, tested } = {}) => ({
  actor: owner,
  preData: { item, useFate, options },
  result: { SL },
  target,
  item: tested, // the Item under test, which is what decides whether this is a Melee Test
  isCriticalFumble: crit,
  context: { unopposed: false, breakdown: {}, ...context },
  data: {}
});

const resolve = async (attackerTest, defenderTest) => {
  let result = await new OpposedTest(attackerTest, defenderTest).evaluate();
  return result && { winner: result.winner, differenceSL: result.differenceSL };
};

homebrew.fifthEdFate = true;

// p.133: "You automatically succeed, even in the direst circumstances. In an Opposed Test, you win by at least +1
// SL." Fate is therefore the last word, and the case that proves it is one where Size would otherwise lift the
// larger creature back on top: equal SL, so overpowerBySize has something to do rather than nothing.
const fateAgainstSize = size => resolve(
  sideTest(combatant("Ulrika", "avg"), { SL: 0, useFate: true }),
  sideTest(combatant(`Foe-${size}`, size), { SL: 0 })
);

check("Fate outranks a one-step Size gap", await fateAgainstSize("lrg"), { winner: "attacker", differenceSL: 1 });
check("...a two-step gap", await fateAgainstSize("enor"), { winner: "attacker", differenceSL: 1 });
check("...and a three-step gap", await fateAgainstSize("mnst"), { winner: "attacker", differenceSL: 1 });
// The widest gap on the ladder, Tiny against Monstrous
check("...four steps, Tiny against a Dragon", await resolve(
  sideTest(combatant("Familiar", "tiny"), { SL: 0, useFate: true }),
  sideTest(combatant("Dragon", "mnst"), { SL: 0 })
), { winner: "attacker", differenceSL: 1 });

// Already winning by 2 SL, so Fate has nothing to add until Size takes the win away - the ordering bug exactly
check("Fate answers a Size lift it did not need before", await resolve(
  sideTest(combatant("Kastor", "avg"), { SL: 3, useFate: true }),
  sideTest(combatant("Troll", "lrg"), { SL: 1 })
), { winner: "attacker", differenceSL: 1 });

// The book does not cover both sides spending Fate. Neither is lifted; SL decide. Equal sizes so Size is not in it.
check("both spending Fate lifts neither", await resolve(
  sideTest(combatant("Rival A", "avg"), { SL: 0, useFate: true }),
  sideTest(combatant("Rival B", "avg"), { SL: 2, useFate: true })
), { winner: "defender", differenceSL: 2 });

// p.360 unchanged when no Fate is spent: 2+ steps wins automatically, 1 step unless the smaller creature Crits
check("Size still overpowers by one step", await resolve(
  sideTest(combatant("Ogre", "lrg"), { SL: 0 }),
  sideTest(combatant("Soldier", "avg"), { SL: 2 })
), { winner: "attacker", differenceSL: 1 });
check("...unless the smaller creature Crits", await resolve(
  sideTest(combatant("Ogre B", "lrg"), { SL: 0 }),
  sideTest(combatant("Soldier B", "avg"), { SL: 2, crit: "critical" })
), { winner: "defender", differenceSL: 2 });
check("...and two steps ignore the Crit", await resolve(
  sideTest(combatant("Griffon", "enor"), { SL: 0 }),
  sideTest(combatant("Soldier C", "avg"), { SL: 2, crit: "critical" })
), { winner: "attacker", differenceSL: 1 });

// Toggle off, #1: with neither rule on, the plain SL comparison decides and a spent Fate lifts nothing
homebrew.fifthEdFate = false;
homebrew.fifthEdSize = false;
check("no Fate lift without the toggle", await resolve(
  sideTest(combatant("Ulrika D", "avg"), { SL: 0, useFate: true }),
  sideTest(combatant("Ogre D", "lrg"), { SL: 2 })
), { winner: "defender", differenceSL: 2 });
homebrew.fifthEdFate = true;
// Toggle off, #18: Size alone off, so the larger creature is not lifted
check("no Size overpower without the toggle", await resolve(
  sideTest(combatant("Ogre E", "lrg"), { SL: 0 }),
  sideTest(combatant("Soldier E", "avg"), { SL: 2 })
), { winner: "defender", differenceSL: 2 });
homebrew.fifthEdSize = true;

/* -------------------------------------------- */
/*  isStrengthTest (p.360 "and similar")        */
/* -------------------------------------------- */

const strengthTest = (item, context = {}, options = {}) => OpposedTest.isStrengthTest({ preData: { item, options }, context });

check("a Strength Characteristic Test", strengthTest("s"), true);
check("another characteristic is not", strengthTest("ws"), false);
// "and similar" cannot be read off a skill name, so a caller declares itself instead
check("a declared Size contest counts", strengthTest("ws", { sizeContest: true }), true);
check("...declared in the setup context too", strengthTest("ws", {}, { sizeContest: true }), true);
check("an unopposed Strength Test is not a contest", strengthTest("s", { unopposed: true }), false);
check("...nor is a declared one", strengthTest("ws", { unopposed: true }, { sizeContest: true }), false);
check("no test at all", OpposedTest.isStrengthTest(undefined), false);

// End to end: a Climb-style contest declares itself and Size overpowers it the same way Grapple does
check("a declared contest is overpowered by Size", await resolve(
  sideTest(combatant("Ogre F", "lrg"), { item: "ws", SL: 0, options: { sizeContest: true } }),
  sideTest(combatant("Soldier F", "avg"), { item: "ws", SL: 2, options: { sizeContest: true } })
), { winner: "attacker", differenceSL: 1 });
check("...and undeclared it is not", await resolve(
  sideTest(combatant("Ogre G", "lrg"), { item: "ws", SL: 0 }),
  sideTest(combatant("Soldier G", "avg"), { item: "ws", SL: 2 })
), { winner: "defender", differenceSL: 2 });

/* -------------------------------------------- */
/*  Failed Disengage (p.163)                    */
/* -------------------------------------------- */

/* p.163: "Should you fail, your opponents gain Momentum and you remain Engaged." Plural, and only the one who
   answered the Test is still in hand by the time this resolves - so the set is asserted on each actor's Advantage,
   not on the chat line, which is what the rule actually moves. */

const disengageContest = async ({ attackerSL = 0, defenderSL = 2, opponents = [], threaded = true } = {}) => {
  let runaway = combatant("Runaway", "avg");
  let answering = opponents[0];
  let attackerTest = sideTest(runaway, {
    item: "ag",
    SL: attackerSL,
    context: { disengage: true },
    options: threaded ? { disengageOpponents: opponents.map(o => o.uuid) } : {}
  });
  await resolve(attackerTest, sideTest(answering, { item: "ws", SL: defenderSL }));
  return { runaway, advantage: opponents.map(o => o.status.advantage.value) };
};

const threeFoes = () => [combatant("Marauder", "avg"), combatant("Kurgan", "avg"), combatant("Hound", "avg")];

let failed = await disengageContest({ opponents: threeFoes() });
check("every captured opponent gains Momentum", failed.advantage, [1, 1, 1]);
check("...and the disengager stays Engaged", failed.runaway.removed, []);

// Momentum is binary (p.168), so an opponent already holding it is left where they are rather than doubled
let alreadyHeld = [combatant("Marauder B", "avg", 1), combatant("Kurgan B", "avg", 0)];
check("an opponent already holding Momentum keeps one", (await disengageContest({ opponents: alreadyHeld })).advantage, [1, 1]);

// A Test rolled before the list existed, or an opposed pair edited together by hand, still rewards who answered it
check("no captured list falls back to the defender", (await disengageContest({ opponents: threeFoes(), threaded: false })).advantage, [1, 0, 0]);

// Winning is the other half of the same rule
let escaped = await disengageContest({ attackerSL: 2, defenderSL: 0, opponents: threeFoes() });
check("a won Disengage frees the actor", escaped.runaway.removed, ["engaged"]);
check("...and moves no Momentum", escaped.advantage, [0, 0, 0]);

/* handleMomentum runs immediately before handleDisengage inside the same gate, and both move Momentum. They must
   not both fire on one Disengage: p.163 rewards the opponents for the failed exit, and p.168 rewards the winner of
   an Opposed *Melee* Test, which a Dodge or Perform (Acrobatics) is not. With a combat active - the condition
   handleMomentum otherwise returns on - the disengager must still not be stripped as a "loser". */
game.combat = { active: true };
let inCombat = await disengageContest({ opponents: [combatant("Marauder C", "avg"), combatant("Kurgan C", "avg")] });
check("a Disengage in combat still awards once", inCombat.advantage, [1, 1]);
let holding = combatant("Runaway Holding", "avg", 1);
holding.setupSkill = () => null;
let stripped = await (async () => {
  let attackerTest = sideTest(holding, { item: "ag", SL: 0, context: { disengage: true }, options: { disengageOpponents: [] }, tested: { type: "skill", name: "Dodge" } });
  await resolve(attackerTest, sideTest(combatant("Answerer", "avg"), { item: "ws", SL: 2, tested: { type: "skill", name: "Melee (Basic)" } }));
  return holding.status.advantage.value;
})();
check("...and does not strip the disengager as a Melee loser", stripped, 1);
game.combat = undefined;

// Toggle off, #7: the Momentum gate is in evaluate(), so this has to run through evaluate() to test through it
homebrew.fifthEdMomentum = false;
let ungated = await disengageContest({ opponents: threeFoes() });
check("no Momentum moves without the toggle", ungated.advantage, [0, 0, 0]);
check("...and no Condition is touched", ungated.runaway.removed, []);
homebrew.fifthEdMomentum = true;

check("nothing threw on the way through", errors, []);

/* -------------------------------------------- */
/*  Leaving an Engagement (p.163, p.360)        */
/* -------------------------------------------- */

/* FifthEdition.disengage drives a dialog, so the prompt is rendered and read back rather than assumed: the stub
   parses the checkbox out of the HTML the function built and hands that state to the button callback, which is the
   path a player's click takes. */

let prompt = null;
let skillSetup = null;
foundry.applications = { api: { DialogV2: {
  wait: async ({ content, buttons }) => {
    prompt = content;
    let checked = /name="outnumbered" checked/.test(content);
    let button = { form: { elements: { outnumbered: { checked } } } };
    let chosen = buttons.find(b => b.action == "dodge") || buttons[0];
    return chosen.callback(null, button);
  }
} } };

const leaver = (size, advantage = 0) => {
  let self = combatant("Leaver", size, advantage);
  self.setupSkill = (skill, context) => { skillSetup = { skill, context }; return null; };
  return self;
};

const drive = async (actor, opponents) => {
  prompt = null;
  skillSetup = null;
  chat.length = 0;
  game.user = { targets: opponents.map(actor => ({ actor })) };
  await FifthEdition.disengage(actor);
  return { prompt, skillSetup, chatted: chat.length };
};

// p.360: "Creatures ignore the need to Disengage from melee combat with smaller combatants."
let ogre = leaver("lrg");
let free = await drive(ogre, [combatant("Snotling", "avg"), combatant("Rat", "tiny")]);
check("a larger creature is not asked to Disengage", free.prompt, null);
check("...it simply stops being Engaged", ogre.removed, ["engaged"]);
check("...spending no Momentum", ogre.status.advantage.value, 0);
check("...making no Test", free.skillSetup, null);
check("...and saying so in chat", free.chatted, 1);

// One opponent its own size is enough to put the question back
let ogreB = leaver("lrg");
let contested = await drive(ogreB, [combatant("Snotling B", "avg"), combatant("Troll", "lrg")]);
check("an equal-sized opponent restores the routes", contested.skillSetup != null, true);
check("...and nothing is dropped for free", ogreB.removed, []);
// An unknown size is not "smaller", so it is not waved through either
let ogreC = leaver("lrg");
check("an unknown size is not smaller", (await drive(ogreC, [combatant("Thing", "bogus")])).skillSetup != null, true);

// Toggle off, #16: without the Size toggle the larger creature is offered the ordinary routes like anyone else
homebrew.fifthEdSize = false;
let ogreD = leaver("lrg");
check("no free exit without the Size toggle", (await drive(ogreD, [combatant("Snotling D", "avg")])).skillSetup != null, true);
homebrew.fifthEdSize = true;

/* The outnumbered box: prefilled, shown, and still editable (p.167, p.360). */

const prefilled = async (size, ...opponents) => {
  let run = await drive(leaver(size), opponents.map((s, i) => combatant(`Foe${i}-${s}`, s)));
  return { checked: /name="outnumbered" checked/.test(run.prompt), disadvantage: run.skillSetup.context.fields.disSources || 0 };
};

check("two opponents prefill the box", await prefilled("avg", "avg", "avg"), { checked: true, disadvantage: 1 });
check("one does not", await prefilled("avg", "avg"), { checked: false, disadvantage: 0 });
// p.360's "not 4 to 1": an Ogre is one opponent when it is the one doing the outnumbering
check("a lone Ogre does not outnumber you", await prefilled("avg", "lrg"), { checked: false, disadvantage: 0 });
check("two Ogres do", await prefilled("avg", "lrg", "lrg"), { checked: true, disadvantage: 1 });
// ...while the Ogre's own Size is counted when the Ogre is the one asking. Its opponents have to be its own size
// to get this far at all: an Ogre engaged only with smaller combatants never reaches the prompt (p.360, above),
// so the book's own "4 Size (Average) creatures against 1 Large" is moot here and is covered on outnumbering().
check("an Ogre is not outnumbered by two Ogres", await prefilled("lrg", "lrg", "lrg"), { checked: false, disadvantage: 0 });
check("...but is by four", await prefilled("lrg", "lrg", "lrg", "lrg", "lrg"), { checked: true, disadvantage: 1 });

// The box is a plain enabled checkbox, and the counts behind the prefill are on screen next to it
let shown = await drive(leaver("avg"), [combatant("Foe X", "lrg"), combatant("Foe Y", "avg")]);
check("the box stays editable", /<input type="checkbox" name="outnumbered"( checked)?>/.test(shown.prompt), true);
check("...and is not disabled or hidden", /outnumbered"[^>]*(disabled|hidden)/.test(shown.prompt), false);
check("the counts are shown beside it", shown.prompt.includes("FIFTHED.DisengageOutnumberedCount"), true);

// Toggle off, #17: without Size everyone counts as one, so the Ogre is outnumbered by the two it withstood above
homebrew.fifthEdSize = false;
check("no Size weighting in the prefill without the toggle", await prefilled("lrg", "lrg", "lrg"), { checked: true, disadvantage: 1 });
// ...and the line explaining how Size weights the ratio goes with it, rather than explaining an unapplied rule
let unweighted = await drive(leaver("avg"), [combatant("Foe Z", "lrg"), combatant("Foe W", "avg")]);
check("...and so does the sentence explaining it", unweighted.prompt.includes("FIFTHED.DisengageOutnumberedCount"), false);
homebrew.fifthEdSize = true;

// The opponents are captured here, as UUIDs, because handleDisengage will have only the defender left
let threaded = await drive(leaver("avg"), [combatant("Foe P", "avg"), combatant("Foe Q", "avg")]);
check("the engaged opponents travel with the Test", threaded.skillSetup.context.disengageOpponents, ["Actor.Foe P", "Actor.Foe Q"]);
check("...and it is still flagged a Disengage", threaded.skillSetup.context.disengage, true);

report();
