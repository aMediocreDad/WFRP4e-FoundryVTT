import FifthEdition from "../system/fifth-edition.js";


export default class HomebrewConfig extends WHFormApplication
{
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["warhammer", "standard-form", "homebrew-config"],
        window: {
            title: "Homebrew Settings Configuration",
            contentClasses: ["standard-form"],
            resizable : true,
        },
        position : {
            width: 400
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false,
            handler: this._onSubmit
        },
        actions: {
            applyFifthEdition: this._onApplyFifthEdition
        }
    }


    static #schema = new foundry.data.fields.SchemaField({

        channelingNegativeSLTests : new foundry.data.fields.BooleanField({label : "SETTINGS.ChannelingNegativeSL", hint : "SETTINGS.ChannelingNegativeSLHint"}),
        advantageBonus : new foundry.data.fields.NumberField({initial : 10, label : "SETTINGS.AdvantageBonus", hint : "SETTINGS.AdvantageBonusHint"}),
        uiaCritsMod : new foundry.data.fields.NumberField({initial: 10, label : "SETTINGS.UIACritsMod", hint : "SETTINGS.UIACritsModHint"}),
        partialChannelling : new foundry.data.fields.BooleanField({label : "SETTINGS.PartialChannelling", hint : "SETTINGS.PartialChannellingHint"}),
        channellingIngredients : new foundry.data.fields.BooleanField({label : "SETTINGS.ChannellingIngredients", hint : "SETTINGS.ChannellingIngredientsHint"}),
        unofficialgrimoire : new foundry.data.fields.BooleanField({label : "SETTINGS.UnofficialGrimoire", hint : ""}),
        
        mooAdvantage : new foundry.data.fields.BooleanField({label : "SETTINGS.MooAdvantage", hint : "SETTINGS.MooAdvantageHint"}),
        mooDifficulty : new foundry.data.fields.BooleanField({label : "SETTINGS.MooDifficulty", hint : "SETTINGS.MooDifficultyHint"}),
        // mooCritsFumbles : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCritsFumbles", hint : "SETTINGS.MooCritsFumblesHint"}),
        mooConditions : new foundry.data.fields.BooleanField({label : "SETTINGS.MooConditions", hint : "SETTINGS.MooConditionsHint"}),
        mooConditionTriggers : new foundry.data.fields.BooleanField({label : "SETTINGS.MooConditionTriggers", hint : "SETTINGS.MooConditionTriggersHint"}),
        mooCritModifiers : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCritModifiers", hint : "SETTINGS.MooCritModifiersHint"}),
        mooSLDamage : new foundry.data.fields.BooleanField({label : "SETTINGS.MooSLDamage", hint : "SETTINGS.MooSLDamageHint"}),
        mooRangedDamage : new foundry.data.fields.BooleanField({label : "SETTINGS.MooRangedDamage", hint : "SETTINGS.MooRangedDamageHint"}),
        mooMagicAdvantage : new foundry.data.fields.BooleanField({label : "SETTINGS.MooMagicAdvantage", hint : "SETTINGS.MooMagicAdvantageHint"}),
        mooOvercasting : new foundry.data.fields.BooleanField({label : "SETTINGS.MooOvercasting", hint : "SETTINGS.MooOvercastingHint"}),
        mooCatastrophicMiscasts : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCatastrophicMiscasts", hint : "SETTINGS.MooCatastrophicMiscastsHint"}),
        mooCriticalChannelling : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCriticalChannelling", hint : "SETTINGS.MooCriticalChannellingHint"}),
        mooCastAfterChannelling : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCastAfterChannelling", hint : "SETTINGS.MooCastAfterChannellingHint"}),
        mooPenetrating : new foundry.data.fields.BooleanField({label : "SETTINGS.MooPenetrating", hint : "SETTINGS.MooPenetratingHint"}),
        mooQualities : new foundry.data.fields.BooleanField({label : "SETTINGS.MooQualities", hint : "SETTINGS.MooQualitiesHint"}),
        mooShieldAP : new foundry.data.fields.BooleanField({label : "SETTINGS.MooShieldAP", hint : "SETTINGS.MooShieldAPHint"}),
        mooCriticalMitigation : new foundry.data.fields.BooleanField({label : "SETTINGS.MooCriticalMitigation", hint : "SETTINGS.MooCriticalMitigationHint"}),
        mooRangeBands : new foundry.data.fields.BooleanField({label : "SETTINGS.MooRangeBands", hint : "SETTINGS.MooRangeBandsHint"}),
        mooSizeDamage : new foundry.data.fields.BooleanField({label : "SETTINGS.MooSizeDamage", hint : "SETTINGS.MooSizeDamageHint"}),
        mooHomebrewItemChanges : new foundry.data.fields.BooleanField({label : "SETTINGS.MooHomebrewItems", hint : "SETTINGS.MooHomebrewItemHint"}),

        // Warhammer Fantasy Roleplay 5th Edition rules, see system/fifth-edition.js
        fifthEdOutcome : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdOutcome", hint : "SETTINGS.FifthEdOutcomeHint"}),
        fifthEdAdvantage : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdAdvantage", hint : "SETTINGS.FifthEdAdvantageHint"}),
        fifthEdMomentum : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdMomentum", hint : "SETTINGS.FifthEdMomentumHint"}),
        fifthEdEngagements : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdEngagements", hint : "SETTINGS.FifthEdEngagementsHint"}),
        fifthEdConditions : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdConditions", hint : "SETTINGS.FifthEdConditionsHint"}),
        fifthEdFortune : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdFortune", hint : "SETTINGS.FifthEdFortuneHint"}),
        fifthEdCriticalSL : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdCriticalSL", hint : "SETTINGS.FifthEdCriticalSLHint"}),
        fifthEdOpposedTies : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdOpposedTies", hint : "SETTINGS.FifthEdOpposedTiesHint"}),
        fifthEdNoCriticalDeflection : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdNoCriticalDeflection", hint : "SETTINGS.FifthEdNoCriticalDeflectionHint"}),
        fifthEdArmourWinds : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdArmourWinds", hint : "SETTINGS.FifthEdArmourWindsHint"}),
        fifthEdXP : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdXP", hint : "SETTINGS.FifthEdXPHint"}),
        fifthEdMetacurrency : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdMetacurrency", hint : "SETTINGS.FifthEdMetacurrencyHint"}),
        fifthEdSize : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdSize", hint : "SETTINGS.FifthEdSizeHint"}),
        fifthEdModifiers : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdModifiers", hint : "SETTINGS.FifthEdModifiersHint"}),
        fifthEdHealing : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdHealing", hint : "SETTINGS.FifthEdHealingHint"}),
        fifthEdCorruption : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdCorruption", hint : "SETTINGS.FifthEdCorruptionHint"}),
        fifthEdDifficultyLabels : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdDifficultyLabels", hint : "SETTINGS.FifthEdDifficultyLabelsHint"}),
        fifthEdFate : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdFate", hint : "SETTINGS.FifthEdFateHint"}),
        fifthEdCriticalHits : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdCriticalHits", hint : "SETTINGS.FifthEdCriticalHitsHint"}),
        fifthEdMisfire : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdMisfire", hint : "SETTINGS.FifthEdMisfireHint"}),
        fifthEdMagic : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdMagic", hint : "SETTINGS.FifthEdMagicHint"}),
        fifthEdQualities : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdQualities", hint : "SETTINGS.FifthEdQualitiesHint"}),
        fifthEdAmbitions : new foundry.data.fields.BooleanField({label : "SETTINGS.FifthEdAmbitions", hint : "SETTINGS.FifthEdAmbitionsHint"})
    })

    /** @override */
    static PARTS = {
        form: {
            template: "systems/wfrp4e/templates/apps/homebrew-settings.hbs",
            scrollable: [""],
            classes: ["standard-form"]
        }
    };

    static get schema()
    {
        return this.#schema
    }

    async _prepareContext(options) {
        let context = await super._prepareContext(options);
        context.source = game.settings.get("wfrp4e", "homebrew");
        context.schema = this.constructor.schema
        return context;
    }


    static async _onSubmit(event, form, formData) 
    {
        // Momentum is per-character and binary; Group Advantage pools it and spends it. There is nothing to convert
        // between them (Core Rulebook p.168, and Up in Arms' Group Advantage has no 5e equivalent), and with both on
        // computeAdvantage reads the actor while _handleAdvantageUpdate writes the pool, so the sheet does nothing.
        if (formData.object.fifthEdMomentum && game.settings.get("wfrp4e", "useGroupAdvantage"))
        {
            formData.object.fifthEdMomentum = false;
            ui.notifications.error("SETTINGS.FifthEdMomentumGroupAdvantage", { localize: true, permanent: true });
        }
        game.settings.set("wfrp4e", "homebrew", formData.object)
    }

    static async _onApplyFifthEdition(ev)
    {
        ev.preventDefault();
        await FifthEdition.applyPreset();
        this.render(true);
    }

}