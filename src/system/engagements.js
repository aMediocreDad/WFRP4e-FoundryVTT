import FifthEdition from "./fifth-edition.js";
import { engagementSides, hasEscapeRoute } from "./engagement-geometry.js";

/**
 * 5e pp.163,166–167: scene-local token relationships are authoritative; Actor
 * effects are only a projection for the existing sheets/condition scripts.
 * All writes are serialized on the active GM, including player exit requests.
 */
export default class Engagements {
  static queue = Promise.resolve();
  static statuses = ["engaged", "outnumbered", "surrounded"];

  static get enabled() { return FifthEdition.enabled("Engagements"); }
  static get authority() { return !!game.user?.isGM && game.user.id === game.users?.activeGM?.id; }
  static edges(scene) { return scene?.getFlag("wfrp4e", "engagements") || []; }

  static tokenFor(actor, token) {
    if (token?.document) token = token.document;
    if (token?.parent?.tokens) return token;
    if (actor?.token) return actor.token;
    const tokens = globalThis.canvas?.scene?.tokens?.filter(t => t.actor?.uuid === actor?.uuid) || [];
    const controlled = tokens.filter(t => t.object?.controlled);
    // Never pick an arbitrary copy of a linked Actor.
    return controlled.length === 1 ? controlled[0] : tokens.length === 1 ? tokens[0] : null;
  }

  static opponents(token) {
    return this.edges(token?.parent).flatMap(e => e.a === token.id ? [e.b] : e.b === token.id ? [e.a] : [])
      .map(id => token.parent.tokens.get(id)).filter(t => this.participates(t));
  }

  static participates(token) {
    return !!token?.actor && !token.actor.statuses?.has("dead") && !token.actor.statuses?.has("unconscious")
      && !game.combats?.some(c => c.scene?.id === token.parent.id && c.combatants.some(x => x.tokenId === token.id && x.defeated));
  }

  static state(token) { return token?.getFlag("wfrp4e", "engagementState") || {}; }

  static isEngaged(actor, token) {
    token = this.tokenFor(actor, token);
    if (!this.enabled || !token) return actor?.statuses?.has("engaged");
    const manual = actor.hasCondition("engaged");
    return this.opponents(token).length > 0 || !!(manual && !manual.getFlag("wfrp4e", "engagementManaged"));
  }

  /** Preview the declared attack too: the new attacker counts in this attack's modifiers. */
  static attackBonus(actor, target) {
    if (!this.enabled) return 0;
    target = target?.document || target;
    const attacker = this.tokenFor(actor);
    if (!attacker || !target?.parent || attacker.parent.id !== target.parent.id || attacker.id === target.id) return 0;
    const edges = [...this.edges(target.parent)];
    if (!edges.some(e => (e.a === attacker.id && e.b === target.id) || (e.b === attacker.id && e.a === target.id))) {
      edges.push({ a: attacker.id, b: target.id });
    }
    const overrides = target.getFlag("wfrp4e", "engagementOverrides") || {};
    const opponents = edges.flatMap(e => e.a === target.id ? [e.b] : e.b === target.id ? [e.a] : [])
      .map(id => target.parent.tokens.get(id)).filter(t => this.participates(t));
    const surrounded = overrides.surrounded ?? this.surrounded(target, opponents);
    const outnumbered = overrides.outnumbered ?? this.counts(target, edges).outnumbered;
    // p.166's table is +1 SL OR +2 SL, not cumulative, and only for attacks.
    return surrounded ? 2 : outnumbered ? 1 : 0;
  }

  static counts(token, edges = this.edges(token?.parent)) {
    const sides = engagementSides(token.id, edges);
    if (!sides) return { ours: 0, theirs: 0, outnumbered: null };
    const ours = sides.allies.reduce((sum, id) => sum + FifthEdition.sizeCount(token.parent.tokens.get(id)?.actor), 0);
    const theirs = sides.enemies.length;
    return { ours, theirs, outnumbered: theirs >= 2 * ours };
  }

  static surrounded(token, opponents) {
    if (!opponents.length) return false;
    const scene = token.parent, canvas = globalThis.canvas;
    // Foundry's movement backend belongs to the viewed canvas, never another scene.
    if (!canvas?.ready || canvas.scene?.id !== scene.id) return null;
    // Elevation, flight and hex footprints need table adjudication for now.
    if (scene.grid.type > 1 || opponents.some(t => t.elevation !== token.elevation)) return null;
    const backend = CONFIG.Canvas?.polygonBackends?.move;
    if (!backend?.testCollision) return null;
    const gridSize = scene.grid.size;
    const rectangle = t => ({ x: t.x, y: t.y, width: t.width * gridSize, height: t.height * gridSize });
    const escape = hasEscapeRoute({
      mover: rectangle(token), enemies: opponents.map(rectangle),
      bounds: canvas.dimensions.sceneRect, gridSize,
      wallBlocked: (a, b) => backend.testCollision(a, b, { type: "move", mode: "any" })
    });
    return escape === null ? null : !escape;
  }

