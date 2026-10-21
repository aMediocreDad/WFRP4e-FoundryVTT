import SkillDialog from "./skill-dialog";
import FifthEdition from "../../system/fifth-edition.js";
import Engagements from "../../system/engagements.js";

export default class AttackDialog extends SkillDialog  
{
    get attackType() {
        return this.item.attackType;
    }


    computeFields()
    {
        super.computeFields();
        if (this.item.attackType == "ranged" && game.combat?.active) {
            let combatant = game.combat.combatants.find(c => c.actor?.id == this.actor.id);
            if (combatant?.token && combatant?.token.measureMovementPath(combatant.token.movementHistory).distance > 0) {
                if (FifthEdition.enabled("Modifiers")) {
                    // 5e (p.166): moving before firing is -1 SL
                    this.fields.slBonus -= 1;
                    this.tooltips.add("slBonus", -1, game.i18n.localize("CHAT.TestModifiers.MovedThisRound"));
                }
                else {
                    this.fields.modifier -= 10;
                    this.tooltips.add("modifier", -10, game.i18n.localize("CHAT.TestModifiers.MovedThisRound"));
                }
            }
        }
        // 5e (p.133): I Will Not Fail! with a chosen double picks its Hit Location freely
        let fateLocation = FifthEdition.enabled("Fate") && this.fields.useFate && Number(this.fields.fateRoll) % 11 == 0;
        if (!["roll", "none"].includes(this.fields.hitLocation) && !fateLocation)
        {
            if (FifthEdition.enabled("Modifiers"))
            {
                // 5e (p.167): a Called Shot costs -2 SL
                this.fields.slBonus -= 2;
                this.tooltips.add("slBonus", -2, game.i18n.localize('ROLL.CalledShot'))
            }
            else
            {
                this.fields.modifier -= 20;
                this.tooltips.add("modifier", -20, game.i18n.localize('ROLL.CalledShot'))
            }
        }
        if (game.settings.get("wfrp4e", "useGroupAdvantage"))
        {
          if (this.userEntry.charging)
          {
            this.fields.modifier += 10;
            this.tooltips.add("modifier", 10, game.i18n.localize('Charging'))
          }
        }
    }

    _computeDefending(attacker) 
    {
        super._computeDefending(attacker);
        let properties = this.item.properties;

        //if attacker is fast, and the defender is either 1. using a melee trait to defend, or 2. using a weapon without fast
        // 5e (p.304) rewrote Fast: the weapon adds 20 to its wielder's combat Initiative instead of penalising the
        // defence, so there is no modifier to convert here - the rule simply does not exist under 5e.
        if (!FifthEdition.enabled("Modifiers") && attacker.test.item.properties?.qualities.fast && this.item.attackType == "melee" && !properties?.qualities.fast) 
        {
            this.fields.modifier += -10
            this.tooltips.add("modifier", -10, game.i18n.localize('CHAT.TestModifiers.FastWeapon'))
        }

        if (properties.flaws.unbalanced)
        {
            this.fields.slBonus -= 1;
            this.tooltips.add("slBonus", -1, game.i18n.localize("PROPERTY.Unbalanced"))
        }

        if(attacker.test.item.properties?.qualities?.wrap)
        {
            this.fields.slBonus -= 1
            this.tooltips.add("slBonus", -1, game.i18n.localize('CHAT.TestModifiers.WrapDefend'));
        }

        // 5e (p.166): +1 SL when opposing a Melee Attack with a longer weapon
        if (FifthEdition.enabled("Modifiers") && this.item.attackType == "melee" && attacker.test.item?.attackType == "melee" && (this.item.reachNum || 0) > (attacker.test.item.reachNum || 0))
        {
            this.fields.slBonus += 1;
            this.tooltips.add("slBonus", 1, game.i18n.localize("FIFTHED.ReachDefence"));
        }

        //Size Differences
        let sizeDiff = game.wfrp4e.config.actorSizeNums[attacker.test.size] - this.actor.sizeNum
        //Positive means attacker is larger, negative means defender is larger
        if (sizeDiff >= 1) {
            //Defending against a larger target with a weapon
            if (this.item.attackType == "melee") {
                let slBonus = FifthEdition.enabled("Modifiers") ? -2 : (-2 * sizeDiff); // 5e (p.360): a flat -2 SL
                this.fields.slBonus += slBonus
                this.tooltips.add("slBonus", slBonus, game.i18n.localize('CHAT.TestModifiers.DefendingLarger'))
            }
        }
    }

