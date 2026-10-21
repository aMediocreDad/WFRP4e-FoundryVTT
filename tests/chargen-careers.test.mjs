/**
 * The allocations 5th Edition states exactly rather than as a ceiling: the Skill Advances spent at Character
 * Creation (p.38-39, p.27-35).
 *
 * Expected values come from the Core Rulebook, not from the implementation. Cited pages are in the comments.
 * Every rule is asserted twice: once with the 5e toggles on, and once with them off, because these validators are
 * shared with 4e character generation and the 4e path has to come through untouched.
 *
 * Run: node tests/chargen-careers.test.mjs
 */
import { install, suite } from "./stubs.mjs";

// Held rather than inlined so the regression section below can flip a toggle and put it back
const homebrew = { fifthEdMetacurrency: true };

install({ homebrew });

// The chargen Stages cannot be loaded here - they import "./stage" without an extension, which only rollup resolves -
// so their allocation rules live in a module of their own and are imported directly.

const { careerSkillsRefusal, speciesSkillsRefusal } = await import("../src/apps/chargen/allocation.js");

const { check, report } = suite("chargen + careers");

/* -------------------------------------------- */
/*  Career Skill Advances (p.38-39)             */
/* -------------------------------------------- */

// "Assign 8 Advances among the Career Skills you selected in step 2", each Advance +5, "no Skill can receive more
// than 3 Advances (+15) during Character Creation". A Career lists eight Skills, so eight is the usual pool.
const careerSkills = (...values) => careerSkillsRefusal(values.concat(Array(Math.max(0, 8 - values.length)).fill(0)));

check("8 Advances spread one each", careerSkills(5, 5, 5, 5, 5, 5, 5, 5), null);
check("8 Advances stacked up to +15", careerSkills(15, 15, 10), null);
check("40 points is the whole allocation", careerSkills(15, 15, 5, 5), null);
// The bug: every validator rejected excess and none rejected shortfall, so a character could finish having spent 0 of 8
check("7 Advances is a shortfall", careerSkills(5, 5, 5, 5, 5, 5, 5), "CareerSkillTotal5e");
check("35 points is refused", careerSkills(15, 15, 5), "CareerSkillTotal5e");
check("nothing spent at all is refused", careerSkills(), "CareerSkillTotal5e");
check("45 points is refused too", careerSkills(15, 15, 10, 5), "CareerSkillTotal5e");
check("a 4th Advance in one Skill is refused", careerSkills(20, 15, 5), "CareerSkillAllocation5e");
check("part of an Advance is refused", careerSkills(3, 15, 15, 7), "CareerSkillAllocation5e");
// A Career offering so few Skills that 40 cannot be reached inside the +15 cap must not become uncompletable
check("a total the Skills cannot reach is not demanded", careerSkillsRefusal([15, 15]), null);
check("but the per-Skill cap still holds there", careerSkillsRefusal([20, 15]), "CareerSkillAllocation5e");

/* -------------------------------------------- */
/*  Species Skill Advances (p.27-35)            */
/* -------------------------------------------- */

// "Add one Advance (+5) to any five of the following Skills" - every Species entry has that shape, and the twelve
// Skills a Human chooses from is the usual pool. `true` is the Stage being submitted; `false` is it being edited.
const speciesSkills = (advanced, final = true, pool = 12) =>
  speciesSkillsRefusal(Array(advanced).fill(5).concat(Array(pool - advanced).fill(0)), final);

check("five Skills at +5", speciesSkills(5), null);
// The bug: 2 of 5 was accepted, because only the excess was ever checked
check("four is a shortfall", speciesSkills(4), "SpeciesSkillIncomplete5e");
check("two is a shortfall", speciesSkills(2), "SpeciesSkillIncomplete5e");
check("none at all is a shortfall", speciesSkills(0), "SpeciesSkillIncomplete5e");
check("six is too many", speciesSkills(6), "SpeciesSkillAdvancements5e");
// 5e has no +3 tier: a Species Skill is advanced once or not at all
check("a 4e +3 Advance is refused", speciesSkillsRefusal([3, 5, 5, 5, 5, 5, 0, 0], true), "SpeciesSkillAdvancements5e");
check("a part-Advance is refused", speciesSkillsRefusal([1, 5, 5, 5, 5, 5, 0, 0], true), "SpeciesSkillAdvancements5e");

// The trap this flag exists for: the Stage undoes any drop that fails validation, so demanding all five while the
// player is still dragging would revert the very first Skill and leave the step impossible to finish.
check("one Skill dropped so far is fine", speciesSkills(1, false), null);
check("four dropped so far is fine", speciesSkills(4, false), null);
check("but six is refused even mid-drag", speciesSkills(6, false), "SpeciesSkillAdvancements5e");
// A Species offering fewer Skills than Advances cannot place them all
check("a pool smaller than five is not demanded", speciesSkillsRefusal([5, 5, 5], true), null);

/* -------------------------------------------- */
/*  4th Edition is untouched                    */
/* -------------------------------------------- */

// These validators are shared with 4e character generation, so every gate above has to disappear when its toggle is
// off. Each toggle is flipped and put back, because this file is one script and the assertions below would inherit it.

homebrew.fifthEdMetacurrency = false;

// 4e spends "up to" 40 points and allows 10 in one Skill; the Stage's own ceiling checks own that, and this returns
// nothing at all so it cannot add a rule 4e never had
check("4e: a shortfall is not this rule's business", careerSkills(5, 5, 5), null);
check("4e: nothing spent is fine here", careerSkills(), null);
check("4e: 10 in one Skill passes", careerSkills(10, 10, 10, 10), null);
check("4e: over 40 is left to the Stage", careerSkills(15, 15, 15), null);
// 4e Species Skills are three at +5 and three at +3 - both of which 5e refuses
check("4e: three at +5 passes", speciesSkills(3), null);
check("4e: the +3 tier passes", speciesSkillsRefusal([3, 3, 3, 5, 5, 5, 0, 0], true), null);
check("4e: six advanced is left to the Stage", speciesSkills(6), null);

homebrew.fifthEdMetacurrency = true;
check("Metacurrency restored", careerSkills(5, 5, 5), "CareerSkillTotal5e");

report();
