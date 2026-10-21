import FifthEdition from "../../system/fifth-edition.js";
import Engagements from "../../system/engagements.js";
export default class RollDialog extends WarhammerRollDialogV2 {

    static DEFAULT_OPTIONS = {
        position: {
            width: 600
        },
        actions: {
            addManualModifier: this._onAddManualModifier,
            removeManualModifier: this._onRemoveManualModifier
        }
    };

    /**
     * Modifiers added by hand in this dialog, as {value, source}. Deliberately not fields: `userEntry` holds one
     * value per input name and this is a list, and a field would be recomputed away on the next render.
     */
    manualModifiers = [];

    get tooltipConfig() 
    {
        return {
            modifier: {
                label: "Modifier",
                type: 1,
                path: "fields.modifier",
                hideLabel: true
            },
            slBonus: {
                label: "DIALOG.SLBonus",
                type: 1,
                path: "fields.slBonus"
            },
            successBonus: {
                label: "DIALOG.SuccessBonus",
                type: 1,
                path: "fields.successBonus"
            },
            difficulty: {
                label: "Difficulty",
                type: 0,
                path: "fields.difficulty"
            },
            advSources: {
                label: "FIFTHED.Advantage",
                type: 1,
                path: "fields.advSources"
            },
            disSources: {
                label: "FIFTHED.Disadvantage",
                type: 1,
                path: "fields.disSources"
            }
        }
    }
    
    static PARTS = {
        fields : {
            template : "systems/wfrp4e/templates/dialog/type/base-dialog.hbs",
            fields: true
        },
        modifiers : {
            template : "modules/warhammer-lib/templates/partials/dialog-modifiers.hbs",
            modifiers: true
        },
        specific : {
            template : "systems/wfrp4e/templates/dialog/type/default-dialog.hbs",
        },
        footer : {
            template : "templates/generic/form-footer.hbs"
        }
    };


    // /**
    //  * @override
    //  * Overide submit to handle creating the test with testClass
    //  * 
    //  * @param {Event|null} ev Triggering Event
    //  * @returns 
    //  */
    // static submit(ev) 
    // {
    //     ev?.preventDefault();
    //     ev?.stopPropagation();
        
    //     for(let script of this.data.scripts)
    //     {
    //         if (script.isActive)
    //         {
    //             script.submission(this);
    //         }
    //     }

    //     let test = new this.testClass(this._getSubmissionData(), this.actor)
        
    //     if (this.resolve)
    //     {
    //         this.resolve(test);
    //     }
    //     this.close();
    //     if (canvas.scene && !this.options.skipTargets)
    //     {
    //         game.canvas.tokens.setTargets([])
    //     }
    //     return test;
    // }

    // async bypass()
    // {
    //     let data = await super.bypass();
        
    //     let test = new this.testClass(data, this.actor)
    //     if (this.resolve)
    //     {
    //         this.resolve(test);
    //     }
    // }

    get title()
    {
        return this.context.title;
    }

    _getSubmissionData()
    {
        // if (!this.testClass)
        // {
        //     throw new Error("Only subclasses of RollDialog can be submitted")
        // }
        let data = super._getSubmissionData();

        data.chatOptions = this._setupChatOptions()
        data.chatOptions.rollMode = data.rollMode;

        return data
    }


    async _prepareContext(options)
    {
        let context = await super._prepareContext(options);
        context.fifthEdition = FifthEdition.flags;
        context.manualModifiers = this.manualModifiers.map((modifier, index) => ({
            index,
            label: `${foundry.applications.handlebars.numberFormat(modifier.value, { hash: { sign: true } })} ${modifier.source}`
        }));
        context.canSpendFortune = FifthEdition.enabled("Fortune") && this.actor.system.status.fortune?.value > 0;
        context.canSpendFate = FifthEdition.enabled("Fate") && this.actor.system.status.fate?.value > 0; // 5e (p.133): I Will Not Fail!
        // 5e has no percentage modifiers (p.130-131), so the Modifier field is dead weight under that toggle - but a
        // script or an Item's own data-driven modifier can still write to it, and a modifier nobody can see is worse
        // than a row nobody needs. So it goes only while it is empty. super._prepareContext has already run
        // computeFields by this point, so this reads the final value.
        context.showModifier = !FifthEdition.enabled("Modifiers") || !!this.fields.modifier;
        return context;
    }

