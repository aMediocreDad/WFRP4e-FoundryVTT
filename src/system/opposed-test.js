import WFRP_Audio from "./audio-wfrp4e.js";
import WomCastTest from "./rolls/wom-cast-test.js";
import WFRP_Utility from "./utility-wfrp4e.js";
import FifthEdition from "./fifth-edition.js";
import { resolveOpposedWinner } from "./rolls/breakdown.js";


export default class OpposedTest {
  constructor(attackerTest = undefined, defenderTest = undefined, opposeResult = {
      modifiers: {
        attacker: {
          target: 0,
          SL: 0
        },
        defender: {
          target: 0,
          SL: 0
        },
        message: []
      }
    }) {
      
    this.data = {
      attackerTestData: attackerTest?.data,
      defenderTestData: defenderTest?.data,
      opposeResult
    }

    this.attackerTest = attackerTest
    this.defenderTest = defenderTest;
  }
  get opposeResult() { return this.data.opposeResult }
  get result() { return this.data.opposeResult }
  get attacker() { return this.attackerTest.actor }
  get defender() { return this.defenderTest.actor }

  static recreate(data)
  {
    let opposedTest = new OpposedTest();
    opposedTest.data = data;
    opposedTest.createAttackerTest(data.attackerTestData);
    opposedTest.createDefenderTest(data.defenderTestData);
    return opposedTest;
  }

  _createTest(testData) {
    if (!testData)
      return testData
    let test = game.wfrp4e.rolls.TestWFRP.recreate(testData)
    test.data = testData
    return test
  }

  createAttackerTest(testData) {
    this.attackerTest = this._createTest(testData)
    this.data.attackerTestData = testData
  }

  createDefenderTest(testData) {
    this.defenderTest = this._createTest(testData)
    this.data.defenderTestData = testData
  }

  createUnopposedDefender(actor) {
    this.defenderTest = new game.wfrp4e.rolls.CharacteristicTest({
      item: "ws",
      SL: 0,
      target: 0,
      roll: 0,
      unopposedTarget: true,
    }, actor)
    this.defenderTest.data.context.unopposed = true;
    this.data.defenderTestData = this.defenderTest.data
  }


  /*Known Bugs: attempting to reroll causes it to not reroll at all, actually. Manually editing cards causes a duplicate result card at the end.
*
*
*
*/
  checkPostModifiers(modifiers) {

    // Things to Check:
    // Weapon Length DONE
    // Fast Weapon Property DONE
    // Size 
    // Done - Weapon Defending: You suﬀer a penalty of –2 SL for each step larger your opponent is when using Melee to defend an Opposed Test
    // Done - To Hit Modifiers: +10 Bonus if smaller
    // Done - Ranged to Hit Modifiers : You gain a hefty bonus when shooting at larger targets (Ex. +40 to hit Enormous).
    //Shooting at smaller targets?

    // 5e (p.166) gives the defender +1 SL in the roll dialog instead, see AttackDialog._computeDefending
    if (game.settings.get("wfrp4e", "weaponLength") && !FifthEdition.enabled("Modifiers") && this.attackerTest.weapon && this.defenderTest.weapon && this.attackerTest.weapon.attackType == "melee" && this.defenderTest.weapon.attackType == "melee") {
      let attackerReach = this.attackerTest.item.reachNum;
      let defenderReach = this.defenderTest.item.reachNum;
      if (defenderReach > attackerReach && !this.attackerTest.result.infighter) {
        modifiers.message.push(game.i18n.format(game.i18n.localize('CHAT.TestModifiers.WeaponLength'), { defender: this.defenderTest.actor.prototypeToken.name, attacker: this.attackerTest.actor.prototypeToken.name }))
        modifiers.attacker.target += -10;
      }
    }

    return modifiers;
  }

  /**
    * Main Opposed test evaluation logic. Takes attacker and defender test data and 
    * determines who won, by how much, etc. Displays who won accordingly, with different
    * logic for manual and targeted opposed tests
    * 
    * @param {Object} attacker Attacker data
    * @param {Object} defender Defender Data
    * @param {Object} options Targeted?
    */
  /**
   * Whether a test is a Melee Test in the 5e sense. Shares FifthEdition.isMeleeItem with the roll dialog, so the
   * Momentum a contest awards and the Advantage Momentum grants can never disagree about what a Melee Test is.
   */
  static isMeleeTest(test) {
    if (!test || test.context?.unopposed) return false;
    return FifthEdition.isMeleeItem(test.item);
  }

