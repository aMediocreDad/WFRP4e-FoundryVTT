import Advancement from "../../system/advancement";
import WFRP_Audio from "../../system/audio-wfrp4e";
import ActiveEffectWFRP4e from "../../system/effect-wfrp4e";
import WFRP_Utility from "../../system/utility-wfrp4e";
import { OvercastItemModel } from "./components/overcast";
import FifthEdition from "../../system/fifth-edition.js";
let fields = foundry.data.fields;

export class SpellModel extends OvercastItemModel {
    static LOCALIZATION_PREFIXES = ["WH.Models.spell"];

    static defineSchema() {
        let schema = super.defineSchema();

        schema.lore = new fields.SchemaField({
            value: new fields.ArrayField(new fields.StringField()),
            effectString: new fields.StringField(),
            chosen: new fields.StringField()
        });
        schema.range = new fields.SchemaField({
            value: new fields.StringField(),
            vortex: new fields.BooleanField(),
            maximum: new fields.BooleanField()
        });
        schema.target = new fields.SchemaField({
            value: new fields.StringField(),
            aoe: new fields.BooleanField(),
            maximum: new fields.BooleanField()
        });
        schema.duration = new fields.SchemaField({
            value: new fields.StringField(),
            extendable: new fields.BooleanField(),
            maximum: new fields.BooleanField()
        });
        schema.damage = new fields.SchemaField({
            dice: new fields.StringField(),
            value: new fields.StringField(),
        });
        schema.cn = new fields.SchemaField({
            value: new fields.NumberField(),
            SL: new fields.NumberField(),
        });
        schema.magicMissile = new fields.SchemaField({
            value: new fields.BooleanField(),
        });
        schema.ritual = new fields.SchemaField({
            value: new fields.BooleanField(),
            type: new fields.StringField(),
            xp: new fields.NumberField(),
        });
        schema.memorized = new fields.SchemaField({
            value: new fields.BooleanField(),
        });
        schema.skill = new fields.SchemaField({
            value: new fields.StringField(),
        });
        schema.ingredients = new fields.ArrayField(new fields.StringField());
        schema.currentIng = new fields.SchemaField({
            value: new fields.StringField(),
        });
        schema.wind = new fields.SchemaField({
            value: new fields.StringField(),
        });
        return schema;
    }

