import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { install } from "./stubs.mjs";
import FifthEdition from "../src/system/fifth-edition.js";
import { formatSLExplanation, recordSLAdjustment, resolveOpposedWinner } from "../src/system/rolls/breakdown.js";

const source = readFileSync(new URL("../src/system/rolls/test-wfrp4e.js", import.meta.url), "utf8");
const lang = JSON.parse(readFileSync(new URL("../static/lang/en.json", import.meta.url), "utf8"));

// Execute the production evaluator, without loading Foundry's document/audio graph.
// Only its unused imports and base class are substituted; no method bodies are copied.
function setup({ homebrew = {}, world = {} } = {}) {
  install({
    homebrew: { fifthEdAdvantage: true, fifthEdOutcome: true, ...homebrew },
    world: { automaticSuccess: 5, automaticFailure: 96, SLMethod: "default", ...world },
    config: { difficultyLabels: { challenging: "Challenging" } },
    lang
  });
  Number.isNumeric = value => value !== null && value !== "" && value !== undefined && Number.isFinite(Number(value));
  foundry.applications = { handlebars: { numberFormat: value => String(value) } };
  const context = vm.createContext({
    game, foundry, Number, console, FifthEdition, formatSLExplanation, recordSLAdjustment,
    WarhammerTestBase: class {},
  });
  return vm.runInContext(source.replace(/^import .*;?$/gm, "").replace("export default class", "class") + "\nTestWFRP;", context);
}

function makeTest(Implementation, overrides = {}) {
  const instance = Object.create(Implementation.prototype);
  instance.data = {
    preData: {
      roll: 42, target: 55, slBonus: 0, successBonus: 0, testModifier: 0, testDifficulty: 0,
      postOpposedModifiers: { SL: 0, target: 0 }, options: {},
      reversal: { allowed: false, if: "better" }, ...overrides
    },
    result: { roll: overrides.roll ?? 42, other: [] },
    context: { breakdown: { characteristic: 55, difficulty: "challenging", damage: { other: [] } } }
  };
  return instance;
}

test("ordinary rolls explain base and final SL even without modifiers", async () => {
  const instance = makeTest(setup());
  await instance.computeResult();
  const html = instance.formatBreakdown().test;
  assert.equal(instance.result.SL, "+1");
  assert.match(html, /Final SL/);
  assert.match(html, /Dice \(original → used\)/);
  assert.equal((html.match(/<p>/g) || []).length, (html.match(/<\/p>/g) || []).length);
});

test("Advantage cancellation and extra SL are captured by the evaluator", async () => {
  const Implementation = setup();
  const cancelled = makeTest(Implementation, { advSources: 2, disSources: 2 });
  await cancelled.computeResult();
  assert.match(cancelled.formatBreakdown().test, /Advantage and Disadvantage cancel/);
  const extra = makeTest(Implementation, { advSources: 3 });
  await extra.computeResult();
  assert.equal(extra.result.slCalculation.advantage.extraSL, 2);
  assert.equal(extra.result.slCalculation.originalRoll, 42);
  assert.equal(extra.result.slCalculation.roll, 24);
  assert.equal(extra.result.SL, "+5");
});

test("Critical and Fate overrides name the decision that changed the result", async () => {
  const Implementation = setup({ homebrew: { fifthEdFate: true, fifthEdCriticalSL: true }, world: { criticalsFumblesOnAllTests: true } });
  const critical = makeTest(Implementation, { roll: 44 });
  await critical.computeResult();
  assert.ok(critical.result.slCalculation.adjustments.some(a => a.reason === "BREAKDOWN.CriticalBound"));
  assert.equal(critical.result.SL, "+5");
  const fate = makeTest(Implementation, { roll: 76, useFate: true });
  await fate.computeResult();
  assert.ok(fate.result.slCalculation.adjustments.some(a => a.reason === "BREAKDOWN.Fate"));
  assert.equal(fate.result.SL, "+0");
});

test("success bonuses reflect the branch that applied them, not final outcome", async () => {
  const instance = makeTest(setup(), { roll: 76, slBonus: 5, successBonus: 3 });
  await instance.computeResult();
  assert.equal(instance.succeeded, true);
  assert.equal(instance.result.slCalculation.successBonus, 0);
});

