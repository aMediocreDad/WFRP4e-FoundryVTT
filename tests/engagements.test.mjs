/**
 * Rules-based expectations (5e pp.163,166–167,360), plus document/socket adapters.
 * These are not a substitute for testing the Foundry movement backend and HUD.
 */
import { install, suite } from "./stubs.mjs";
import { engagementSides, hasEscapeRoute } from "../src/system/engagement-geometry.js";

const homebrew = { fifthEdEngagements: true, fifthEdSize: true, fifthEdMomentum: true };
install({ homebrew, lang: { "NAME.Melee": "Melee" } });
const Engagements = (await import("../src/system/engagements.js")).default;
const FifthEdition = (await import("../src/system/fifth-edition.js")).default;
const { check, report } = suite("Engagements");

const edges = (...pairs) => pairs.map(([a, b]) => ({ a, b }));
check("only connected combatants count", engagementSides("a", edges(["a", "b"], ["b", "c"], ["x", "y"])),
  { allies: ["a", "c"], enemies: ["b"] });
check("two attackers are on the same side", engagementSides("b", edges(["a", "b"], ["c", "b"])),
  { allies: ["b"], enemies: ["a", "c"] });
check("three-way fight defers to GM", engagementSides("a", edges(["a", "b"], ["b", "c"], ["c", "a"])), null);
check("an even cycle still has two sides", engagementSides("a", edges(["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"])),
  { allies: ["a", "c"], enemies: ["b", "d"] });

const square = (x, y, width = 100, height = width) => ({ x, y, width, height });
const mover = square(400, 400), bounds = square(0, 0, 1000);
const escape = (enemies, wallBlocked = () => false, moving = mover, area = bounds) =>
  hasEscapeRoute({ mover: moving, enemies, bounds: area, gridSize: 100, wallBlocked });
check("one enemy in the open leaves an escape", escape([square(500, 400)]), true);
check("three enemies on one side are not Surrounded", escape([square(500, 300), square(500, 400), square(500, 500)]), true);
check("four cardinal neighbours enclose the footprint", escape([square(300, 400), square(500, 400), square(400, 300), square(400, 500)]), false);
check("no enemy is not an engagement, even in a closed room", escape([], () => true), true);
// Two enemies, one to each side in a corridor. The north/south walls prohibit
// crossing, not movement along them, matching Foundry's movement collision API.
const corridorWalls = (a, b) => [400, 500].some(y => (a.y < y && b.y >= y) || (a.y > y && b.y <= y));
check("two foes can surround in a narrow corridor", escape([square(300, 400), square(500, 400)], corridorWalls), false);
check("one end of the corridor open permits escape", escape([square(300, 400)], corridorWalls), true);
check("opening walls restores escape", escape([square(300, 400), square(500, 400)]), true);
check("a large footprint cannot squeeze through a small opening",
  escape([square(550, 300, 100, 150), square(550, 550)], () => false,
    square(400, 400, 150), square(400, 300, 400, 350)), false);
check("a smaller footprint can use the same opening",
  escape([square(550, 300, 100, 150), square(550, 550)], () => false,
    square(400, 450), square(400, 300, 400, 350)), true);
check("initially overlapping equal tokens may separate", escape([square(400, 400)]), true);
check("the scene edge is not an escape through off-map space",
  escape([square(100, 0), square(0, 100)], () => false, square(0, 0)), false);
check("unknown grid spacing is not an invented verdict",
  hasEscapeRoute({ mover, enemies: [square(500, 400)], bounds, gridSize: 0, wallBlocked: () => false }), null);