    async computeFields() 
    {
        this._computeAdvantage();
        this._computeFortuneAdvantage();
        if (this.actor.attacker)
        {
            this._computeDefending(this.actor.attacker);
        }

        if (this.data.targets.length && !this.actor.attacker)
        {
            this._computeTargets(this.data.targets[0]);
            // Shared by weapon, trait and raw Melee Skill attacks; never by
            // parries or Disengage contests. p.166 uses one non-stacking SL bonus.
            if (!this.context.disengage && FifthEdition.isMeleeItem(this.item)) {
                const bonus = Engagements.attackBonus(this.actor, this.data.targets[0]);
                if (bonus) {
                    this.fields.slBonus += bonus;
                    this.tooltips.add("slBonus", bonus, game.i18n.localize(bonus === 2 ? "FIFTHED.surrounded" : "FIFTHED.outnumbered"));
                }
            }
        }

        this._computeManualModifiers();
    }

    /**
     * Apply the modifiers added by hand. They go through `tooltips.add` like every automatic one, which is what puts
     * each of them, named, into the chat card's breakdown.
     */
    _computeManualModifiers()
    {
        for (let modifier of this.manualModifiers)
        {
            this.fields.slBonus += modifier.value;
            this.tooltips.add("slBonus", modifier.value, modifier.source);
        }
    }

    static _onAddManualModifier()
    {
        this._addManualModifier();
    }

    static _onRemoveManualModifier(ev, target)
    {
        this.manualModifiers.splice(Number(target.dataset.index), 1);
        this.render(true);
    }

    /**
     * Read the two staging inputs, bank the entry and re-render so computeFields picks it up. The inputs are cleared
     * by the re-render, since they hold no field of their own.
     */
    _addManualModifier()
    {
        let value = Number(this.element.querySelector(".manual-modifier-value")?.value);
        if (!value)
        {
            return ui.notifications.warn("DIALOG.ManualModifierEmpty", { localize: true });
        }
        let source = this.element.querySelector(".manual-modifier-source")?.value.trim();
        this.manualModifiers.push({ value, source: source || game.i18n.localize("DIALOG.ManualModifier") });
        this.render(true);
    }

    _computeAdvantage()
    {
        if (FifthEdition.enabled("Momentum"))
        {
            // 5e (p.168): Momentum grants Advantage on Melee Tests and nothing else
            if (FifthEdition.isMeleeItem(this.item))
            {
                if (this.actor.system.status.advantage?.value > 0)
                {
                    this.tooltips.start(this);
                    this.fields.advSources++;
                    this.tooltips.finish(this, game.i18n.localize("Momentum"));
                }
                else if (this.fields.charging)
                {
                    // 5e (p.163): a Charge grants Momentum as you barrel in, so the charging attack itself has Advantage
                    this.tooltips.start(this);
                    this.fields.advSources++;
                    this.tooltips.finish(this, game.i18n.localize("Charging"));
                }
            }
            return;
        }
        if (game.settings.get("wfrp4e", "autoFillAdvantage"))
        {
            this.tooltips.start(this);
            if (!game.settings.get("wfrp4e", "homebrew").mooAdvantage)
            {
                this.fields.modifier += (game.settings.get("wfrp4e", "homebrew").advantageBonus * this.actor.system.status.advantage.value)
            }
            else 
            {
                this.fields.successBonus += this.actor.system.status.advantage.value;
            }
            this.tooltips.finish(this, "Advantage");
        }
    }