    static get compendiumBrowserFilters() {
      return new Map([
        ...Array.from(super.compendiumBrowserFilters),
        ["lore", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.lore.value.label",
          type: "set",
          config: {
            blank: "None",
            choices : game.wfrp4e.config.magicLores,
            keyPath: "system.lore.value"
          }
        }],
        ["range", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.range.value.label",
          type: "text",
          config: {
            keyPath: "system.range.value"
          }
        }],
        ["target", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.target.value.label",
          type: "text",
          config: {
            keyPath: "system.target.value"
          }
        }],
        ["aoe", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.target.aoe.label",
          type: "boolean",
          config: {
            keyPath: "system.target.aoe"
          }
        }],
        ["duration", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.duration.value.label",
          type: "text",
          config: {
            keyPath: "system.duration.value"
          }
        }],
        ["magicMissile", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.magicMissile.value.label",
          type: "boolean",
          config: {
            keyPath: "system.magicMissile.value",
          }
        }],
        ["ritual", {
          label: this.LOCALIZATION_PREFIXES + ".FIELDS.ritual.value.label",
          type: "boolean",
          config: {
            keyPath: "system.ritual.value",
          }
        }],
        ["doesDamage", {
          label: "SHEET.DoesDamage",
          type: "boolean",
          config: {
            keyPath: "system.damage",
            valueGetter: (data) => !!data.system.damage?.value?.length || !!data.system.damage?.dice?.length,
          }
        }],
      ]);
    }

    async _preUpdate(data, options, user)
    {
      await super._preUpdate(data, options, user)
      if (foundry.utils.hasProperty(options.changed, "system.cn.SL"))
      {
          data.system.cn.SL = Math.max(data.system.cn.SL, 0);
      }

      if (foundry.utils.hasProperty(options, "changed.system.cn.SL") && game.settings.get("wfrp4e", "useWoMChannelling") && !options.updateWoM)
      {
        let items = this.parent.actor?.items.filter(s => s.type == "spell" && s.system.lore.value[0] == this.lore.value[0] && s.id != this.parent.id).map(s => {
          return {
            _id : s.id,
            "system.cn.SL" : options.changed.system.cn.SL
          }
        })
        this.parent.actor?.updateEmbeddedDocuments("Item", items, {updateWoM : true});
      }
    }

    async _onUpdate(data, options, user)
    {
      if (game.user.id == user && this.parent.actor?.type == "character" && foundry.utils.hasProperty(options.changed, "system.memorized.value"))
      {
        if (options.changed.system.memorized.value)
        {
          WFRP_Audio.PlayContextAudio({ item: this.parent, action: "memorize" })
          await Advancement.memorizeCostDialog(this.parent, this.parent.actor)
        }
        else 
        {
          WFRP_Audio.PlayContextAudio({ item: this.parent, action: "unmemorize" })
        }
      }
    }

    /**
     * Used to identify an Item as one being a child or instance of SpellModel
     *
     * @final
     * @returns {boolean}
     */
    get isSpell() {
      return true;
    }

    get ingredient() {
        if (this.currentIng.value)
          return this.parent.actor?.items.get(this.currentIng.value)
      }


      get ingredientList() {
        return this.parent.actor?.itemTags["trapping"].filter(t => t.trappingType.value == "ingredient" && t.spellIngredient.value == this.parent.id).map(i => {
          return {
            name: i.name + ` (${i.system.quantity.value})`,
            id: i.id
          }
        })
      }

      get Target() {
        return this.computeSpellPrayerFormula("target", {aoe: this.target.aoe})
      }

      get Duration() {
        let duration = this.computeSpellPrayerFormula("duration")
        if (this.duration?.extendable)
          duration += "+"
        return duration
      }

      get Range() {
          return this.computeSpellPrayerFormula("range")
      }

      get Damage() {
        return parseInt(this.computeSpellDamage(this.damage.value, {isMagicMissile: this.magicMissile.value}) || 0)
      }    
    
    

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        if (this.parent.isOwned) {
            let actor = this.parent.actor;
            if (actor.type != "character" && actor.type != "vehicle") {
                this.updateSource({"memorized.value" : true});
            }

            if (actor.type == "character" && (this.lore.value == "petty" || this.lore.value == game.i18n.localize("WFRP4E.MagicLores.petty"))) {
                Advancement.memorizeCostDialog(this.parent, actor)
            }
        }
    }

    computeBase() {
      this._computeLoreEffects();
    }

    /**
     * Build one Lore Attribute effect per entry of lore.value and append the Lore's printed text.
     *
     * Split out of computeBase so it can be re-run when lore.value changes after base preparation, which is what a
     * derived Arcane Lore does - see _deriveArcaneLore.
     */
    _computeLoreEffects()
    {
      this.lore.effects = {};
      for(let lore of this.lore.value)
      {
        let effect = foundry.utils.deepClone(game.wfrp4e.config.loreEffects[lore])
        if (effect)
        {
          foundry.utils.setProperty(effect, "flags.wfrp4e.lore", lore);
          foundry.utils.setProperty(effect, "flags.wfrp4e.path", "system.lore.effects." + lore);
          this.lore.effects[lore] = new ActiveEffectWFRP4e(effect, { parent: this.parent });
        }
      }
      this._addSpellDescription();
    }

    /**
     * The Lore whose Attribute this spell actually applies.
     *
     * With more than one Lore the owner picks one on the sheet and it is kept in lore.chosen. That choice can now go
     * stale in a way it never could before: a derived Lore changes whenever the owner's Talents change, which is not
     * when the picker was last used, so a chosen Lore the spell no longer carries falls back to the first one rather
     * than reaching no Lore Attribute at all.
     *
     * @returns {string|undefined} the empty string for a spell stored with no Lore of its own (the content writes
     *                             that as [""]), and undefined only when lore.value is genuinely empty
     */
    get effectiveLore()
    {
      return this.lore.value.includes(this.lore.chosen) ? this.lore.chosen : this.lore.value[0];
    }

    /**
     * 5e (p.242): an Arcane Spell is "counted as [a] Lore Spell in all ways, meaning [it gets] the Lore Attributes of
     * Lore Spells" - the Lore being the caster's own, from their Arcane Magic (<Lore>) and Chaos Magic (<Lore>)
     * Talents. 4e delivered this by shipping each Arcane spell once per Lore; the 5e content ships one untagged copy
     * of each, so the Lore is derived from the owner here instead.
     *
     * An Arcane spell is one carrying no Lore key of its own. The converted content writes that as [""], a
     * one-element array holding the empty string, rather than [], so the test is for no non-empty key.
     *
     * Derived state only. lore.value is rebuilt from the owner's Talents on every preparation cycle and never
     * written back to the Item, so a spell that changes hands takes its new owner's Lore, and the stored source
     * stays exactly as the content module shipped it.
     */
    _deriveArcaneLore()
    {
        if (this.lore.value.some(lore => lore)) return; // carries a Lore of its own, so not an Arcane spell
        let lores = FifthEdition.arcaneLores(this.parent?.actor); // returns [] while the Magic toggle is off
        if (!lores.length) return;
        this.lore.value = lores; // a new array - _source keeps the shipped [""]
        this._computeLoreEffects();
    }

    computeOwned()
    {
        this._deriveArcaneLore();

        // 5e (p.237): a spell cast from a grimoire keeps its CN, you just cannot Overcast it
        let grimoireDoubling = !this.memorized.value && !FifthEdition.enabled("Magic");
        this.cn.value = grimoireDoubling ? this.cn.value * 2 : this.cn.value;
        if (this.ritual?.value && grimoireDoubling)
        {
          this.cn.value *= 2; // Unmemorized rituals are 4 * CN
        }
        else 
        {
          this.overcast.usage = this.computeOvercastingData(this.parent.parent);
        }
    }

    usesWind(wind)
    {
      return this.lore.value.map(i => {
        if (game.wfrp4e.config.loreWind[i])
        {
          return game.wfrp4e.config.loreWind[i];
        }
        else // If no wind associated with lore, jsut match lore
        {
          return i;
        }
        
      }).includes(wind);
    }


    getSkillToUse(actor) 
    {
        actor = actor || this.parent.actor;
        let skills = actor?.itemTags["skill"] || []
        let skill
        // Use skill override, if not found, use Language (Magick)
        if (this.skill.value)
        {
            skill = skills.find(i => i.name.toLowerCase() == this.skill.value.toLowerCase())
        }
        if (!skill)
        {
            skill = skills.find(i => i.name.toLowerCase() == `${game.i18n.localize("NAME.Language")} (${game.i18n.localize("SPEC.Magick")})`.toLowerCase())
        }
        return skill
    }

    getOtherEffects()
    {
      if (this.lore.value.length > 1)
      {
        // effectiveLore rather than `chosen || value[0]`: a derived Lore changes with the owner's Talents, so a
        // chosen Lore the spell no longer carries would otherwise resolve to nothing and apply no Attribute at all.
        return super.getOtherEffects().concat(this.lore.effects?.[this.effectiveLore] || [])
      }
      else 
      {
        return super.getOtherEffects().concat(Object.values(this.lore.effects || {}) || [])
      }
    }

    /**
    * Augments the spell item's description with the lore effect
    * 
    * The spell's lore is added at the end of the spell's description for
    * an easy reminder. However, this causes issues because we don't want
    * the lore to be 'saved' in the description. So we append the lore
    * if it does not already exist
    * 
    * @param {Object} spell 'spell' type item
    */
    _addSpellDescription() {
        let description = this.description.value;
        if (description && description.includes(game.i18n.localize("SPELL.Lore")))
            return description

        // Use lore override if it exists
        if (this.lore.effectString)
            description += `<p>\n\n <b>${game.i18n.localize("SPELL.Lore")}</b> ${this.lore.effectString}<p>`;
        // Otherwise, use config value for lore effect
        // Indexed by the effective Lore, not by lore.value: lore.value is an array, and indexing an object with it
        // only worked because a one-element array coerces to its element. A spell with two Lores prints the one its
        // owner picked, which is the same Lore getOtherEffects applies.
        else if (game.wfrp4e.config.loreEffectDescriptions && game.wfrp4e.config.loreEffectDescriptions[this.effectiveLore])
            description += `<p>\n\n <b>${game.i18n.localize("SPELL.Lore")}</b> ${game.wfrp4e.config.loreEffectDescriptions[this.effectiveLore]}<p>`;

        this.description.value = description
    }


    async expandData(htmlOptions) {
        let data = await super.expandData(htmlOptions);
        data.properties.push(`${game.i18n.localize("Range")}: ${this.Range}`);
        let target = this.Target;
        if (target?.toString()?.includes("AoE"))
          target = `<a class='aoe-template' data-id="${this.id}" data-actor-id="${this.parent.actor.id}"><i class="fas fa-ruler-combined"></i>${target}</a>`
        data.properties.push(`${game.i18n.localize("Target")}: ${target}`);
        data.properties.push(`${game.i18n.localize("Duration")}: ${this.Duration}`);
        if (this.magicMissile.value)
          data.properties.push(`${game.i18n.localize("Magic Missile")}: +${this.Damage}`);
        else if (this.damage.value || this.damage.dices) {
          let damage = this.Damage || "";
          if (this.damage.dice)
            damage += " + " + this.damage.dice
          data.properties.push(`${game.i18n.localize("Damage")}: ${damage}`);
        }
        return data;
      }

      chatData() {
        let properties = [];
        if (game.wfrp4e.config.magicLores[this.lore.value])
          properties.push(`<b>${game.i18n.localize("Lore")}</b>: ${game.wfrp4e.config.magicLores[this.lore.value]}`);
        else
          properties.push(`<b>${game.i18n.localize("Lore")}</b>: ${this.lore.value}`);
        properties.push(`<b>${game.i18n.localize("CN")}</b>: ${this.cn.value}`);
        properties.push(`<b>${game.i18n.localize("Range")}</b>: ${this.range.value}`);
        properties.push(`<b>${game.i18n.localize("Target")}</b>: ${this.target.value}`);
        properties.push(`<b>${game.i18n.localize("Duration")}</b>: ${this.duration.value}`);
        if (this.damage.value)
          properties.push(`<b>${game.i18n.localize("Damage")}</b>: ${this.damage.value}`);
    
        return properties;
      }


    /** @inheritdoc */
    static migrateData(data) 
    {
      super.migrateData(data);
      if (typeof data.lore.value == "string")
      {
        data.lore.value = [data.lore.value];
      }
      return data;
    }

}