class Collection extends Map {
  constructor(items = []) { super(items.map(i => [i.id, i])); }
  [Symbol.iterator]() { return this.values(); }
  get contents() { return [...this.values()]; }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  some(fn) { return this.contents.some(fn); }
  map(fn) { return this.contents.map(fn); }
}
const flags = object => Object.assign(object, {
  flags: {},
  getFlag(namespace, key) { return this.flags[key]; },
  async setFlag(namespace, key, value) { this.flags[key] = structuredClone(value); },
  async unsetFlag(namespace, key) { delete this.flags[key]; }
});
function actor(id, size = "avg") {
  const actor = {
    id, uuid: `Actor.${id}`, name: id, details: { size: { value: size } },
    statuses: new Set(), effects: [], status: { advantage: { value: 0 } },
    characteristics: { ws: { value: 30 } }, itemTypes: { skill: [], talent: [] },
    hasCondition(status) { return this.effects.find(e => e.status === status); },
    async addCondition(status, count, data = {}) {
      const effect = flags({ status, async delete() {
        actor.effects.splice(actor.effects.indexOf(this), 1);
        actor.statuses.delete(status);
      } });
      effect.flags.engagementManaged = data["flags.wfrp4e.engagementManaged"] || false;
      this.effects.push(effect); this.statuses.add(status);
      if (status === "broken") this.broken = (this.broken || 0) + count;
    },
    async setAdvantage(value) { this.status.advantage.value = value; },
    speakerData(token) { return { actor: this.id, scene: token?.parent.id, token: token?.id }; }
  };
  return actor;
}
function scene(id = "scene") {
  return flags({
    id, grid: { type: 1, size: 100 }, tokens: new Collection(),
    async updateEmbeddedDocuments(type, updates) {
      for (const data of updates) this.tokens.get(data._id).flags.engagementState = data["flags.wfrp4e.engagementState"];
    }
  });
}
function token(scene, id, a = actor(id), x = 400, y = 400) {
  const t = flags({ id, uuid: `Scene.${scene.id}.Token.${id}`, parent: scene, actor: a,
    x, y, width: 1, height: 1, elevation: 0 });
  scene.tokens.set(id, t);
  return t;
}
const gm = { id: "gm", isGM: true };
let warnings = [];
globalThis.ui = { notifications: { warn: key => warnings.push(key), error: key => warnings.push(key) } };
globalThis.CONFIG = { Canvas: { polygonBackends: { move: { testCollision: () => false } } } };
function world() {
  const s = scene();
  game.user = gm; game.users = { activeGM: gm };
  game.scenes = new Collection([s]); game.combats = new Collection(); game.actors = new Collection();
  globalThis.canvas = { ready: true, scene: s, dimensions: { sceneRect: bounds } };
  warnings = [];
  return s;
}
const request = (s, action, a, b) => Engagements.request(action, { sceneId: s.id, a, b });
const meleeTest = a => ({
  actor: a.actor, item: { attackType: "melee" }, options: {}, result: { outcome: "failure" },
  context: { speaker: a.actor.speakerData(a), chatOptions: { speaker: a.actor.speakerData(a) } }
});

let s = world(), a = token(s, "a"), b = token(s, "b", actor("b"), 500), c = token(s, "c", actor("c"), 600);
check("proximity alone never engages", Engagements.opponents(a).length, 0);
await Engagements.attack(meleeTest(a), b);
check("a failed melee attack engages both tokens", [Engagements.state(a).engaged, Engagements.state(b).engaged], [true, true]);
check("engagement outside initiative has no fabricated round", Engagements.edges(s)[0].round, null);
check("effects mirror engagement", [a.actor.statuses.has("engaged"), b.actor.statuses.has("engaged")], [true, true]);
await Engagements.attack({ ...meleeTest(c), item: { attackType: "ranged" } }, b);
check("ranged attacks do not engage", Engagements.opponents(c).length, 0);
for (const flag of ["reroll", "edited", "defending"]) {
  const test = meleeTest(c); test.context[flag] = true;
  await Engagements.attack(test, b);
  check(`${flag} does not count as another attack`, Engagements.opponents(c).length, 0);
}
await Engagements.attack({ ...meleeTest(c), options: { disengage: true } }, b);
check("a Disengage contest does not renew engagement", Engagements.opponents(c).length, 0);
check("declared second attack previews outnumbering", Engagements.attackBonus(c.actor, b), 1);
check("preview does not persist a cancelled attack", Engagements.opponents(c).length, 0);
await Engagements.attack(meleeTest(c), b);
check("outnumbering uses connected combatants", Engagements.counts(b), { ours: 1, theirs: 2, outnumbered: true });
check("outnumbering status projects to actor", b.actor.statuses.has("outnumbered"), true);
c.x = 900;
await request(s, "refresh");
check("dragging away does not grant a free Disengage", Engagements.state(c).engaged, true);
c.x = 600;
b.actor.details.size.value = "lrg";
await request(s, "refresh");
check("Large defender needs four attackers", Engagements.state(b).outnumbered, false);
homebrew.fifthEdSize = false;
check("Size weighting is independently optional", Engagements.counts(b).outnumbered, true);
homebrew.fifthEdSize = true;
b.actor.details.size.value = "avg";
const ally = token(s, "ally", actor("ally"), 500, 500);
await request(s, "attack", "a", "ally");
check("engaged allies contribute to the defending side", Engagements.counts(b), { ours: 2, theirs: 2, outnumbered: false });
await request(s, "leave", "ally");
check("leaving removes only that token's relationships", Engagements.edges(s).length, 2);
await request(s, "leave", "a");
check("remaining opponent stays engaged", [Engagements.state(a).engaged, Engagements.state(b).engaged], [false, true]);
await request(s, "leave", "c");
check("last exit clears both ends and outnumbering", [a, b, c].map(t => [...t.actor.statuses]), [[], [], []]);