    /**
     * 5e (p.133): spending a Fortune Point before the roll grants Advantage. The point itself is deducted by the test.
     */
    _computeFortuneAdvantage()
    {
        if (this.fields.fortuneAdvantage && FifthEdition.enabled("Fortune"))
        {
            this.tooltips.start(this);
            this.fields.advSources++;
            this.tooltips.finish(this, game.i18n.localize("Fortune"));
        }
    }

    /**
     * 5e Armour Repels the Winds (p.237): -1 SL to Casting and Channelling Tests per AP on the most protected location.
     * Only worn, mundane armour counts. Metal is exempt for Chamon (Lore of Metal), leather for Ghur (Lore of Beasts).
     * @param {string|Array<string>} lore Lore key(s) of the spell
     */
    _computeArmourWinds(lore)
    {
        let armour = this.actor.system.status?.armour;
        if (!armour) return;
        let lores = Array.isArray(lore) ? lore : [lore];
        let penalty = 0;
        for (let loc of ["head", "body", "lArm", "rArm", "lLeg", "rLeg"])
        {
            let ap = 0;
            for (let layer of armour[loc]?.layers || [])
            {
                if (!layer.armourType || layer.magical) continue;
                if (lores.includes("metal") && layer.metal) continue;
                if (lores.includes("beasts") && ["softLeather", "boiledLeather"].includes(layer.armourType)) continue;
                ap += layer.value;
            }
            penalty = Math.max(penalty, ap);
        }
        if (penalty > 0)
        {
            this.tooltips.start(this);
            this.fields.slBonus -= penalty;
            this.tooltips.finish(this, game.i18n.localize("FIFTHED.ArmourWinds"));
        }
    }

    /**
     * Runs when the actor is being attacked
     * @abstract
     */
    _computeDefending(attacker)
    {

    }

    /** 
     * Runs if targeting an actor
     * @abstract
     */
    _computeTargets(target)
    {

    }

    async _onRender(options) 
    {
        await super._onRender(options);

        this.element.querySelector("[name='advantage']").addEventListener("change", this._onAdvantageChanged.bind(this))

        // The dialog submits on Enter from a document-level listener, so Enter in either staging input would roll the
        // Test instead of banking the modifier. Stopping propagation keeps the event from reaching that listener.
        this.element.querySelectorAll(".manual-modifier-value, .manual-modifier-source").forEach(input =>
        {
            input.addEventListener("keypress", ev =>
            {
                if (ev.key != "Enter") return;
                ev.preventDefault();
                ev.stopPropagation();
                this._addManualModifier();
            });
        });
    }

    _onFieldChange(ev) 
    {
        if (ev.currentTarget.name == "advantage")
        {
            return;
        }
        else return super._onFieldChange(ev);
    }


    _onAdvantageChanged(ev)
    {
        // Under the 5e Momentum toggle this field is a checkbox, whose value is "on" rather than a number
        let value = ev.currentTarget.type == "checkbox" ? Number(ev.currentTarget.checked) : Number(ev.currentTarget.value);
        this.actor.setAdvantage(value).then(a => this.render(true))
        ui.notifications.notify(game.i18n.localize("DIALOG.AdvantageUpdate"))
    }


    _defaultDifficulty()
    {
        let difficulty = "challenging"

        // Overrides default difficulty to Average depending on module setting and combat state
        if (game.settings.get("wfrp4e", "testDefaultDifficulty") && (game.combat != null))
            difficulty = game.combat.started ? "challenging" : "average";
        else if (game.settings.get("wfrp4e", "testDefaultDifficulty"))
            difficulty = "average";

        return difficulty;
    }
    _defaultFields() 
    {
        return foundry.utils.mergeObject({
            modifier : 0,
            successBonus : 0,
            slBonus : 0,
            difficulty : this._defaultDifficulty(),
            advSources : 0,
            disSources : 0,
            fortuneAdvantage : false,
            useFate : false,
            fateRoll : 1,
        }, super._defaultFields());
    }

    createBreakdown()
    {
        let breakdown = {
            modifier: this.fields.modifier,
            difficulty : this.fields.difficulty,
            slBonus : this.fields.slBonus,
            successBonus : this.fields.successBonus,
            modifiersBreakdown : this.tooltips.getCollectedTooltips()
        }
        return breakdown;
    }
    