  /**
   * Whether a test is an Opposed Strength Test in the 5e sense: a Strength Characteristic Test, which is what a
   * Grapple resolves with (p.167).
   *
   * p.360 reads "During Opposed Strength Tests (and similar)", and "and similar" cannot be recognised from a skill
   * name without guessing, so a caller declares itself instead - a Climb-style contest passes `sizeContest` in the
   * Test's setup context. Read from both places it can land: `context` is the whitelist TestWFRP copies known keys
   * into, `preData.options` is the raw setup context every other key survives in.
   */
  static isStrengthTest(test) {
    if (!test || test.context?.unopposed) return false;
    return test.preData?.item === "s" || !!test.context?.sizeContest || !!test.preData?.options?.sizeContest;
  }

  /**
   * 5e Size (p.360): in an Opposed Strength Test a creature two or more Size steps larger wins automatically, and
   * one a single step larger wins unless the smaller creature scores a Critical, in which case SL decide as normal.
   * Applied by lifting the larger creature's SL above its opponent's, the way the Fate rule below does, so the rest
   * of the evaluation - ties, damage, hit location - carries on untouched.
   *
   * @param {number} attackerSL
   * @param {number} defenderSL
   * @returns {{attackerSL: number, defenderSL: number}} possibly adjusted SL
   */
  overpowerBySize(attackerSL, defenderSL) {
    if (!FifthEdition.enabled("Size") || !OpposedTest.isStrengthTest(this.attackerTest) || !OpposedTest.isStrengthTest(this.defenderTest)) {
      return { attackerSL, defenderSL };
    }
    let steps = FifthEdition.sizeSteps(this.attacker, this.defender);
    if (!steps) return { attackerSL, defenderSL };

    let attackerLarger = steps > 0;
    let smaller = attackerLarger ? this.defenderTest : this.attackerTest;
    if (Math.abs(steps) < 2 && smaller.isCriticalFumble == "critical") {
      return { attackerSL, defenderSL };
    }

    let larger = attackerLarger ? this.attacker : this.defender;
    if (attackerLarger && attackerSL <= defenderSL) {
      attackerSL = defenderSL + 1;
    }
    else if (!attackerLarger && defenderSL <= attackerSL) {
      defenderSL = attackerSL + 1;
    }
    else {
      return { attackerSL, defenderSL }; // Already winning on SL, nothing to force
    }
    this.result.other.push(game.i18n.format("FIFTHED.SizeOverpower", { name: larger.prototypeToken?.name || larger.name }));
    return { attackerSL, defenderSL };
  }

  /**
   * 5e Momentum (p.168): the winner of an Opposed Melee Test gains it, the loser loses it.
   *
   * "Opposed Melee Test" is read as the name of the whole contest, not of one side's roll, so how the defender
   * answered a Melee Attack makes no difference - dodging it wins the same Opposed Melee Test that parrying it does.
   * Which side initiated is likewise irrelevant. That keeps Momentum a pure function of the final result, so a
   * reroll or an edit that flips the winner also flips the Momentum, with no bookkeeping to get out of step.
   *
   * The attack being opposed has to be the Melee Test: parrying an arrow is not a Melee Attack and grants nothing.
   * "Against an opponent in combat" is taken literally, so a manual Opposed Melee Test outside an encounter - an
   * arm-wrestle, a shoving match - moves no Momentum.
   */
  async handleMomentum() {
    if (!game.combat?.active || !OpposedTest.isMeleeTest(this.attackerTest)) return;
    // A target who takes the hit unopposed never made a Test, so there was no Opposed Melee Test to win. They still
    // lose Momentum to the Damage, which applyDamage handles.
    if (this.defenderTest?.context?.unopposed) return;

    let winner = this.result.winner == "attacker" ? this.attacker : this.defender;
    let loser = this.result.winner == "attacker" ? this.defender : this.attacker;

    if (winner?.status?.advantage && winner.status.advantage.value < 1) {
      await winner.setAdvantage(1);
      this.result.other.push(game.i18n.format("FIFTHED.MomentumGained", { name: winner.prototypeToken?.name || winner.name }));
    }
    if (loser?.status?.advantage?.value > 0) {
      await loser.setAdvantage(0);
      this.result.other.push(game.i18n.format("FIFTHED.MomentumLostBy", { name: loser.prototypeToken?.name || loser.name }));
    }
  }