  static async request(action, data) {
    if (!this.enabled) return;
    if (!game.users?.activeGM) {
      ui.notifications.warn("FIFTHED.EngagementNoGM", { localize: true });
      return false;
    }
    return this.authority ? this.execute({ action, ...data })
      : SocketHandlers.call("engagement", { action, ...data }, "GM");
  }

  static execute(request) {
    const work = this.queue.then(() => this._execute(request));
    this.queue = work.catch(error => {
      console.error("WFRP engagement update failed", error);
      ui.notifications.error("FIFTHED.EngagementError", { localize: true });
    });
    return work;
  }

  static async _execute({ action, sceneId, a, b, combatId }) {
    if (!this.authority || !this.enabled) return;
    if (action === "cleanup") return this.projectEffects();
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    let edges = this.edges(scene).map(e => ({ ...e }));
    const combat = game.combats?.find(c => c.scene?.id === scene.id && c.started && c.active);
    if (action === "attack") {
      if (a === b || !this.participates(scene.tokens.get(a)) || !this.participates(scene.tokens.get(b))) return;
      const edge = edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
      const stamp = { combatId: combat?.id || null, round: combat?.round || null };
      if (edge) Object.assign(edge, stamp);
      else edges.push({ a, b, ...stamp });
    } else if (action === "leave") {
      edges = edges.filter(e => e.a !== a && e.b !== a);
    } else if (action === "endCombat") {
      edges = edges.filter(e => e.combatId !== combatId);
    } else if (action !== "refresh") return;

    edges = edges.filter(e => {
      if (!this.participates(scene.tokens.get(e.a)) || !this.participates(scene.tokens.get(e.b))) return false;
      if (!e.combatId) {
        // Attacks made before initiative join its clock when combat starts.
        if (combat) Object.assign(e, { combatId: combat.id, round: combat.round });
        return true; // Outside initiative: explicit exit/GM clear.
      }
      const clock = game.combats?.get(e.combatId);
      // Keep the attack's round and the following full round. Expire at the next
      // boundary, not at N+1 (which could be one turn after a late-round attack).
      return clock?.started && clock.round <= e.round + 1;
    });
    if (JSON.stringify(edges) !== JSON.stringify(this.edges(scene))) await scene.setFlag("wfrp4e", "engagements", edges);
    await this.refresh(scene, edges);
    return true;
  }

  static async refresh(scene, edges) {
    const updates = [];
    for (const token of scene.tokens) {
      const opponents = edges.flatMap(e => e.a === token.id ? [e.b] : e.b === token.id ? [e.a] : [])
        .map(id => scene.tokens.get(id)).filter(Boolean);
      const overrides = token.getFlag("wfrp4e", "engagementOverrides") || {};
      const counts = this.counts(token, edges);
      const map = this.surrounded(token, opponents);
      const state = {
        engaged: opponents.length > 0, ...counts,
        outnumbered: opponents.length > 0 ? overrides.outnumbered ?? counts.outnumbered : false,
        surrounded: opponents.length > 0 ? overrides.surrounded ?? map : false,
        mapUnknown: map === null, sidesUnknown: counts.outnumbered === null
      };
      if (JSON.stringify(state) !== JSON.stringify(this.state(token))) updates.push({ _id: token.id, "flags.wfrp4e.engagementState": state });
    }
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
    await this.projectEffects(scene);
  }