 /**
   * Ghat card options.
   *
   * All tests use the same chatOptions, but use the template member defined in each dialog class
   */
    _setupChatOptions() {
        let token = this.actor.token || this.actor.getActiveTokens()[0] || this.actor.prototypeToken;
        let chatOptions = {
            speaker: {
                alias: token.name,
                token: token.id,
                scene: token.parent?.id,
                actor: this.actor.id,
            },
            title: this.options.title,
            template: this.chatTemplate,
        }

        // If the test is coming from a token sheet
        if (this.actor.token) 
        {
            chatOptions.speaker.alias = this.actor.token.name; // Use the token name instead of the actor name
            chatOptions.speaker.token = this.actor.token.id;
            chatOptions.speaker.scene = canvas.scene.id

            if (this.actor.token.hidden) 
            {
                chatOptions.speaker.alias = "???"
            }
        }
        else // If a linked actor - use the currently selected token's data if the actor id matches
        {
            let speaker = ChatMessage.getSpeaker()
            if (speaker.actor == this.actor.id) 
            {
                let token = speaker.token ? canvas.tokens.get(speaker.token) : null;
                chatOptions.speaker.alias = speaker.alias
                chatOptions.speaker.token = speaker.token
                chatOptions.speaker.scene = speaker.scene
                if (token?.document.hidden) 
                {
                    chatOptions.speaker.alias = "???"
                }
            }
        }



        //Suppresses roll sound if the test has it's own sound associated
        foundry.utils.mergeObject(chatOptions,
        {
            user: game.user.id,
            sound: CONFIG.sounds.dice
        }, {overwrite : false})

        return chatOptions
    }

    /**
  * Creates the basic data that generally all dialogs use, such as formatting the speaker data and handling dialog scirpts
  * @param {Actor} actor Actor performing the test
  * @param {object} context Additional contextual flags for dialog, usually used by scripts
  * @returns {object} Basic dialog data shared by all types of dialogs
  */
    static _baseDialogData(actor, context, options) 
    {
        let dialogData = super._baseDialogData(actor, context, options)

        if (context.engagementTarget) {
            const target = fromUuidSync(context.engagementTarget);
            dialogData.data.targets = target ? [target.object || target] : [];
        }

        // Allow callers to preset fields for any dialog type (e.g. setupWeapon(weapon, {fields : {charging : true}}))
        if (context.fields)
        {
            dialogData.fields = foundry.utils.mergeObject(dialogData.fields || {}, context.fields);
        }

        dialogData.data.other = []; // Container for miscellaneous data that can be freely added onto
        dialogData.data.speaker = CONFIG.ChatMessage.documentClass.getSpeaker({ actor });
        if (actor && !actor?.token) {
            // getSpeaker retrieves tokens even if this sheet isn't a token's sheet
            delete dialogData.data.speaker.scene;
        }

        if (dialogData.context.result) {
            if (typeof dialogData.context.result.general === "string")
                dialogData.context.result.general = [dialogData.context.result.general]
            if (typeof dialogData.context.result.success === "string")
                dialogData.context.result.success = [dialogData.context.result.success]
            if (typeof dialogData.context.result.failure === "string")
                dialogData.context.result.failure = [dialogData.context.result.failure]
        }
        
        return dialogData;
    }

    static getDefendingScripts(actor)
    {
        // Defending scripts are dialog scripts coming from the attacker and/or the weapon used in the attack.
        // e.g. "Dodge tests to defend against this attack have disadvantage"
        let attacker = actor.attacker;
        return attacker?.test?.actor ? ((attacker.test.actor.getScripts("dialog").concat(attacker.test?.item?.getScripts?.("dialog") || [])).filter(s => s.options?.defending)) : []
    }


    // Backwards compatibility for effects
    get prefillModifiers() 
    {
        return this.fields;
    }

    get type() 
    {

    }
}