  /**
   * 5e (p.163): Disengaging without Momentum is an Action - a Dodge or Perform (Acrobatics) Test opposed by the
   * highest Melee Skill among the foes you are Engaged with. Win and you are no longer Engaged; lose and your
   * opponent gains Momentum while you remain Engaged.
   *
   * Read off the contest rather than off the disengager's own roll, for the same reason handleMomentum is: a reroll
   * or an edit that flips the winner then flips the consequence with it. Unlike Momentum this does apply when the
   * opponent declines to oppose - the disengager still made the Test, and failing it still costs them the exit.
   *
   * "Should you fail, your opponents gain Momentum and you remain Engaged" is plural, and only one of them is left
   * in hand here, so the set FifthEdition.disengage captured travels with the Test as UUIDs and is resolved back
   * to Actors here. It falls back to the defender for a Test rolled before this shipped, or edited into an opposed
   * pair by hand, neither of which carries the list.
   */
  async handleDisengage() {
    if (!this.attackerTest?.context?.disengage) return;

    if (this.result.winner == "attacker") {
      const tokenUuid = this.attackerTest.options?.engagementToken;
      await FifthEdition.leaveEngagement(this.attacker, tokenUuid ? await fromUuid(tokenUuid) : undefined);
      this.result.other.push(game.i18n.format("FIFTHED.DisengageFreed", { name: this.attacker.prototypeToken?.name || this.attacker.name }));
      return;
    }

    let uuids = this.attackerTest.preData?.options?.disengageOpponents || [];
    let opponents = (await Promise.all(uuids.map(uuid => fromUuid(uuid)))).filter(a => a);
    if (!opponents.length) {
      opponents = [this.defender].filter(a => a);
    }

    for (let opponent of opponents) {
      await FifthEdition.grantMomentum(opponent);
      this.result.other.push(game.i18n.format("FIFTHED.DisengageHeld", { name: opponent.prototypeToken?.name || opponent.name }));
    }
  }

