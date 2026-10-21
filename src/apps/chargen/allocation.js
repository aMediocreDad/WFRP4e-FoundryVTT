import FifthEdition from "../../system/fifth-edition.js";

/**
 * The Skill Advance allocations 5th Edition asks for at Character Creation.
 *
 * 4th Edition treats these totals as ceilings and the Stage's own bounds checks already enforce them, so every
 * function here returns null - no refusal - whenever the 5e rules are off. Keeping that toggle read in here rather
 * than at the call site is what lets the 4e path be proven unchanged without a running Foundry. The Stage still
 * reads the toggle for its own 4e-only ceiling and for the template, so this is not the only place it appears.
 *
 * Each function answers with the `CHARGEN.ERROR.*` key naming what is wrong, or null when the allocation is legal.
 * Keys rather than sentences: the caller formats them, and the tests can name a rule without depending on English.
 */

/** One Advance is +5 (p.38). */
export const ADVANCE = 5;

/** p.38-39: "Assign 8 Advances among the Career Skills you selected in step 2." Eight Advances of +5 is 40 points. */
export const CAREER_SKILL_ADVANCES = 8;

/** p.38-39: "no Skill can receive more than 3 Advances (+15) during Character Creation." */
export const MAX_ADVANCES_PER_SKILL = 3;

/** p.27-35: every Species entry reads "Add one Advance (+5) to any five of the following Skills". */
export const SPECIES_SKILL_ADVANCES = 5;

const CAREER_SKILL_POINTS = CAREER_SKILL_ADVANCES * ADVANCE;
const MAX_PER_SKILL = MAX_ADVANCES_PER_SKILL * ADVANCE;

const total = values => values.reduce((sum, value) => sum + value, 0);

/**
 * Whether the Career Skills on offer can carry the full allocation at all. A Career listing only a Skill or two
 * cannot reach 40 points inside the +15 per-Skill cap, and a total nobody can reach is a dead end rather than a
 * rule - so the requirement lifts and the Stage's plain "no more than 40" ceiling is all that applies.
 */
const reachable = values => values.length * MAX_PER_SKILL >= CAREER_SKILL_POINTS;

/**
 * Career Skill Advances (p.38-39): eight of them, each +5, and no more than three (+15) in any one Skill.
 *
 * The total is exact in both directions. 4e's "no more than 40" ceiling still lives on the Stage and still runs
 * there when these rules are off; under 5e it stands down in favour of this, so a wrong total raises one error.
 *
 * @param {number[]} values Points allocated to each Career Skill
 * @returns {string|null}   CHARGEN.ERROR key, or null when the allocation is legal
 */
export function careerSkillsRefusal(values) {
  if (!FifthEdition.enabled("Metacurrency")) return null;

  if (values.some(value => value % ADVANCE != 0 || value > MAX_PER_SKILL)) return "CareerSkillAllocation5e";

  if (reachable(values) && total(values) != CAREER_SKILL_POINTS) return "CareerSkillTotal5e";

  return null;
}

/**
 * Species Skill Advances (p.27-35): one Advance (+5) to exactly five Skills, every other Skill left at zero.
 *
 * `final` is the whole subtlety. The Stage checks each drop as it happens and undoes any drop this refuses, so
 * demanding all five before the Stage is submitted would revert the very first Skill dropped and leave the step
 * impossible to complete. Until submission only the ceiling applies; the count is required once, at the end.
 *
 * @param {number[]} values Advance value of each Species Skill on offer
 * @param {boolean} final   True when the Stage is being submitted rather than edited
 * @returns {string|null}   CHARGEN.ERROR key, or null when the allocation is legal
 */
export function speciesSkillsRefusal(values, final = false) {
  if (!FifthEdition.enabled("Metacurrency")) return null;

  // 5e has no +3 tier: a Skill is either advanced once or not at all
  if (values.some(value => value != 0 && value != ADVANCE)) return "SpeciesSkillAdvancements5e";

  let advanced = values.filter(value => value == ADVANCE).length;
  if (advanced > SPECIES_SKILL_ADVANCES) return "SpeciesSkillAdvancements5e";

  if (!final) return null;

  // A Species offering fewer Skills than Advances cannot place them all; take what there is rather than dead-end
  if (values.length < SPECIES_SKILL_ADVANCES) return null;

  if (advanced < SPECIES_SKILL_ADVANCES) return "SpeciesSkillIncomplete5e";

  return null;
}
