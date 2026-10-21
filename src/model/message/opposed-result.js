import EditionManager from "../../apps/edition-manager";
import WFRP_Utility from "../../system/utility-wfrp4e";
import FifthEdition from "../../system/fifth-edition.js";

let fields = foundry.data.fields;
export class OpposedTestMessage extends WarhammerMessageModel 
{
    static defineSchema() 
    {
        let schema = {};
        schema.opposedTestData = new fields.ObjectField();
        schema.handlerId = new fields.StringField();
        return schema;
    }

    get opposedTest() 
    {
        return EditionManager.getOpposedTest().recreate(this.opposedTestData);
    }

    static async create(opposedTest, options, handler)
    {
      let opposeData = opposedTest.data
      let opposeResult = opposedTest.result

      let html = await foundry.applications.handlebars.renderTemplate("systems/wfrp4e/templates/chat/roll/opposed-result.hbs", opposeResult)
      let chatOptions = {
        user: game.user.id,
        type : "opposed",
        content: html,
        flags : {
          "dice-so-nice" : { linkedTo : handler.data.defenderMessageId }
        },
        system : {
          opposedTestData: opposeData,
          handlerId: handler.message.id,
        },
        speaker : {alias : "Opposed Result"},
        author : getActiveDocumentOwner(opposedTest.defender)?.id,
        whisper: options.whisper,
        blind: options.blind,
      }
      return await ChatMessage.create(chatOptions);
    }

    async renderMessage()
    {
      let content = await foundry.applications.handlebars.renderTemplate("systems/wfrp4e/templates/chat/roll/opposed-result.hbs", this.opposedTest.result);
      return await this.parent.update({content})
    }

    async onRender(html)
    {
      warhammer.utility.replacePopoutTokens(html);

      // A public contest may include a private NPC roll. Only expose both SL
      // snapshots to the GM or a viewer who owns both participants.
      const ownsBoth = ["attackerTestData", "defenderTestData"].every(key =>
        game.wfrp4e.utility.getSpeaker(this.opposedTestData[key]?.context.speaker || {})?.isOwner);
      if (!game.user.isGM && !ownsBoth)
      {
        html.querySelector(".opposed-resolution")?.remove();
      }

      // Remove applied damage tooltip
      if (!game.wfrp4e.utility.getSpeaker(this.opposedTestData.defenderTestData?.context.speaker || {})?.isOwner)
      {
        html.querySelector(".applied-breakdown")?.remove();
      }
    }

    static get actions() 
    { 
        return foundry.utils.mergeObject(super.actions, {
            applyDamage : this.onApplyDamage,
            applyHack : this.onApplyHack,
            rollDualWielder : this.onRollDualWielder,
            executeAction: this.onExecuteAction
        });
    }

    static async onApplyDamage(ev)
    {
      let opposedTest = this.opposedTest;
  
      if (!opposedTest.defenderTest.actor.isOwner)
        return ui.notifications.error(game.i18n.localize("ErrorDamagePermission"));
  
      // system.applyDamage is the 5e version
      let damageFunction = 
      !!game.wfrp5e 
      ? opposedTest.defenderTest.actor.system.applyDamage.bind(opposedTest.defenderTest.actor.system) 
      : opposedTest.defenderTest.actor.applyDamage.bind(opposedTest.defenderTest.actor);

      let damageMsg = await damageFunction.bind(opposedTest.defenderTest.actor)(opposedTest.result.damage.value, {opposedTest});
      this.updateResultMessage(damageMsg);
    }
  
    static async onApplyHack(ev)
    {
        let opposedTest = this.opposedTest;
        const type = ev.target.innerText;
  
      if (!opposedTest.defenderTest.actor.isOwner)
        return ui.notifications.error("ErrorArmourDamagePermission", {localize : true})
  
      let loc = opposedTest.result.hitloc.value
      let armour = opposedTest.defenderTest.actor.physicalNonDamagedArmourAtLocation(loc);
      if (armour.length)
      {
        let chosen = await ItemDialog.create(armour, 1, {text : game.i18n.localize("DIALOG.ChooseArmour"), title : type});
        if (chosen[0])
        {
          chosen[0].system.damageItem(1, [loc])
          ChatMessage.create({content: `<p>${game.i18n.format("CHAT.DamageToArmour",  {item: `@UUID[${chosen[0].uuid}]{${chosen[0].name}}`, type: type} )}</p>`, speaker : ChatMessage.getSpeaker({actor : opposedTest.attackerTest.actor})})
        }
      }
      else 
      {
        return ui.notifications.error("ErrorNoArmourToDamage", {localize : true})
      }
    }