  async evaluate() {
    try {
      let opposeResult = this.result
      let attackerTest = this.attackerTest
      let defenderTest = this.defenderTest

      let soundContext = {};
      opposeResult.other = [];


      let attacker = this.attackerTest.actor
      let defender = this.defenderTest.actor

      let originalModifiers = foundry.utils.deepClone(opposeResult.modifiers)

      await Promise.all(attacker.runScripts("preOpposedAttacker", { attackerTest, defenderTest, opposedTest: this }))
      await Promise.all(attackerTest.item?.runScripts?.("preOpposedAttacker", { attackerTest, defenderTest, opposedTest: this }) ?? [])
      await Promise.all(defender.runScripts("preOpposedDefender", { attackerTest, defenderTest, opposedTest: this }))
      await Promise.all(defenderTest.item?.runScripts?.("preOpposedDefender", { attackerTest, defenderTest, opposedTest: this }) ?? [])

      this.checkPostModifiers(opposeResult.modifiers);
      
      // Redo the test with modifiers
      if (opposeResult.modifiers.attacker.target != originalModifiers.attacker.target
        || opposeResult.modifiers.attacker.SL != originalModifiers.attacker.SL) {
        attackerTest.preData.roll = attackerTest.result.roll
        attackerTest.preData.postOpposedModifiers = opposeResult.modifiers.attacker
        attackerTest.preData.hitloc = attackerTest.result.hitloc?.roll;

        attackerTest.context.breakdown.opposedModifiers = opposeResult.modifiers.message.join("<br/>");

        await attackerTest.computeResult();
        await attackerTest.renderRollCard();
      } 
      if (opposeResult.modifiers.defender.target != originalModifiers.defender.target
        || opposeResult.modifiers.defender.SL != originalModifiers.defender.SL) {
        defenderTest.preData.roll = defenderTest.result.roll
        defenderTest.preData.postOpposedModifiers = opposeResult.modifiers.defender
        defenderTest.preData.hitloc = defenderTest.result.hitloc?.roll;

        defenderTest.context.breakdown.opposedModifiers = opposeResult.modifiers.message.join("<br/>");
        
        await defenderTest.computeResult();
        await defenderTest.renderRollCard();
      }
      if (defenderTest.context.unopposed)
      {
        await defenderTest.roll();
      }

      opposeResult.other = opposeResult.other.concat(opposeResult.modifiers.message);

      let attackerSL = parseInt(attackerTest.result.SL ?? 0);
      let defenderSL = parseInt(defenderTest.result.SL ?? 0);
      opposeResult.differenceSL = 0;
      const resolutionNotesStart = opposeResult.other.length;

      ({ attackerSL, defenderSL } = this.overpowerBySize(attackerSL, defenderSL));

      // 5e (p.133): I Will Not Fail! - "You automatically succeed, even in the direst circumstances. In an Opposed
      // Test, you win by at least +1 SL." Last, and so after Size: "automatically" and "at least +1 SL" leave Size
      // nothing to take back, and a Size overpower resolved first is simply the SL this then rises above.
      //
      // Both sides spending Fate is not a case the book covers, and neither branch fires when it happens, so no
      // one is lifted and the ordinary SL comparison decides. That is deliberate - there is no rule to invent here.
      if (FifthEdition.enabled("Fate")) {
        if (attackerTest.preData.useFate && !defenderTest.preData.useFate && attackerSL - defenderSL < 1) {
          attackerSL = defenderSL + 1;
          opposeResult.other.push(game.i18n.format("FIFTHED.FateOpposed", { name: attacker.prototypeToken?.name || attacker.name }));
        }
        else if (defenderTest.preData.useFate && !attackerTest.preData.useFate && defenderSL - attackerSL < 1) {
          defenderSL = attackerSL + 1;
          opposeResult.other.push(game.i18n.format("FIFTHED.FateOpposed", { name: defender?.prototypeToken?.name || defender?.name }));
        }
      }

      const decision = resolveOpposedWinner(attackerSL, defenderSL, {
        initiatorWinsTies: FifthEdition.enabled("OpposedTies"),
        attackerTarget: attackerTest.target,
        defenderTarget: defenderTest.target,
        unopposedSuccess: attackerTest.outcome == "success" && defenderTest.context.unopposed
      });
      opposeResult.resolution = {
        attackerSL, defenderSL,
        originalAttackerSL: Number(attackerTest.result.SL ?? 0),
        originalDefenderSL: Number(defenderTest.result.SL ?? 0),
        notes: opposeResult.other.slice(resolutionNotesStart),
        reason: decision.reason,
        winner: decision.winner
      };

      // If attacker has more SL OR the SLs are equal and the attacker's target number is greater than the defender's, then attacker wins.
      // Note: I know this isn't technically correct by the book, where it states you use the tested characteristic/skill, not the target number, i'll be honest, I don't really care.
      // 5e (p.131): in the case of a tie, whoever initiated the roll wins
      if (decision.winner == "attacker") {
        opposeResult.winner = "attacker"
        opposeResult.differenceSL = attackerSL - defenderSL;
        opposeResult.showDualWielding = attackerTest.result.canDualWield

        // If Damage is a numerical value
        if (Number.isNumeric(attackerTest.damage)) {
          let damage = await this.calculateOpposedDamage();
          opposeResult.damage = {
            description: `<b>${game.i18n.localize("Damage")}</b>: ${damage}`,
            value: damage
          };
        }
        // If attacker is using a weapon or trait but there wasn't a numerical damage value, output unknown
        else if (attackerTest.weapon || attackerTest.trait) {
          opposeResult.damage = {
            description: `<b>${game.i18n.localize("Damage")}</b>: ?`,
            value: null
          };
        }
        if (attackerTest.hitloc) 
        {
          await this.findHitLocation();
        }

        if (opposeResult.breakdown) {
          opposeResult.breakdown.formatted = this.formatBreakdown();
        }

        try // SOUND
        {
          if (attackerTest.weapon.weaponGroup.value === "bow"
            || attackerTest.weapon.weaponGroup.value === "crossbow") {
            soundContext = { item: attackerTest.weapon, action: "hit" }
          }
          if (attackerTest.weapon.weaponGroup.value == "throwing") {
            soundContext.item = { type: "throw" }
            if (attackerTest.weapon.properties.qualities.hack) {
              soundContext.item = { type: "throw_axe" }
            }
          }
        }
        catch (e) { warhammer.utility.log("Sound Context Error: " + e, true) } // Ignore sound errors
      }
      else // Defender won
      {
        try {
          if (attackerTest.weapon
            && (attackerTest.weapon.weaponGroup.value === "bow"
              || attackerTest.weapon.weaponGroup.value === "crossbow"
              || attackerTest.weapon.weaponGroup.value === "blackpowder"
              || attackerTest.weapon.weaponGroup.value === "engineering")) {
            soundContext = { item: attackerTest.weapon, action: "miss" }
          }
          if (defenderTest.weapon && defenderTest.weapon.properties.qualities.shield) {
            if (attackerTest.weapon.attackType == "melee") {
              soundContext = { item: { type: "shield" }, action: "miss_melee" }
            }
            else {
              if (attackerTest.weapon.weaponGroup.value === "bow"
                || attackerTest.weapon.weaponGroup.value === "sling"
                || attackerTest.weapon.weaponGroup.value === "throwing"
                || attackerTest.weapon.weaponGroup.value === "crossbow") {
                soundContext = { item: { type: "shield" }, action: "miss_ranged" }
              }
            }
          }
        }
        catch (e) { warhammer.utility.log("Sound Context Error: " + e, true) } // Ignore sound errors

        opposeResult.winner = "defender"
        opposeResult.differenceSL = defenderSL - attackerSL;
      }

      await Promise.all(attacker.runScripts("opposedAttacker", { opposedTest: this, attackerTest, defenderTest }))
      await Promise.all(attackerTest.item?.runScripts?.("opposedAttacker", { opposedTest: this, attackerTest, defenderTest }) ?? [])
      if (defender) {
        await Promise.all(defender.runScripts("opposedDefender", { opposedTest: this, attackerTest, defenderTest}))
        await Promise.all(defenderTest.item?.runScripts?.("opposedDefender", { opposedTest: this, attackerTest, defenderTest }) ?? [])
      }

      if (FifthEdition.enabled("Momentum")) {
        await this.handleMomentum();
        await this.handleDisengage();
        // 5e (p.167): after a hit, Momentum may be spent to attack with the weapon in the other hand
        if (opposeResult.winner == "attacker" && attackerTest.weapon && !attackerTest.weapon.offhand.value && !attacker.noOffhand && !attackerTest.context.edited) {
          let dualWielder = attacker.has(game.i18n.localize("NAME.DualWielder"), "talent");
          opposeResult.showDualWielding = dualWielder || attacker.status?.advantage?.value > 0;
          opposeResult.dualWieldCostsMomentum = !dualWielder;
        }
      }

      Hooks.call("wfrp4e:opposedTestResult", this, attackerTest, defenderTest)
      if (opposeResult.winner != opposeResult.resolution.winner) {
        opposeResult.resolution.reason = "BREAKDOWN.ScriptWinner";
        opposeResult.resolution.winner = opposeResult.winner;
      }
      WFRP_Audio.PlayContextAudio(soundContext)
      return opposeResult
    }
    catch (err) {
      ui.notifications.error(`${game.i18n.localize("ErrorOpposed")}: ` + err)
      console.error("Could not complete opposed test: " + err)
    }
  }

