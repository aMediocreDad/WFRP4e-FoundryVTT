import Engagements from "../system/engagements.js";

export default function () {
  const refresh = scene => {
    if (Engagements.enabled && Engagements.authority && scene) {
      // Hooks cannot await one another. The shared queue serializes all changes.
      Engagements.execute({ action: "refresh", sceneId: scene.id }).catch(() => {});
    }
  };
  Hooks.on("ready", () => {
    Engagements.configure();
    if (Engagements.authority) {
      if (Engagements.enabled) for (const scene of game.scenes) refresh(scene);
      else Engagements.deactivate().catch(error => console.error("WFRP engagement cleanup failed", error));
    }
  });
  Hooks.on("canvasReady", canvas => refresh(canvas.scene));
  Hooks.on("updateUser", () => {
    if (Engagements.authority) {
      if (Engagements.enabled) for (const scene of game.scenes) refresh(scene);
      else Engagements.deactivate().catch(error => console.error("WFRP engagement cleanup failed", error));
    }
  });
  Hooks.on("createToken", token => refresh(token.parent));
  Hooks.on("deleteToken", token => refresh(token.parent));
  Hooks.on("updateToken", (token, changes) => {
    if (["x", "y", "width", "height", "elevation", "disposition", "actorId", "actorLink"].some(k => k in changes)
      || foundry.utils.hasProperty(changes, "flags.wfrp4e.engagementOverrides")) refresh(token.parent);
  });
  for (const hook of ["createWall", "updateWall", "deleteWall"]) Hooks.on(hook, wall => refresh(wall.parent));
  Hooks.on("updateScene", (scene, changes) => {
    if (["grid", "width", "height", "padding"].some(k => k in changes)) refresh(scene);
  });
  Hooks.on("deleteScene", () => {
    if (Engagements.enabled && Engagements.authority) Engagements.execute({ action: "cleanup" }).catch(() => {});
  });
  for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant"]) {
    Hooks.on(hook, combatant => refresh(combatant.parent.scene));
  }
  Hooks.on("updateCombat", combat => refresh(combat.scene));
  Hooks.on("deleteCombat", combat => {
    if (Engagements.authority && Engagements.enabled) {
      Engagements.execute({ action: "endCombat", sceneId: combat.scene?.id, combatId: combat.id }).catch(() => {});
    }
  });
  const actorChanged = actor => {
    if (!Engagements.authority || !Engagements.enabled) return;
    for (const scene of game.scenes) {
      if (scene.tokens.some(t => t.actor?.uuid === actor?.uuid)) refresh(scene);
    }
  };
  Hooks.on("updateActor", (actor, changes) => {
    if (changes.system) actorChanged(actor);
  });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, effect => {
      if (effect.statuses?.has("dead") || effect.statuses?.has("unconscious")) actorChanged(effect.parent);
    });
  }
}