// Serialization must read the fresh scene flag inside the queue, not before it.
await Promise.all([request(s, "attack", "a", "b"), request(s, "attack", "c", "b")]);
check("concurrent attacks do not overwrite each other", Engagements.edges(s).length, 2);
await request(s, "attack", "b", "a");
check("reverse attack refreshes one undirected edge", Engagements.edges(s).length, 2);
const combat = { id: "combat", scene: s, round: 1, active: true, started: true, combatants: new Collection() };
game.combats.set(combat.id, combat);
await request(s, "refresh");
check("pre-initiative engagements join combat clock", Engagements.edges(s).map(e => e.round), [1, 1]);
combat.round = 2;
await request(s, "refresh");
check("start of next round is not a full quiet round", Engagements.edges(s).length, 2);
await request(s, "attack", "b", "a");
combat.round = 3;
await request(s, "refresh");
check("quiet pair expires; either-direction attack keeps other pair", Engagements.edges(s).map(e => [e.a, e.b]), [["a", "b"]]);
combat.round = 4;
await request(s, "refresh");
check("one complete quiet round expires final pair", Engagements.edges(s).length, 0);
await request(s, "attack", "a", "b");
await Engagements.request("endCombat", { sceneId: s.id, combatId: combat.id });
check("combat deletion clears its engagements", Engagements.edges(s).length, 0);

await request(s, "attack", "a", "b");
await b.setFlag("wfrp4e", "engagementOverrides", { outnumbered: true, surrounded: true });
await request(s, "refresh");
check("GM can force both derived states", [Engagements.state(b).outnumbered, Engagements.state(b).surrounded], [true, true]);
check("Surrounded replaces rather than stacks +1 SL", Engagements.attackBonus(a.actor, b), 2);
await b.setFlag("wfrp4e", "engagementOverrides", { outnumbered: false, surrounded: false });
await request(s, "attack", "c", "b");
check("explicit false overrides automatic outnumbering", Engagements.state(b).outnumbered, false);
await b.setFlag("wfrp4e", "engagementOverrides", { outnumbered: null, surrounded: null });
await request(s, "refresh");
check("Automatic resumes calculation", Engagements.state(b).outnumbered, true);
canvas.ready = false;
await request(s, "refresh");
check("unavailable canvas is unknown, not Surrounded", Engagements.state(b).surrounded, null);
canvas.ready = true;
const otherScene = scene("other");
game.scenes.set(otherScene.id, otherScene);
canvas.scene = otherScene;
check("never use another scene's walls", Engagements.surrounded(b, [a]), null);
canvas.scene = s;
s.grid.type = 2;
check("hex geometry defers to GM", Engagements.surrounded(b, [a]), null);
s.grid.type = 0;
check("gridless geometry is supported", Engagements.surrounded(b, [a]), false);
s.grid.type = 1;
a.elevation = 10;
check("mixed elevation defers to GM", Engagements.surrounded(b, [a]), null);
a.elevation = 0;