  async calculateOpposedDamage() {
    // Calculate size damage multiplier 
    let damageMultiplier = 1;
    let sizeDiff
    let breakdown = {other : []};

    if (this.attackerTest.actor.type == "vehicle" || this.defenderTest.actor.type == "vehicle")
      sizeDiff = 0;
    else 
      sizeDiff = game.wfrp4e.config.actorSizeNums[this.attackerTest.size] - game.wfrp4e.config.actorSizeNums[this.defenderTest.size]

    if (this.attackerTest.actor.has(game.i18n.localize("NAME.Swarm")) || this.defenderTest.actor.has(game.i18n.localize("NAME.Swarm")))
      sizeDiff = 0

    if (game.settings.get("wfrp4e", "homebrew").mooSizeDamage)
      sizeDiff = 0

    if (FifthEdition.enabled("Size"))
      sizeDiff = 0 // 5e (p.360): large creatures add SB to Damage in their profiles instead of multiplying by size difference

    damageMultiplier = sizeDiff >= 2 ? sizeDiff : 1


    let opposedSL = Number(this.attackerTest.result.SL ?? 0) - Number(this.defenderTest.result.SL ?? 0)
    let item = this.attackerTest.item

    if (item?.system.damage?.hasOwnProperty("addSL") && !item.system.damage.addSL)
    {
      opposedSL = 0;
    }

    let damage
    if (this.attackerTest.useMount)
      damage = item.mountDamage
    else
      damage = item.Damage

    //@HOUSE
    if (game.settings.get("wfrp4e", "homebrew").mooSLDamage) {
      game.wfrp4e.utility.logHomebrew("mooSLDamage")
      opposedSL = Number(this.attackerTest.result.SL)
    }
    //@/HOUSE

    breakdown.base = damage + this.attackerTest.result.additionalDamage; 
    breakdown.opposedSL = opposedSL

    // Winds of Magic overcast
    if (this.attackerTest instanceof WomCastTest) {	
      damage += (this.attackerTest.result.additionalDamage || 0);	
    } else {	
      damage += (opposedSL + (this.attackerTest.result.additionalDamage || 0));	
    }

    //@HOUSE
    if (game.settings.get("wfrp4e", "homebrew").mooRangedDamage)
    {
      game.wfrp4e.utility.logHomebrew("mooRangedDamage")
      if (this.attackerTest.item && this.attackerTest.item.isRanged)
      {
        damage -= (Math.floor(this.attackerTest.targetModifiers / 10) || 0)
        if (damage < 0)
          damage = 0
      }
    }
    //@/HOUSE



    let effectArgs = { damage, damageMultiplier, sizeDiff, opposedTest: this, addDamaging : false, addImpact : false, breakdown }
    await Promise.all(this.attackerTest.actor.runScripts("calculateOpposedDamage", effectArgs));
    await Promise.all(this.attackerTest.item?.runScripts("calculateOpposedDamage", effectArgs));
    ({ damage, damageMultiplier, sizeDiff } = effectArgs)

    let addDamaging = effectArgs.addDamaging || false;
    let addImpact = effectArgs.addImpact || false;
    if (this.attackerTest.trait) {
      if (sizeDiff >= 1)
        addDamaging = true;
      if (sizeDiff >= 2)
        addImpact = true;
    }

    let hasDamaging = false;
    let hasImpact = false;
    if (this.attackerTest.item.properties) {
      hasDamaging = !!this.attackerTest.item.properties.qualities.damaging;
      hasImpact = !!this.attackerTest.item.properties.qualities.impact;

      if (this.attackerTest.item.properties.qualities.hullbreaker && this.defender.type == "vehicle")
      {
        addDamaging = true;
        damage += 2;
        breakdown.other.push({label : game.i18n.localize("PROPERTY.Hullbreaker"), value : 2});
      }

      if (this.attackerTest.result.charging || !this.attackerTest.item.properties.flaws.tiring) {
        if (hasDamaging)
          addDamaging = true;
        if (hasImpact)
          addImpact = true;
      }

      if (sizeDiff >= 1)
        addDamaging = true;
      if (sizeDiff >= 2)
        addImpact = true;
    }

    if (addDamaging) {
      let unitValue = Number(this.attackerTest.result.roll.toString().split("").pop())
      if (unitValue === 0)
        unitValue = 10;

      if (unitValue > opposedSL) {
        breakdown.damaging = unitValue;
        damage = damage - opposedSL + unitValue; // replace opposedSL with unit value
      }
    }
    if (addImpact) {
      let unitValue = Number(this.attackerTest.result.roll.toString().split("").pop())
      if (unitValue === 0)
        unitValue = 10;
      damage += unitValue
      breakdown.impact = unitValue;
    }
    this.result.damaging = hasDamaging || addDamaging
    this.result.impact = hasImpact || addImpact

    breakdown.multiplier = damageMultiplier
    this.result.breakdown = breakdown;
    return damage * damageMultiplier
  }