    static async onRollDualWielder(event)
    {
      let attackerTest = this.opposedTest.attackerTest;
  
      let offHandData = foundry.utils.duplicate(attackerTest.preData)

      let targets = null;
      if (game.user.targets.size)
      {
        targets = Array.from(game.user.targets)
      }
      else 
      {
        targets = attackerTest.targetTokens.map(i => i.object);
        ui.notifications.info("No Targets - Directing offhand attack at the same target as the primary attack")
      }
  
      let offhandWeapon = attackerTest.actor.itemTags["weapon"].find(w => w.offhand.value);
      if (!offhandWeapon)
      {
        return ui.notifications.warn("FIFTHED.NoOffhandWeapon", { localize: true });
      }

      // Applied only once the attack is going ahead, so bailing out below does not leave the effect behind
      if (!attackerTest.actor.hasSystemEffect("dualwielder"))
      {
        await attackerTest.actor.addSystemEffect("dualwielder")
      }

      let dualWielder = attackerTest.actor.has(game.i18n.localize("NAME.DualWielder"), "talent");
      let spentMomentum = false;
      if (FifthEdition.enabled("Momentum") && !dualWielder)
      {
        // 5e (p.167): the second attack costs Momentum unless you have Dual Wielder. Charged before the dialog
        // opens, because by the time the attack is made the Momentum is gone and grants it no Advantage (p.168).
        if (!(attackerTest.actor.status?.advantage?.value > 0))
        {
          return ui.notifications.warn("FIFTHED.NoMomentum", { localize: true });
        }
        await attackerTest.actor.setAdvantage(0);
        spentMomentum = true;
      }

      if (attackerTest.result.roll % 11 == 0 || attackerTest.result.roll == 100) {
        delete offHandData.roll
      }
      else 
      {
        let offhandRoll = attackerTest.result.roll.toString();
        if (offhandRoll.length == 1)
        {
          offhandRoll = offhandRoll[0] + "0"
        }
        else
        {
          offhandRoll = offhandRoll[1] + offhandRoll[0]
        }
        offHandData.roll = Number(offhandRoll);
      }
  
      // 4e Dual Wielder reuses the reversed roll; the 5e second attack is a fresh Melee Test (p.167)
      let offhandReverse = FifthEdition.enabled("Momentum") ? undefined : offHandData.roll;
      let test = await attackerTest.actor.setupWeapon(offhandWeapon, { appendTitle: ` (${game.i18n.localize("SHEET.Offhand")})`, dualWieldOffhand: true, offhandReverse, targets});
      if (!test)
      {
        // Dialog cancelled, so no attack was made - hand the Momentum back rather than charging for nothing
        if (spentMomentum)
        {
          await attackerTest.actor.setAdvantage(1);
        }
        return;
      }
      if (spentMomentum)
      {
        ChatMessage.create(WFRP_Utility.chatDataSetup(game.i18n.format("FIFTHED.SpendMomentumText", { name: attackerTest.actor.prototypeToken?.name || attackerTest.actor.name, reason: game.i18n.localize("FIFTHED.SpendOffhand") })));
      }
      await test.roll();

      if (FifthEdition.enabled("Qualities") && offhandWeapon.properties.qualities.parry)
      {
        // 5e Parry (p.304): a second attack made with a Parry weapon after a hit is Unopposed
        for (let message of test.opposedMessages)
        {
          await message.system.opposedHandler.resolveUnopposed();
        }
        ChatMessage.create(WFRP_Utility.chatDataSetup(game.i18n.localize("FIFTHED.ParryUnopposed")));
      }
    }

    
    static async onExecuteAction(ev, target)
    {
      this.opposedTest.executeAction(target.dataset)
    }

    // Update starting message with result
    async updateResultMessage(damageConfirmation) {
        this.opposedTestData.opposeResult.confirmation = damageConfirmation;
        await this.parent.update({"system.opposedTestData.opposeResult.confirmation" : damageConfirmation});
        this.renderMessage()
    }
}