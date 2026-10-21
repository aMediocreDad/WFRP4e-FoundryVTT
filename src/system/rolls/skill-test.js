import WFRP_Utility from "../utility-wfrp4e.js";
import TestWFRP from "./test-wfrp4e.js"
import FifthEdition from "../fifth-edition.js";

export default class SkillTest extends TestWFRP {

  constructor(data, actor) {
    super(data, actor)
    if (!data)
      return
    this.data.preData.options.characteristicToUse = data.characteristicToUse
    this.data.preData.skillName = data.skillName
    this.data.preData.transferMomentum = !!data.transferMomentum;
    this.data.context.dispel = data.context.dispel;
    this.data.context.disengage = !!data.context.disengage; // 5e (p.163), resolved in OpposedTest.handleDisengage
    this.computeTargetNumber();
  }

  static fromData(...args)
  {
    return new this(...args);
  }

  computeTargetNumber() {

    // If unknown skill, defer until later, once skill is found
    if (this.preData.item == "unknown" && !this.context.unknownSkill)
      return 0

    try {
      // If skill is not owned by the actor, just use characteristic
      if (this.context.unknownSkill) {
        this.result.target = this.actor.characteristics[this.context.unknownSkill.system.characteristic.value].value
      }
      else {


        // Use skill total if characteristics match, otherwise add the total up manually
        if (this.preData.options.characteristicToUse && this.preData.options.characteristicToUse != this.item.characteristic.key)
          this.result.target = this.actor.characteristics[this.preData.options.characteristicToUse].value + this.item.advances.value
        else
          this.result.target = this.item.total.value
      }
    }
    catch
    {
      this.result.target = this.item.total.value
    }

    super.computeTargetNumber();
  }

  async roll() {

    // If skill id is unknown, meaning the actor doesn't have the skill, find the skill and use characteristic
    if (this.preData.item == "unknown") {
      let skill = await WFRP_Utility.findSkill(this.preData.skillName)
      if (skill) {
        this.context.unknownSkill = skill.toObject();
        this.computeTargetNumber();
      }
      else {
        throw new Error(game.i18n.localize("ERROR.Found", { name: this.skill }))
      }
    }


    await super.roll();
  }

  async postTest() {
    await super.postTest();
    await this.handleMomentumTransfer();
  }

  /**
   * 5e (p.169): Momentum is lost to make the Leadership Test; on a success it is granted to one ally
   * (the first targeted token, otherwise chosen from the player characters).
   * The cost is paid once; the grant follows the final outcome, so a reroll that turns the failure into a
   * success still hands the Momentum over.
   */
  async handleMomentumTransfer() {
    if (!FifthEdition.enabled("Momentum") || !this.preData.transferMomentum) {
      return;
    }
    if (!this.context.momentumTransferPaid) {
      this.context.momentumTransferPaid = true;
      await this.actor.setAdvantage(0);
    }
    if (!this.succeeded) {
      if (!this.context.momentumTransferGranted) {
        this.result.other.push(game.i18n.localize("FIFTHED.MomentumTransferFailed"));
      }
      return;
    }
    if (this.context.momentumTransferGranted) {
      return;
    }
    this.context.momentumTransferGranted = true;
    let ally = this.targets?.find(t => t.id != this.actor.id && t.status?.advantage);
    if (!ally) {
      let candidates = game.actors.filter(a => a.id != this.actor.id && a.type == "character" && a.status?.advantage);
      let chosen = await ItemDialog.create(candidates, 1, { title: game.i18n.localize("FIFTHED.TransferMomentum"), text: game.i18n.localize("FIFTHED.ChooseAlly") });
      ally = chosen?.[0];
    }
    if (ally) {
      await ally.setAdvantage(1);
      this.result.other.push(game.i18n.format("FIFTHED.MomentumTransferred", { name: ally.prototypeToken?.name || ally.name }));
    }
  }

  handleDispel()
  {
    let dispelTarget = game.messages.get(this.context.dispel)
    if (dispelTarget)
    {
      if (game.user.id == getActiveDocumentOwner(dispelTarget)?.id)
      {
        dispelTarget.system.test.updateDispel(this);
      }
    }
  }

  get skill() {
    return this.item
  }

  get item() {
    return this.unknownSkill ? this.unknownSkill : super.item || {}
  }
}