    _computeTargets(target)
    {
        if (this.item.attackType == "ranged" && (Engagements.enabled ? Engagements.isEngaged(target.actor, target) : target.actor.statuses.has("engaged")))
        {
            if (FifthEdition.enabled("Modifiers"))
            {
                // 5e (p.167): shooting into melee is made with Disadvantage
                this.fields.disSources++;
                this.tooltips.add("disSources", 1, game.i18n.localize("EFFECT.ShootingAtEngagedTarget"));
            }
            else
            {
                this.fields.modifier -= 20;
                this.tooltips.add("modifier", -20, game.i18n.localize("EFFECT.ShootingAtEngagedTarget"));
                this.context.engagedModifier = -20;
            }
        }

        if (FifthEdition.enabled("Modifiers"))
        {
            this._computeSizeModifiers5e(target);
        }
        else
        {
            this._computeSizeModifiers4e(target);
        }

        this._computeMountModifiers(target);
    }

    /**
     * 5e (p.166): only Ranged Attacks care about the target's Size: +1 SL if larger (+2 if Monstrous), -1 SL if smaller (-2 if Tiny).
     */
    _computeSizeModifiers5e(target)
    {
        if (this.item.attackType != "ranged") return;
        let targetSize = target.actor.details.size.value;
        let sizeDiff = target.actor.sizeNum - this.actor.sizeNum;
        let sl = 0;
        if (sizeDiff > 0) sl = targetSize == "mnst" ? 2 : 1;
        else if (sizeDiff < 0) sl = targetSize == "tiny" ? -2 : -1;
        if (sl)
        {
            this.fields.slBonus += sl;
            this.tooltips.add("slBonus", sl, game.i18n.format("CHAT.TestModifiers.ShootingSizeModifier", { size: game.wfrp4e.config.actorSizes[targetSize] }));
        }
    }

    _computeSizeModifiers4e(target)
    {


        let sizeDiff = this.actor.sizeNum - target.actor.sizeNum
        let sizeModifier = 0
        // Attacking a larger creature with melee
        if (sizeDiff < 0 && (this.item.attackType == "melee" || target.actor.sizeNum <= 3))
        {
          sizeModifier += 10;
          this.tooltips.add("modifier", 10, game.i18n.localize('CHAT.TestModifiers.AttackingLarger'));
        }
        // Attacking a larger creature with ranged
        else if (this.item.attackType === "ranged")
        {
          if (target.actor.details.size.value == "tiny")
            sizeModifier -= 30
          if (target.actor.details.size.value == "ltl")
            sizeModifier -= 20
          if (target.actor.details.size.value == "sml")
            sizeModifier -= 10
          if (target.actor.details.size.value == "lrg")
            sizeModifier += 20
          if (target.actor.details.size.value == "enor")
            sizeModifier += 40
          if (target.actor.details.size.value == "mnst")
            sizeModifier += 60

          if (sizeModifier) 
          {
            const text = (game.i18n.format('CHAT.TestModifiers.ShootingSizeModifier', { size: game.wfrp4e.config.actorSizes[target.actor.details.size.value] }))
            this.tooltips.add("modifier", sizeModifier, text)
          }
        }
        
        if (sizeModifier)
        {
          this.context.sizeModifier = sizeModifier
          this.fields.modifier += sizeModifier
        }
    }