test("re-evaluation replaces the calculation and does not accumulate opposed SL", async () => {
  const instance = makeTest(setup(), { postOpposedModifiers: { SL: 2, target: 0 } });
  await instance.computeResult();
  const first = JSON.stringify(instance.result.slCalculation);
  await instance.computeResult();
  assert.equal(JSON.stringify(instance.result.slCalculation), first);
  assert.equal(instance.result.slCalculation.bonus, 2);
  assert.equal(instance.result.SL, "+3");
});

test("zero override, fast SL and old saved cards remain readable", async () => {
  const Implementation = setup({ world: { SLMethod: "fast" } });
  const instance = makeTest(Implementation, { SL: 0 });
  await instance.computeResult();
  assert.equal(instance.result.slCalculation.override, 0);
  assert.equal(instance.result.slCalculation.base, 4);
  assert.match(instance.formatBreakdown().test, /Explicit SL override/);
  delete instance.result.slCalculation;
  assert.equal(typeof instance.formatBreakdown().test, "string");
});

test("formatter escapes values and ignores absent legacy snapshots", () => {
  setup();
  assert.equal(formatSLExplanation(null, 0), "");
  const calculation = { base: 0, adjustments: [] };
  recordSLAdjustment(calculation, "BREAKDOWN.Fate", 0, 0);
  assert.equal(calculation.adjustments.length, 0);
  assert.doesNotMatch(formatSLExplanation(calculation, "<img onerror=x>"), /<img/);
});

test("opposed explanation preserves every branch of the existing winner rule", () => {
  for (const attackerSL of [-2, 0, 2, NaN]) {
    for (const defenderSL of [-2, 0, 2, NaN]) {
      for (const initiatorWinsTies of [false, true]) {
        for (const attackerTarget of [40, 50, 60]) {
          for (const unopposedSuccess of [false, true]) {
            const expected = attackerSL > defenderSL || (attackerSL === defenderSL &&
              (initiatorWinsTies || attackerTarget > 50 || unopposedSuccess)) ? "attacker" : "defender";
            const decision = resolveOpposedWinner(attackerSL, defenderSL, { initiatorWinsTies, attackerTarget, defenderTarget: 50, unopposedSuccess });
            assert.equal(decision.winner, expected);
            assert.ok(lang[decision.reason]);
          }
        }
      }
    }
  }
  assert.equal(resolveOpposedWinner(1, 1, { initiatorWinsTies: true }).reason, "BREAKDOWN.InitiatorTie");
});

test("chat display respects ownership, hidden Test data, and GM access", async () => {
  for (const [isGM, owner, hideTestData, visible] of [
    [false, false, false, false], [false, true, false, true],
    [false, true, true, false], [true, false, true, true]
  ]) {
    setup({ world: { hideTestData } });
    game.user = { isGM, character: { id: "pc" } };
    game.actors = new Map();
    if (owner) game.actors.set("roller", { isOwner: true, id: "roller" });
    const callbacks = {};
    const context = vm.createContext({ game, Hooks: { on: (name, callback) => { callbacks[name] = callback; } } });
    const chatSource = readFileSync(new URL("../src/hooks/chat.js", import.meta.url), "utf8");
    vm.runInContext(chatSource.replace(/^import .*;?$/gm, "").replace("export default function()", "function register()") + "\nregister();", context);
    const removed = [];
    const html = {
      classList: { contains: () => false },
      querySelectorAll: () => [],
      querySelector: selector => selector === ".chat-card" ? { dataset: { hide: "true" } } : [".test-breakdown", ".test-title"].includes(selector) ? {
        remove: () => removed.push(selector),
        removeAttribute: () => removed.push(selector)
      } : null
    };
    await callbacks.renderChatMessageHTML({ speaker: { actor: "roller" }, system: {} }, html);
    assert.deepEqual(removed, visible ? [] : [".test-breakdown", ".test-title"]);
  }
});