  async findHitLocation()
  {
      // If an attacker's test hit location is "rArm" this actually means "primary arm"
      // So convert "rArm" to "rArm" or "lArm" depending on the actor's settings 
      let attackerHitloc = foundry.utils.deepClone(this.attackerTest.hitloc)
      attackerHitloc.result = this.defender.convertHitLoc(attackerHitloc.result)
      attackerHitloc.description = game.wfrp4e.config.locations[attackerHitloc.result];

      let hitlocToUse;

      // Remap the hit location roll to the defender's hit location table, note the change if it is different
      let remappedHitLoc = await game.wfrp4e.tables.rollTable(this.defender.details.hitLocationTable.value || "hitloc", { lookup: attackerHitloc.roll, hideDSN: true })

      if (remappedHitLoc && this.defender.details.hitLocationTable.value != "hitloc") // Only remap if using a different hitloc table, this prevents Primary Arm -> Right Arm -> Primary Arm (Remapped)
      {
        if (remappedHitLoc.result != attackerHitloc.result) {
          remappedHitLoc.description = game.i18n.localize(remappedHitLoc.description) + " (Remapped)";
          remappedHitLoc.remapped = true;
        }
        hitlocToUse = remappedHitLoc;
      }
      else
      {
        hitlocToUse = attackerHitloc
      }

      this.result.hitloc = {
        description: `<b>${game.i18n.localize("ROLL.HitLocation")}</b>: ${hitlocToUse.description}`,
        value: hitlocToUse.result
      };
  }