  static async projectEffects(scene) {
    const actors = new Map((scene?.tokens || []).filter(t => t.actor).map(t => [t.actor.uuid, t.actor]));
    // Include world Actors whose last linked token was deleted.
    for (const actor of game.actors || []) {
      if (actor.effects.some(e => e.getFlag("wfrp4e", "engagementManaged"))) actors.set(actor.uuid, actor);
    }
    for (const actor of actors.values()) {
      // Linked tokens share an Actor. Do not clear its effect while another copy
      // is still engaged; roll modifiers always consult the specific Token.
      const tokens = game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actor?.uuid === actor.uuid));
      for (const status of this.statuses) {
        const held = tokens.some(t => this.state(t)[status] === true);
        const effect = actor.hasCondition(status);
        if (held && !effect) await actor.addCondition(status, 1, { "flags.wfrp4e.engagementManaged": true });
        else if (!held && effect?.getFlag("wfrp4e", "engagementManaged")) await effect.delete();
      }
    }
  }

  static async attack(test, target) {
    if (!this.enabled || !target || !FifthEdition.isMeleeItem(test.item) || test.context?.reroll
      || test.context?.edited || test.context?.defending || test.options?.disengage) return;
    const speaker = test.context?.chatOptions?.speaker || test.context?.speaker;
    const explicit = game.scenes?.get(speaker?.scene)?.tokens.get(speaker?.token);
    const token = this.tokenFor(test.actor, explicit);
    if (!token || token.parent.id !== target.parent?.id) {
      ui.notifications.warn("FIFTHED.EngagementTokenRequired", { localize: true });
      return;
    }
    return this.request("attack", { sceneId: token.parent.id, a: token.id, b: target.id });
  }

  static async leave(actor, token) {
    token = this.tokenFor(actor, token);
    if (!token) {
      ui.notifications.warn("FIFTHED.EngagementTokenRequired", { localize: true });
      return false;
    }
    return this.request("leave", { sceneId: token.parent.id, a: token.id });
  }

  static strongest(opponents) {
    const melee = actor => Math.max(actor.characteristics?.ws?.value || 0,
      ...(actor.itemTypes?.skill || []).filter(i => FifthEdition.isMeleeItem(i)).map(i => i.total?.value || i.system?.total?.value || 0));
    return [...opponents].sort((a, b) => melee(b.actor) - melee(a.actor) || a.id.localeCompare(b.id))[0];
  }

  static configure() {
    if (!this.enabled) return;
    const config = game.wfrp4e.config;
    // The Actor effect may be shared by multiple linked tokens. Consult the
    // acting token rather than forbidding every copy from shooting.
    const engaged = config.statusEffects.find(e => e.id === "engaged");
    for (const script of engaged?.system?.scriptData || []) {
      if (script.trigger !== "dialog") continue;
      script.options.activateScript = "return args.weapon?.isRanged && !args.weapon.properties.qualities.pistol && game.wfrp4e.engagements.isEngaged(args.actor)";
      script.options.hideScript = "return !args.weapon?.isRanged || args.weapon.properties.qualities.pistol || !game.wfrp4e.engagements.isEngaged(args.actor)";
    }
    for (const status of ["outnumbered", "surrounded"]) {
      if (config.statusEffects.some(e => e.id === status)) continue;
      config.statusEffects.push({
        id: status, statuses: [status], name: `FIFTHED.${status}`,
        description: `FIFTHED.${status}Description`,
        img: `systems/wfrp4e/icons/conditions/${status}.svg`,
        system: { condition: { value: null, numbered: false } }
      });
      config.conditions[status] = `FIFTHED.${status}`;
    }
  }

  /** Disabling the toggle must not leave 5e effects influencing ordinary 4e rolls. */
  static async deactivate() {
    if (!this.authority || this.enabled) return;
    const actors = new Map((game.actors?.contents || []).map(a => [a.uuid, a]));
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        if (token.actor) actors.set(token.actor.uuid, token.actor);
        if (token.getFlag("wfrp4e", "engagementState")) await token.unsetFlag("wfrp4e", "engagementState");
      }
      if (scene.getFlag("wfrp4e", "engagements")) await scene.unsetFlag("wfrp4e", "engagements");
    }
    for (const actor of actors.values()) {
      for (const effect of [...actor.effects]) {
        if (effect.getFlag("wfrp4e", "engagementManaged")) await effect.delete();
      }
    }
  }

  static async overrides(token) {
    if (!game.user.isGM || !this.enabled) return;
    const state = this.state(token), overrides = token.getFlag("wfrp4e", "engagementOverrides") || {};
    const opponents = document.createElement("p");
    opponents.textContent = game.i18n.format("FIFTHED.EngagementOpponents", {
      names: this.opponents(token).map(t => t.name || t.actor.name).join(", ") || game.i18n.localize("None")
    });
    let content = opponents.outerHTML + `<p>${game.i18n.localize("FIFTHED.EngagementOverrideHint")}</p>`;
    if (state.engaged && !state.sidesUnknown) content += `<p>${game.i18n.format("FIFTHED.EngagementCounts", state)}</p>`;
    if (state.mapUnknown || state.sidesUnknown) content += `<p>${game.i18n.localize("FIFTHED.EngagementUncertain")}</p>`;
    for (const status of ["outnumbered", "surrounded"]) {
      content += `<div class="form-group"><label>${game.i18n.localize(`FIFTHED.${status}`)}</label><select name="${status}">`;
      for (const [value, key] of [["auto", "Automatic"], ["true", "Yes"], ["false", "No"]]) {
        const selected = (overrides[status] == null ? "auto" : String(overrides[status])) === value;
        content += `<option value="${value}"${selected ? " selected" : ""}>${game.i18n.localize(`FIFTHED.Engagement${key}`)}</option>`;
      }
      content += "</select></div>";
    }
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FIFTHED.Engagements") }, content, rejectClose: false,
      buttons: [
        { action: "save", label: game.i18n.localize("Save"), callback: (event, button) => ({
          outnumbered: button.form.elements.outnumbered.value, surrounded: button.form.elements.surrounded.value
        }) },
        { action: "clear", label: game.i18n.localize("FIFTHED.EngagementClear"), callback: () => "clear" }
      ]
    });
    if (!choice) return;
    if (choice === "clear") {
      await token.unsetFlag("wfrp4e", "engagementOverrides");
      await this.leave(token.actor, token);
      const copies = game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actor?.uuid === token.actor?.uuid));
      if (!copies.some(t => this.state(t).engaged)) {
        const manual = token.actor?.hasCondition("engaged");
        if (manual) await manual.delete();
      }
      return;
    }
    const values = {};
    for (const status of ["outnumbered", "surrounded"]) {
      // Null means automatic; explicit null also replaces previous overrides.
      values[status] = choice[status] === "auto" ? null : choice[status] === "true";
    }
    await token.setFlag("wfrp4e", "engagementOverrides", values);
    return this.request("refresh", { sceneId: token.parent.id });
  }
}