test("opposed cards record defender victories and replace comparison notes on reevaluation", async () => {
  const Implementation = setup({ homebrew: { fifthEdOpposedTies: true, fifthEdSize: true, fifthEdFate: true } });
  const actor = { runScripts: () => [] };
  const context = vm.createContext({
    game, foundry, FifthEdition, resolveOpposedWinner, Number, console,
    WFRP_Audio: { PlayContextAudio: () => {} },
    warhammer: { utility: { log: () => {} } },
    Hooks: { call: () => {} },
    ui: { notifications: { error: message => { throw new Error(message); } } }
  });
  const opposedSource = readFileSync(new URL("../src/system/opposed-test.js", import.meta.url), "utf8");
  const OpposedTest = vm.runInContext(opposedSource.replace(/^import .*;?$/gm, "").replace("export default class", "class") + "\nOpposedTest;", context);
  const side = SL => ({ actor, data: {}, result: { SL }, context: {}, preData: {}, target: 50 });
  const opposed = new OpposedTest(side(1), side(2));
  await opposed.evaluate();
  assert.equal(opposed.result.winner, "defender");
  assert.equal(opposed.result.resolution.reason, "BREAKDOWN.HigherSL");
  assert.equal(opposed.result.breakdown, undefined); // No damage is required to explain a result.
  opposed.defenderTest.result.SL = 1;
  await opposed.evaluate();
  assert.equal(opposed.result.winner, "attacker");
  assert.equal(opposed.result.resolution.reason, "BREAKDOWN.InitiatorTie");
  assert.equal(opposed.result.resolution.notes.length, 0);

  // The recovered feature must follow the newer audit fix: Size first, Fate last.
  const smaller = side(0);
  const larger = side(0);
  smaller.actor = { ...actor, name: "Smaller", details: { size: { value: "avg" } } };
  larger.actor = { ...actor, name: "Larger", details: { size: { value: "enor" } } };
  smaller.preData = { item: "s", useFate: true };
  larger.preData = { item: "s" };
  const overridden = new OpposedTest(smaller, larger);
  await overridden.evaluate();
  assert.equal(overridden.result.winner, "attacker");
  assert.equal(overridden.result.resolution.originalAttackerSL, 0);
  assert.equal(overridden.result.resolution.attackerSL, 2);
  assert.equal(overridden.result.resolution.defenderSL, 1);
  assert.deepEqual(Array.from(overridden.result.resolution.notes), ["FIFTHED.SizeOverpower", "FIFTHED.FateOpposed"]);

  // Exercise the real post-opposed recomputation path, including rendering.
  const attacker = makeTest(Implementation);
  const defender = makeTest(Implementation);
  let modifier = 1;
  const modifyingActor = {
    runScripts: (trigger, { opposedTest } = {}) => {
      if (trigger === "preOpposedAttacker") {
        opposedTest.result.modifiers.attacker.SL = modifier;
        opposedTest.result.modifiers.message = ["Attacker modifier"];
      }
      return [];
    }
  };
  for (const participant of [attacker, defender]) {
    Object.defineProperty(participant, "actor", { value: modifyingActor });
    participant.renderRollCard = async () => participant.formatBreakdown();
    await participant.computeResult();
  }
  const modified = new OpposedTest(attacker, defender);
  await modified.evaluate();
  modifier = 2;
  await modified.evaluate();
  assert.equal(attacker.result.slCalculation.bonus, 2);
  assert.equal(attacker.context.breakdown.opposedModifiers, "Attacker modifier");
  assert.equal(defender.context.breakdown.opposedModifiers, undefined);
  assert.equal((attacker.formatBreakdown().test.match(/Attacker modifier/g) || []).length, 1);
});

test("opposed SL details require GM access or ownership of both participants", async () => {
  for (const [isGM, ownAttacker, ownDefender, visible] of [
    [false, true, false, false], [false, false, true, false],
    [false, true, true, true], [true, false, false, true]
  ]) {
    setup();
    game.user = { isGM };
    game.wfrp4e.utility.getSpeaker = speaker => ({ isOwner: speaker.owned });
    foundry.data = { fields: {} };
    const context = vm.createContext({
      game, foundry, WarhammerMessageModel: class {},
      warhammer: { utility: { replacePopoutTokens: () => {} } }
    });
    const messageSource = readFileSync(new URL("../src/model/message/opposed-result.js", import.meta.url), "utf8");
    const Message = vm.runInContext(messageSource.replace(/^import .*;?$/gm, "").replace("export class", "class") + "\nOpposedTestMessage;", context);
    const message = new Message();
    message.opposedTestData = {
      attackerTestData: { context: { speaker: { owned: ownAttacker } } },
      defenderTestData: { context: { speaker: { owned: ownDefender } } }
    };
    const removed = [];
    await message.onRender({ querySelector: selector => ({ remove: () => removed.push(selector) }) });
    assert.equal(!removed.includes(".opposed-resolution"), visible);
  }
});
