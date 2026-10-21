import WFRP_Utility from "../utility-wfrp4e.js";
import AttackTest from "./attack-test.js";
import FifthEdition from "../fifth-edition.js";

export default class WeaponTest extends AttackTest {

  constructor(data, actor) {
    super(data, actor)
    if (!data)
      return
    this.preData.ammoId = data.ammo?.id // TODO vehicle shit
    this.preData.charging = data.charging || false;
    this.preData.infighter = data.infighter || !!actor?.has(game.i18n.localize("NAME.Infighter"), "talent"); // I don't like this but it's really awkward to implement with scripts
    this.preData.resolute = data.resolute || 0;
    this.preData.dualWielding = data.dualWielding || false;

    this.computeTargetNumber();
  }

  static fromData(...args)
  {
    return new this(...args);
  }

  computeTargetNumber() {
    let skill = this.item.system.getSkillToUse(this.actor);
    if (!skill)
      this.result.target = this.item.system.attackType == "ranged" ? this.actor.system.characteristics.bs.value : this.actor.system.characteristics.ws.value
    else
      this.result.target = skill.total.value

    super.computeTargetNumber();
  }

  async runPreEffects() {
    await super.runPreEffects();
    await Promise.all(this.actor.runScripts("preRollWeaponTest", { test: this, chatOptions: this.context.chatOptions }))
    await Promise.all(this.item.runScripts("preRollWeaponTest", { test: this, chatOptions: this.context.chatOptions }))
  }

  async runPostEffects() {
    await super.runPostEffects();
    await Promise.all(this.actor.runScripts("rollWeaponTest", { test: this, chatOptions: this.context.chatOptions }))
    await Promise.all(this.item.runScripts("rollWeaponTest", { test: this, chatOptions: this.context.chatOptions }))
    Hooks.call("wfrp4e:rollWeaponTest", this, this.context.chatOptions)
  }


  async roll() {

    if (this.options.dualWieldOffhand && this.options.offhandReverse)
      this.preData.roll = this.options.offhandReverse

    await super.roll()
  }

  async computeResult()
  {
    await super.computeResult()
    this.computeMisfire();
    this.computeDualWielder();
  }


  async calculateDamage() {
    super.calculateDamage(this.result.SL);
    let weapon = this.weapon;

    if ((weapon.damage.dice || weapon.ammo?.damage.dice) && !this.result.additionalDamage) {
      let roll = await new Roll(weapon.damage.dice + `${weapon.ammo?.damage.dice ? "+" + weapon.ammo?.damage.dice : "" }`).roll({allowInteractive : false})
      this.result.diceDamage = { value: roll.total, formula: roll.formula };
      this.preData.diceDamage = this.result.diceDamage
      this.result.additionalDamage += roll.total;
      this.context.breakdown.damage.other.push({label : game.i18n.format("BREAKDOWN.Dice"), value : roll.total});
      this.preData.additionalDamage  = this.result.additionalDamage;
    }

    //@HOUSE
    if (game.settings.get("wfrp4e", "homebrew").mooRangedDamage)
    {
      game.wfrp4e.utility.logHomebrew("mooRangedDamage")
      if (weapon.isRanged)
      {
        let damageMod = (Math.floor(this.targetModifiers / 10) || 0)
        this.result.damage -= damageMod
        this.context.breakdown.damage.other.push({label : game.i18n.localize("BREAKDOWN.Moo"), value : -damageMod});
        if (this.result.damage < 0)
          this.result.damage = 0
      }
    }
    //@/HOUSE
  }

  async postTest() {
    await super.postTest()

    await this.handleAmmo();
    await this.handleChargeMomentum();
  }

  /**
   * 5e (p.163): a Charge grants Momentum. Granted once per test, before the outcome is checked, so an opposed charge
   * carries it into the opposed resolution, where the result of the contest decides whether it is kept.
   * The dialog deliberately leaves the counter alone while charging (AttackDialog._onFieldChange), so this is the
   * only place the Charge's Momentum is granted; the dialog's Advantage for the charging attack is separate.
   */
  async handleChargeMomentum() {
    if (!FifthEdition.enabled("Momentum") || !this.preData.charging || this.item.attackType != "melee" || this.context.momentumCharged) {
      return;
    }
    this.context.momentumCharged = true;
    if (!(this.actor.status?.advantage?.value > 0)) {
      await this.actor.setAdvantage(1);
    }
    this.result.other.push(game.i18n.localize("FIFTHED.MomentumCharge"));
  }