// Token identities, not Actor ids, count combatants.
s = world();
const shared = actor("shared");
a = token(s, "a", shared, 300); c = token(s, "c", shared, 500); b = token(s, "b");
check("ambiguous linked actor does not select an arbitrary token", Engagements.tokenFor(shared), null);
await request(s, "attack", "a", "b");
await request(s, "attack", "c", "b");
check("linked copies count as two combatants", Engagements.counts(b).theirs, 2);
await request(s, "leave", "a");
check("one linked copy leaving preserves shared effect", shared.statuses.has("engaged"), true);
check("but the free copy is not itself Engaged", Engagements.isEngaged(shared, a), false);
check("the other copy still is Engaged", Engagements.isEngaged(shared, c), true);
await request(s, "leave", "c");
check("last linked copy leaving clears effect", shared.statuses.has("engaged"), false);
await shared.addCondition("engaged");
await request(s, "attack", "a", "b");
await request(s, "leave", "a");
check("manual condition is not silently deleted", shared.statuses.has("engaged"), true);
await shared.hasCondition("engaged").delete();
await request(s, "attack", "a", "b");
game.actors.set(shared.id, shared);
s.tokens.delete("a");
await request(s, "refresh");
check("deleted token prunes relationships", Engagements.edges(s).length, 0);
check("deleted linked token cleans world actor projection", shared.statuses.has("engaged"), false);
const removedScene = scene("removed");
game.scenes.set(removedScene.id, removedScene);
token(removedScene, "linked", shared); token(removedScene, "foe");
await request(removedScene, "attack", "linked", "foe");
game.scenes.delete(removedScene.id);
await Engagements.execute({ action: "cleanup" });
check("deleted scene also cleans linked world actor effects", shared.statuses.has("engaged"), false);
await request(s, "attack", "c", "b");
b.actor.statuses.add("unconscious");
await request(s, "refresh");
check("incapacitated combatants leave the active graph", Engagements.edges(s).length, 0);
b.actor.statuses.delete("unconscious");
await request(s, "attack", "c", "b");
game.combats.set("defeat", { id: "defeat", scene: s, combatants: new Collection([{ id: "cb", tokenId: "b", defeated: true }]) });
await request(s, "refresh");
check("defeated combatant also leaves graph", Engagements.edges(s).length, 0);
game.combats.clear();

// Flee consumes the tracked set, never the unrelated selected targets.
const unrelated = token(s, "unrelated", actor("unrelated"), 800, 800);
game.user.targets = new Set([unrelated]);
await request(s, "attack", "c", "b");
foundry.applications = { api: { DialogV2: {
  confirm: async () => true, wait: async () => ({ route: "dodge", outnumbered: false })
} } };
globalThis.ChatMessage = { create: async () => {} };
game.wfrp4e.utility.chatDataSetup = text => text;
await FifthEdition.flee(shared, c);
check("Flee pays tracked opponent, not selected stranger",
  [b.actor.status.advantage.value, unrelated.actor.status.advantage.value, shared.broken], [1, 0, 1]);
check("Flee clears relationships", Engagements.edges(s).length, 0);
await request(s, "attack", "c", "b");
await c.setFlag("wfrp4e", "engagementOverrides", { surrounded: true });
await FifthEdition.disengage(shared, c);
check("Surrounded blocks Disengage before a roll", warnings.at(-1), "FIFTHED.EngagementCannotDisengage");
await c.setFlag("wfrp4e", "engagementOverrides", { surrounded: false });
b.actor.itemTypes.skill = [{ type: "skill", name: "Melee (Basic)", total: { value: 70 } }];
unrelated.actor.characteristics.ws.value = 80;
check("highest Melee includes WS and prepared skill totals", Engagements.strongest([b, unrelated]).id, unrelated.id);
unrelated.actor.characteristics.ws.value = 40;
check("trained Melee can beat higher base WS", Engagements.strongest([b, unrelated]).id, b.id);
let rolled;
shared.setupSkill = async (skill, context) => {
  rolled = { context: {}, options: context, async roll() {} };
  return rolled;
};
await FifthEdition.disengage(shared, c);
check("Disengage targets actual foe, not user selection", rolled.context.targets, [b.actor.speakerData(b)]);
check("Disengage preserves exact linked token identity", rolled.options.engagementToken, c.uuid);

