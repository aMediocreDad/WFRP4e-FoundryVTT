import TestWFRP from "./test-wfrp4e.js"
import ItemWFRP4e from "../../documents/item.js";
import FifthEdition from "../fifth-edition.js";

export default class AttackTest extends TestWFRP {


  async computeResult() {
    await super.computeResult();

    this.computeProperties();

    await this.calculateDamage()

    this.applyFateCriticalLocation();

    await this.computeCriticalLocation();

    return this.result;
  }

  /**
   * Whether this Test is the p.133 case where Fate chose a Critical: the point is being spent, and the result chosen
   * is a double. AttackDialog computes the same thing from its own fields to waive the Called Shot cost, so the two
   * have to agree - a Called Shot waived here and charged there, or the reverse, is a free or double penalty.
   * Asked once so the pick and the waiver cannot drift apart.
   */
  get fateChoseCritical() {
    return FifthEdition.enabled("Fate") && !!this.preData.useFate && Number(this.preData.fateRoll) % 11 == 0;
  }

  /** Whether a specific Hit Location was named, rather than "roll", "none" or nothing at all */
  get hasCalledShot() {
    return !!this.preData.hitLocation && !["roll", "none", ""].includes(this.preData.selectedHitLocation);
  }

  /**
   * 5e (p.167): AttackDialog waives the Called Shot cost for a Fate-chosen Critical, because picking the location is
   * part of what the Fate Point buys (p.133). If the point could not be paid, the pick was not bought either, so the
   * waiver has to come back off - otherwise a refused spend leaves a free Called Shot behind and the Test has not,
   * after all, proceeded unmodified.
   *
   * Lives here rather than in TestWFRP.spendFate because the Called Shot is an attack rule and the waiver is
   * AttackDialog's. Both fields are read later: slBonus by computeResult, testModifier through targetModifiers.
   */
  async spendFate() {
    let wasAsked = this.fateChoseCritical;
    await super.spendFate();
    if (!wasAsked || this.preData.useFate || !this.hasCalledShot) {
      return; // never asked, or the point was paid and the waiver stands
    }
    if (FifthEdition.enabled("Modifiers")) {
      this.preData.slBonus -= 2;
    }
    else {
      this.preData.testModifier -= 20;
    }
  }

  /**
   * 5e (p.133), I Will Not Fail!: "If you choose to score a Critical, you may pick the Hit Location instead of rolling
   * randomly." So a Fate-chosen double that also names a Hit Location overrides p.171's fresh roll with the pick.
   *
   * Written into preData rather than handled in computeCriticalLocation, because that is already the seam: the roll
   * there is skipped whenever preData.critHitloc holds a value. AttackDialog decides the same thing to waive the
   * Called Shot cost, but a novel dialog field could not reach the test - TestWFRP's constructor builds preData from
   * an explicit list of keys - so the predicate is restated here from the preData it does carry.
   *
   * Gated on CriticalHits as well as Fate, because computeCriticalLocation is: with that toggle off nothing consumes
   * preData.critHitloc, but reset() would still copy the bare number into result.critHitloc on a later edit or addSL,
   * and computeTables would then point the Critical link at "critundefined". Nothing is lost by staying out - with
   * CriticalHits off the Critical already lands on result.hitloc, which is the picked location.
   *
   * preData.critHitloc is a d100 roll value, not a location key, so the pick goes through hitLocKeyToResult, which
   * returns the low end of that location's range on the actor's own hit location table. If the table is missing it
   * returns undefined, and computeCriticalLocation falls back to rolling.
   */
  applyFateCriticalLocation() {
    if (!FifthEdition.enabled("CriticalHits") || !this.fateChoseCritical || !this.hasCalledShot) {
      return;
    }
    if (Number.isNumeric(this.preData.critHitloc)) {
      return;
    }
    let location = game.wfrp4e.tables.hitLocKeyToResult(this.preData.selectedHitLocation);
    if (Number.isNumeric(location?.roll)) {
      this.preData.critHitloc = location.roll;
    }
  }

  /**
   * 5e (p.171): the Critical Wound from a Critical Hit lands on a freshly rolled Hit Location, not the reversed attack roll.
   * The extra roll is kept in preData so edits and re-renders reuse it.
   */
  async computeCriticalLocation() {
    if (!FifthEdition.enabled("CriticalHits") || !this.result.critical || !this.result.hitloc) {
      return;
    }
    if (!Number.isNumeric(this.preData.critHitloc)) {
      this.preData.critHitloc = (await game.wfrp4e.tables.rollTable("hitloc", { hideDSN: true })).roll;
    }
    this.result.critHitloc = await game.wfrp4e.tables.rollTable("hitloc", { lookup: this.preData.critHitloc, hideDSN: true });
    this.result.critHitloc.description = game.i18n.localize(this.result.critHitloc.description);
    this.result.other.push(game.i18n.format("FIFTHED.CriticalHitLocation", { location: this.result.critHitloc.description }));
  }

  /** Hit Location the Critical Wound from a Critical Hit lands on */
  get criticalLocation() {
    return this.result.critHitloc?.result || this.result.hitloc?.result;
  }

  async postTest()
  {
    await super.postTest();
    let target = this.targets[0];
    if (target && target.type != "vehicle" && this.result.hitloc) 
    {
      let impenetrable = false
      let AP = target.status.armour[this.criticalLocation]
      for(let layer of AP.layers)
      {
        if (layer.impenetrable)
          impenetrable = true;
      }
      if (this.result.critical && impenetrable && this.result.roll % 2 != 0) {
        if (this.result.tables.critical)
        {
          this.result.tables.critical.nulled = true
          this.result.tables.critical.label = `${game.i18n.localize("CHAT.CriticalsNullified")} (${game.i18n.localize("PROPERTY.Impenetrable")})`;
        }
      }
    }
  }