  /**
   * 5e (p.163): a Charge grants Momentum. Granted once per test, before the outcome is checked, so an opposed charge
   * carries it into the opposed resolution, where the result of the contest decides whether it is kept.
   * The dialog deliberately leaves the counter alone while charging (AttackDialog._onFieldChange), so this is the
   * only place the Charge's Momentum is granted; the dialog's Advantage for the charging attack is separate.
   */
  async handleAmmo()
  {
    // Only subtract ammo on the first run, so not when edited, not when rerolled
    if (this.item.system.ammo && this.item.system.consumesAmmo.value && !this.context.edited && !this.context.reroll && !this.context.fortuneUsedAddSL) {
      await this.item.system.ammo.update({ "system.quantity.value": this.item.system.ammo.quantity.value - 1 })
    }
    else if (this.preData.ammoId && this.item.system.consumesAmmo.value && !this.context.edited && !this.context.reroll && !this.context.fortuneUsedAddSL) {
      let ammo = this.actor.items.get(this.preData.ammoId)
      await ammo.update({ "system.quantity.value": this.actor.items.get(this.preData.ammoId).quantity.value - 1 })
    }


    if (this.item.system.loading && !this.context.edited && !this.context.reroll && !this.context.fortuneUsedAddSL) {
      this.item.system.loaded.amt--;
      if (this.item.system.loaded.amt <= 0) {
        this.item.system.loaded.amt = 0
        this.item.system.loaded.value = false;

        let item = await this.item.update({ "system.loaded.amt": this.item.system.loaded.amt, "system.loaded.value": this.item.system.loaded.value });
      }
      else {
        await this.item.update({ "system.loaded.amt": this.item.system.loaded.amt })
      }
    }
  }

  computeDualWielder() 
  {
    this.result.canDualWield = !this.weapon.system.offhand.value && this.actor.has(game.i18n.localize("NAME.DualWielder"), "talent") && !this.actor.noOffhand && !this.context.edited;
  }

  computeMisfire() {
    let weapon = this.weapon;

    /**
     * 5e (p.165): a Blackpowder, Engineering or Explosive weapon Misfires on 99 or 00 and rolls the Misfire Table
     * in place of the Oops! Table. Only the flag is set here - result.tables does not exist yet at this point in
     * the pipeline (TestWFRP.roll calls computeResult before computeTables), so the link swap is in computeTables.
     *
     * `result.misfire` is deliberately left unset on this path: test-card.hbs renders it as its own link carrying
     * inline damage, which is precisely the 4e behaviour the rule replaces.
     */
    if (FifthEdition.enabled("Misfire")) {
      if (this.result.fumble && FifthEdition.misfires(this.result.roll, weapon.system.weaponGroup?.value)) {
        this.result.misfireTable = true;
      }
      return;
    }

    // Blackpowder/engineering/explosive weapons misfire on an even fumble
    if (this.result.fumble && 
      ["blackpowder", "engineering", "explosives"].includes(weapon.system.weaponGroup.value) && 
      this.result.roll % 2 == 0) 
    {
      this.result.misfire = game.i18n.localize("Misfire")
      this.result.misfireDamage = (0, eval)(parseInt(this.result.roll.toString().split('').pop()) + weapon.system.Damage)
    }
  }

  /**
   * 5e (p.165): the Misfire Table replaces the Oops! Table. super builds the Fumble entry pointing at `oops`; this
   * retargets that one link, keeping its position and its `fumble-roll` styling. The table is resolved by its
   * `wfrp4e.key` flag (WFRP_Tables.findTable), never by name or id.
   */
  computeTables() {
    super.computeTables();
    if (this.result.misfireTable && this.result.tables.fumble) {
      this.result.tables.fumble.label = game.i18n.localize("Misfire");
      this.result.tables.fumble.key = "misfire";
    }
  }

  get weapon() {
    return this.item
  }

  get vehicle() {
    if (this.options.vehicle)
      return WFRP_Utility.getSpeaker(this.options.vehicle)
  }

  get item() {
    let actor = this.vehicle || this.actor
    if (typeof this.preData.item == "string")
      return actor.items.get(this.preData.item)
    else
      return new CONFIG.Item.documentClass(this.preData.item, { parent: actor })
  }
}
