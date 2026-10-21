import Engagements from "../system/engagements.js";

export default class WFRPTokenHUD extends foundry.applications.hud.TokenHUD {


  _onToggleEffect = function (event, { overlay = false } = {}) {
    event.preventDefault();
    event.stopPropagation();
    let img = event.currentTarget;

    let actor = this.object?.actor;
    if (!actor) return;

    if (Engagements.enabled && ["outnumbered", "surrounded"].includes(img.dataset.statusId)) {
        if (game.user.isGM) return Engagements.overrides(this.object.document);
        return ui.notifications.warn("FIFTHED.EngagementGMOverride", { localize: true });
    }
    if (Engagements.enabled && img.dataset.statusId === "engaged" && event.button === 2) {
        if (game.user.isGM) return Engagements.overrides(this.object.document);
        return ui.notifications.warn("FIFTHED.EngagementUseExit", { localize: true });
    }

    if (event.button == 0)
    {
        return actor.addCondition(img.dataset.statusId)
    }
    if (event.button == 2)
    {
        if (this.object?.actor.hasCondition(img.dataset.statusId))
        {
            return actor.removeCondition(img.dataset.statusId)
        }
        else 
        {
            return actor.addCondition(img.dataset.statusId, 1, {"flags.core.overlay": true})
        }
    }
    //return this.object.toggleEffect(effect, {overlay});
  }

    activateListeners(html)
    {   
        super.activateListeners(html);
        const effectsTray = html.find(".status-effects");

        if (Engagements.enabled && game.user.isGM) {
            const button = document.createElement("div");
            button.className = "control-icon";
            button.setAttribute("role", "button");
            button.tabIndex = 0;
            button.setAttribute("aria-label", game.i18n.localize("FIFTHED.Engagements"));
            button.title = game.i18n.localize("FIFTHED.Engagements");
            button.innerHTML = '<i class="fa-solid fa-people-arrows"></i>';
            button.addEventListener("click", event => {
                event.preventDefault();
                Engagements.overrides(this.object.document);
            });
            button.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    button.click();
                }
            });
            html.find(".col.right").append(button);
        }

        effectsTray.off("click", ".effect-control");
        effectsTray.off("contextmenu", ".effect-control");
        
        effectsTray.on("click", ".effect-control", this._onToggleEffect.bind(this));
        effectsTray.on("contextmenu", ".effect-control", event => this._onToggleEffect(event, {overlay: true}));

    }
}