game.users.activeGM = null;
check("no GM returns an explicit refusal", await request(s, "leave", "c"), false);
check("no GM does not erase state", Engagements.edges(s).length, 1);
game.users.activeGM = gm;
game.user = { id: "player", isGM: false };
let socketPayload;
globalThis.SocketHandlers = { call: async (name, payload, recipient) => { socketPayload = { name, payload, recipient }; return true; } };
await request(s, "leave", "c");
check("player sends mutation to GM", socketPayload, { name: "engagement", payload: { action: "leave", sceneId: s.id, a: "c", b: undefined }, recipient: "GM" });
check("player cannot execute authority mutation locally", await Engagements.execute({ action: "leave", sceneId: s.id, a: "c" }), undefined);
check("non-authority did not write scene", Engagements.edges(s).length, 1);
game.user = gm;
homebrew.fifthEdEngagements = false;
await request(s, "attack", "c", "unrelated");
check("toggle off makes no new relationships", Engagements.edges(s).length, 1);
await b.actor.addCondition("prone");
await Engagements.deactivate();
check("disable removes managed effects only", [...b.actor.statuses], ["prone"]);
check("disable removes persisted graph", Engagements.edges(s).length, 0);
check("disable removes derived token state", Engagements.state(c), {});
check("toggle off yields no automated attack bonus", Engagements.attackBonus(shared, b), 0);

// Exercise the real shared roll-dialog path, not a copy of its arithmetic.
globalThis.WarhammerRollDialogV2 = class {};
const RollDialog = (await import("../src/apps/roll-dialog/roll-dialog.js")).default;
homebrew.fifthEdEngagements = true;
s = world(); a = token(s, "a", actor("a"), 300); b = token(s, "b"); c = token(s, "c", actor("c"), 500);
await request(s, "attack", "c", "b");
async function dialogBonus(item, { defending = false, disengage = false, targets = [b] } = {}) {
  const dialog = Object.assign(Object.create(RollDialog.prototype), {
    actor: a.actor, item, data: { targets }, context: { disengage },
    fields: { slBonus: 0 }, tooltips: { add: () => {} },
    _computeAdvantage() {}, _computeFortuneAdvantage() {}, _computeManualModifiers() {}
  });
  a.actor.attacker = defending ? {} : null;
  await dialog.computeFields();
  return dialog.fields.slBonus;
}
check("weapon attack gets one bonus in real dialog", await dialogBonus({ attackType: "melee" }), 1);
check("trait attack follows the same rule", await dialogBonus({ type: "trait", attackType: "melee" }), 1);
check("raw Melee Skill attack follows the same rule", await dialogBonus({ type: "skill", name: "Melee (Basic)" }), 1);
check("a parry never gets the attack bonus", await dialogBonus({ attackType: "melee" }, { defending: true }), 0);
check("ranged attacks do not get the melee bonus", await dialogBonus({ attackType: "ranged" }), 0);
check("Disengage contests do not get the bonus", await dialogBonus({ type: "skill", name: "Melee (Basic)" }, { disengage: true }), 0);
check("untargeted melee roll has no bonus", await dialogBonus({ attackType: "melee" }, { targets: [] }), 0);
await b.setFlag("wfrp4e", "engagementOverrides", { surrounded: true });
check("real dialog uses +2 instead of +1 when Surrounded", await dialogBonus({ attackType: "melee" }), 2);
homebrew.fifthEdEngagements = false;
check("disabled automation leaves dialog unchanged", await dialogBonus({ attackType: "melee" }), 0);
report();