  computeProperties()
  {
    if (this.failed) {
      // Dangerous weapons fumble on any failed tesst including a 9
      if (this.result.roll % 11 == 0 || this.result.roll == 100 || (this.item.properties.flaws.dangerous && this.result.roll.toString().includes("9"))) {
        this.result.fumble = game.i18n.localize("Fumble")
      }
      if (this.item.properties.flaws.unreliable)
        this.result.SL--;
      if (this.item.properties.qualities.practical)
        this.result.SL++;

      if (this.item.weaponGroup?.value == "throwing")
        this.result.scatter = game.i18n.localize("Scatter");
    }
    else // if success
    {
      if (this.result.roll % 11 == 0)
        this.result.critical = game.i18n.localize("Critical")

      // Impale weapons crit on 10s numbers
      if (this.item.properties.qualities.impale && this.result.roll % 10 == 0)
        this.result.critical = game.i18n.localize("Critical")

      if (this.result.critical && this.item.properties.qualities.slash)
      {
          this.result.other.push(`${game.i18n.format("PROPERTY.SlashAlert", {value : parseInt(this.item.properties.qualities.slash.value)})}`)
      }
    }
  }

  computeTables()
  {
    super.computeTables();
    if (this.result.scatter)
    {
      this.result.tables.scatter = {
        label : this.result.scatter,
        key : "scatter"
      }
    }
    // 5e (p.171): point the Critical table link at the freshly rolled location computeCriticalLocation picked
    if (this.result.critHitloc && this.result.tables.critical)
    {
      this.result.tables.critical.key = `crit${this.result.critHitloc.result}`;
      this.result.tables.critical.label += ` (${this.result.critHitloc.description})`;
    }
  }

  async calculateDamage(base)
  {
    let damageBreakdown = this.result.breakdown.damage;

    this.result.additionalDamage = this.preData.additionalDamage || 0

    let damageToUse = base; // Start out normally, with SL being the basis of damage
    damageBreakdown.base = `${base} (${game.i18n.localize("SL")})`;
    
    if (this.useMount && this.actor.mount.characteristics.s.bonus > this.actor.characteristics.s.bonus)
    {
      let itemDamage = this.item.Damage;
      let mountDamage = this.item.mountDamage;

      this.result.damage = (0, eval)(mountDamage + Number(damageToUse))
      damageBreakdown.item = `+${itemDamage} (${this.item.system.damage?.value || this.item.system.specification.value})`;
      if (itemDamage != mountDamage)
      {
        damageBreakdown.other.push({label : game.i18n.localize("Mount"), value : mountDamage - itemDamage});
      }
    }
    else
    {
      this.result.damage = (0, eval)(this.item.Damage + Number(damageToUse));
      damageBreakdown.item = `+${this.item.Damage} (${this.item.system.damage?.value || this.item.system.specification.value})`;
    }

    if (this.result.charging && !this.result.other.includes(game.i18n.localize("Charging")))
    {
      this.result.other.push(game.i18n.localize("Charging"));
    }

    if ((this.item.properties.flaws.tiring && this.result.charging) || !this.item.properties.flaws.tiring) 
    {
      let unitValue = Number(this.result.roll.toString().split("").pop());
      unitValue = unitValue == 0 ? 10 : unitValue; // If unit value == 0, use 10

      if (this.item.properties.qualities.damaging && unitValue > Number(this.result.SL))
      {
        base = unitValue; // If damaging, instead use the unit value if it's higher
        damageBreakdown.base = `${unitValue} (${game.i18n.localize("Damaging")})`;
      }

      if (this.useMount && this.actor.mount.characteristics.s.bonus > this.actor.characteristics.s.bonus)
        this.result.damage = (0, eval)(this.item.mountDamage + Number(damageToUse))
      else
        this.result.damage = (0, eval)(this.item.Damage + Number(damageToUse));

      // Add unit die value to damage if impact
      if (this.item.properties.qualities.impact)
      {
        this.result.damage += unitValue;
        damageBreakdown.other.push({label : game.i18n.localize("PROPERTY.Impact"), value : unitValue})
      }
    }

    if (this.item.properties.qualities.spread)
    {
      let value = (Number(this.item.properties.qualities.spread.value) || 0)
      if (this.preData.options.rangeBand == game.i18n.localize("Point Blank"))
      {
        this.result.additionalDamage += value;        
        this.result.damage += value;
        damageBreakdown.other.push({label : `${game.i18n.localize("PROPERTY.Spread")} - ${game.i18n.localize("Point Blank")}` , value : value})
        this.preData.other.push(game.i18n.format("CHAT.SpreadPointBlank", {damage : value}))
      }
      else if (this.preData.options.rangeBand == game.i18n.localize("Extreme"))
      {
        this.result.additionalDamage -= value;        
        this.result.damage -= value;
        damageBreakdown.other.push({label : `${game.i18n.localize("PROPERTY.Spread")} - ${game.i18n.localize("Extreme")}` , value : -value})
        this.preData.other.push(game.i18n.format("CHAT.SpreadExtreme", {damage : value}))
      }
    }
  }

  get canUseCriticalDeflection() {
    let result = false;
    const hitLoc = this.data.result.hitloc?.result;
    if (hitLoc) {
      this.targets.forEach(target => {
        if (this.isCritical && !(game.settings.get("wfrp4e", "homebrew").mooCriticalMitigation) && !FifthEdition.enabled("NoCriticalDeflection") && target.physicalNonDamagedArmourAtLocation(hitLoc).length > 0) {
          result = true;
        }
      })
    }
    return result;
  }
}