/**
 * FifthEdition.redirectMetacurrency, which rewrites a pending Actor update so changes aimed at the attributes 5e
 * deleted land on their replacements.
 *
 * p.364: "If an effect refers to Resilience, use Fate instead. If it refers to Resolve, use Fortune instead."
 * The redirect works on the delta rather than the value, because an effect that spends one Resilience should spend
 * one Fate, not set Fate to whatever Resilience happened to be.
 *
 * Run: node tests/metacurrency.test.mjs
 */
import { install, suite } from "./stubs.mjs";

install({ homebrew: { fifthEdMetacurrency: true } });

const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const { check, report } = suite("redirectMetacurrency");

/**
 * @param {object} update  what the effect wants to write, under system.status
 * @param {object} current the actor's present system.status
 * @returns {object} the rewritten update
 */
const redirect = (update, current) => {
  let data = { system: { status: structuredClone(update) } };
  FifthEdition.redirectMetacurrency(data, current);
  return data.system.status;
};

check("spending Resilience spends Fate",
  redirect({ resilience: { value: 1 } }, { resilience: { value: 2 }, fate: { value: 3 } }),
  { fate: { value: 2 } });

check("spending Resolve spends Fortune",
  redirect({ resolve: { value: 0 } }, { resolve: { value: 2 }, fortune: { value: 4 } }),
  { fortune: { value: 2 } });

check("gaining Resolve gains Fortune",
  redirect({ resolve: { value: 3 } }, { resolve: { value: 2 }, fortune: { value: 1 } }),
  { fortune: { value: 2 } });

check("a write with no delta leaves the target alone",
  redirect({ resilience: { value: 2 } }, { resilience: { value: 2 }, fate: { value: 3 } }),
  {});

check("the target cannot be driven below zero",
  redirect({ resilience: { value: 0 } }, { resilience: { value: 3 }, fate: { value: 1 } }),
  { fate: { value: 0 } });

check("both attributes redirect independently",
  redirect({ resilience: { value: 1 }, resolve: { value: 1 } },
    { resilience: { value: 2 }, resolve: { value: 2 }, fate: { value: 5 }, fortune: { value: 5 } }),
  { fate: { value: 4 }, fortune: { value: 4 } });

// An effect touching both the old and the new attribute in one update: the delta applies on top of the new value
check("a delta stacks onto a value the update already sets",
  redirect({ resilience: { value: 1 }, fate: { value: 9 } }, { resilience: { value: 2 }, fate: { value: 3 } }),
  { fate: { value: 8 } });

check("an unrelated update passes through untouched",
  redirect({ wounds: { value: 4 } }, { fate: { value: 3 } }),
  { wounds: { value: 4 } });

report();