  async swap(label)
  {
      let temp = foundry.utils.duplicate(this.defenderTest.data);
      this.defenderTest = game.wfrp4e.rolls.TestWFRP.recreate(this.attackerTest.data);
      this.attackerTest = game.wfrp4e.rolls.TestWFRP.recreate(temp)
      this.data.attackerTestData = this.attackerTest.data
      this.data.defenderTestData = this.defenderTest.data
      let damage = await this.calculateOpposedDamage();
      this.result.damage = {
        description: `<b>${game.i18n.localize("Damage")} (${label})</b>: ${damage}`,
        value: damage
      };
      await this.findHitLocation();
      this.result.swapped = true;
  }

  formatBreakdown()
  {
    let string = "";
    try 
    {
      let breakdown = this.result.breakdown;
      let accumulator = Number(breakdown.base);

      string += `<p><strong>${game.i18n.localize("BREAKDOWN.AttackerBase")}</strong>: ${breakdown.base}</p>`;
      if (breakdown.damaging) 
      {
        accumulator += Number(breakdown.damaging);
        string += `<p><strong>${game.i18n.localize("PROPERTY.Damaging")}</strong>: +${breakdown.damaging} (${accumulator})</p>`;
      }
      else if (breakdown.opposedSL) 
      {
        accumulator += Number(breakdown.opposedSL);
        string += `<p><strong>${game.i18n.localize("BREAKDOWN.OpposedSL")}</strong>: +${breakdown.opposedSL} (${accumulator})</p>`;
      }
      if (breakdown.impact) 
      {
        accumulator += Number(breakdown.impact);
        string += `<p><strong>${game.i18n.localize("PROPERTY.Impact")}</strong>: +${breakdown.impact} (${accumulator})</p>`;
      }

      for (let source of breakdown.other) 
      {
        accumulator += Number(source.value);
        string += `<p><strong>${source.label}</strong>: ${foundry.applications.handlebars.numberFormat(source.value, { hash: { sign: true } })} (${accumulator})</p>`
      }

      if (breakdown.multiplier > 1) 
      {
        accumulator *= breakdown.multiplier
        string += `<p><strong>${game.i18n.localize("BREAKDOWN.Multiplier")}</strong>: ×${breakdown.multiplier} (${accumulator})</p>`
      }
    }
    catch (e) 
    {
      console.error(`Error generating formatted breakdown: ${e}`, this);
    }

    return string;
  }

}