    _computeMountModifiers(target)
    {
        if (FifthEdition.enabled("Modifiers"))
        {
            return this._computeMountModifiers5e(target);
        }

        // Attacking a smaller creature from a mount
        if (this.actor.isMounted && this.item.attackType == "melee") 
        {
            let mountSizeDiff = this.actor.mount.sizeNum - target.actor.sizeNum
            if (target.actor.isMounted) 
            {                               // TODO this seems wrong
                mountSizeDiff = this.actor.mount.sizeNum - target.actor.sizeNum
            }

            if (mountSizeDiff >= 1) 
            {
                this.fields.modifier += 20;
                this.tooltips.add("modifier", 20, game.i18n.localize('CHAT.TestModifiers.AttackerMountLarger'));
            }
        }
        // Attacking a creature on a larger mount
        else if (this.item.attackType == "melee" && target.actor.isMounted) 
        {
            let mountSizeDiff = target.actor.mount.sizeNum - this.actor.sizeNum
            if (this.actor.isMounted) 
            {
                mountSizeDiff = target.sizeNum - this.actor.mount.sizeNum
            }
            if (mountSizeDiff >= 1) 
            {
                if ((this.item.reachNum || 0) >= 5) 
                {
                    // TODO this tooltip won't show up because 0 value
                    this.tooltips.add("modifier", 0, `${game.i18n.localize('CHAT.TestModifiers.IgnoreDefenderMountLarger')}`);
                }
                else 
                {
                    this.tooltips.add("modifier", -10, game.i18n.localize('CHAT.TestModifiers.DefenderMountLarger'));
                    this.fields.modifier -= 10;
                }
            }
        }
    }

    /**
     * 5e (p.168): mounted combat trades the 4e percentage modifiers for Advantage and Disadvantage.
     * A rider swinging a Cavalry weapon at anything smaller than their mount gains Advantage, and reaching past a
     * mount to hit its rider costs Disadvantage unless the weapon's reach is Long or greater.
     *
     * The two are separate bullets in the book rather than the 4e either/or, so a rider attacking another rider can
     * take both - which cancel, since sources cancel one for one (p.130).
     */
    _computeMountModifiers5e(target)
    {
        if (this.item.attackType != "melee") return;

        if (this.actor.isMounted && this.item.system?.weaponGroup?.value == "cavalry" && FifthEdition.sizeSteps(this.actor.mount, target.actor) >= 1)
        {
            this.fields.advSources++;
            this.tooltips.add("advSources", 1, game.i18n.localize('CHAT.TestModifiers.AttackerMountLarger'));
        }

        if (target.actor.isMounted && (this.item.reachNum || 0) < game.wfrp4e.config.reachNum.long && FifthEdition.sizeSteps(target.actor.mount, this.actor) >= 1)
        {
            this.fields.disSources++;
            this.tooltips.add("disSources", 1, game.i18n.localize('CHAT.TestModifiers.DefenderMountLarger'));
        }
    }

    async _onFieldChange(ev) 
    {
      // 5e (p.163): the Charge grants Momentum, but WeaponTest.handleChargeMomentum grants it when the Test is rolled
      // and _computeAdvantage already gives the charging attack its Advantage. Nudging the counter from here would
      // only clear Momentum the charger already had if they unticked the box - and the field is a checkbox besides.
      if (ev.currentTarget.name == "charging" && !FifthEdition.enabled("Momentum"))
      {
        if (!game.settings.get("wfrp4e", "useGroupAdvantage"))
        {
          let advantageField = ui.activeWindow.form.querySelector("[name='advantage']");
          
          if(ev.currentTarget.checked)
          {
            advantageField.value = Number(advantageField.value) + 1;
          }
          else 
          {
            advantageField.value = Math.max(0, Number(advantageField.value) - 1);
          }
          advantageField.dispatchEvent(new Event('change'));
        }
        else 
        {
          this.flags.charging = ev.currentTarget.checked;
        }
      }
        super._onFieldChange(ev)
    }
}