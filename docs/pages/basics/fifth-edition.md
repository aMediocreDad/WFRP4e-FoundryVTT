---
layout: default
title: 5th Edition Rules
nav_order: 10
parent: The Basics
---

Warhammer Fantasy Roleplay 5th Edition keeps the 4th Edition engine, so this system can run it. Every 5th Edition rule is an opt-in toggle under **Configure Settings → House Rules → Warhammer Fantasy Roleplay 5th Edition**. Nothing changes until a toggle is turned on.

## The preset

**Apply 5th Edition Preset** switches on every toggle below and also sets the existing options that 5th Edition promotes to core rules:

| Setting | Value | Rule |
|---|---|---|
| Winds of Magic Overcasting / Channelling / Influences | on | Overcast table, SL-pool channelling, Malignant Influences |
| Up in Arms Criticals, modifier 10 | on | +10 on the Critical table per Wound past 0 |
| Up in Arms Bleeding | on | Endurance Test at 0 Wounds instead of falling Unconscious |
| Penetrating Values | on | Penetrating ignores 2 AP |
| Criticals and Fumbles on all Tests | on | Doubles are Criticals/Fumbles outside combat too |
| Initiative Rules | d10 + Initiative Bonus | Ties broken by Initiative |
| Advantage Cap 1, Advantage Bonus 0, Group Advantage off | | Momentum is per character and either held or not |
| Default Difficulty | Challenging | |

Reload after applying the preset.

## The toggles

- Outcome follows final SL: positive SL succeeds, negative fails; at 0 the unmodified roll against the unmodified Skill decides. Outcome tiers follow the 5th Edition table.
- Advantage and Disadvantage: two new roll dialog fields. Advantage lets you reverse the digits if that helps; Disadvantage forces the reversal if it hurts. Sources cancel one for one and each extra source is ±1 SL. Scripts add sources with `args.fields.advSources++` / `args.fields.disSources++`.
- Momentum: the Advantage counter, capped at 1 and relabelled. It grants Advantage on Melee Tests. Gained by winning an Opposed Melee Test or by ticking Charging on a melee attack; lost by losing an Opposed Melee Test, failing an unopposed one, suffering Damage, or gaining a Condition. Spend Momentum sits beside the counter on the combat tab, for a second weapon attack or another effect. **Disengage** joins the melee actions on the sheet; spend Momentum or contest Dodge/Perform (Acrobatics), with Disadvantage while Outnumbered. **Flee** is a Move on the combat tracker, granting each Engaged opponent Momentum and you one Broken Condition per opponent. With Automatic engagements enabled, these use tracked opponents; otherwise target the enemies manually. Leadership Tests offer a "lose Momentum to grant it to an ally" checkbox. "On the Defensive" grants +2 SL to defensive Tests with a chosen Skill until your next Turn.
- Automatic engagements (map-based): an independent opt-in for Engaged, Outnumbered and Surrounded. See [Engagement automation](#engagement-automation) below. These combat statuses are not Conditions that cost Momentum or can be removed with Fortune.
- Conditions: penalties become SL penalties and only the highest applies across different Conditions. Blinded and Prone give Disadvantage and grant Advantage to melee attackers; Surprised grants +2 SL to melee attackers. Adds **Besmirched** (Disadvantage on Fellowship Tests).
- Fortune: spend a point before rolling for Advantage (checkbox in the dialog) or to remove one Condition (button beside Fortune on the character sheet). Rerolling costs a point as it does in 4th Edition, but neither of 4th Edition's limits applies (p.133) — the Test need not have failed, and you may keep spending to reroll again. The "+1 SL" chat option is removed.
- Criticals and Fumbles are +5 / -5 SL: outside combat, a double counts as at least +5 or at most -5 SL.
- Opposed Test ties go to the initiator: the attacker in combat.
- No Critical Deflection: hides the Up in Arms armour-damaging deflection button.
- Armour Repels the Winds: Casting and Channelling Tests lose 1 SL per AP on the most protected location. Metal is exempt for Chamon, leather for Ghur.
- Advancement XP costs: 5th Edition Appendix II table. Talents have no Max: each costs 100 XP and is bought once unless 5th Edition says otherwise (Luck up to three times, Magnum Opus without limit; the exceptions live in `game.wfrp4e.fifthEdition.TALENT_MAX`, and specialisation Talents are separate Items anyway). Talents from lower levels of your Career stay available to buy.
- Career Advancement Tracker: not a toggle here. Use upstream's **5th Edition Career Advancement** (Edition Settings), which tracks Advancements on [Career Paths](./careerPaths.md). This fork adds two things to it: a Career Talent listed as `(Any)`, `(Any One)` or `(All)` counts whichever specialisation you buy, and character generation enters the Career Path at the rolled level with the p.36 Trappings as its only starting Advancements.
- Ambitions: one personal Ambition and one Party Ambition replace the short/long-term pairs on the sheet and in character generation. Buttons beside the personal Ambition award 50 XP for genuine progress and 250 XP for achieving it; the Party Ambition button gives the character the extra Fate Point that completing it grants everyone. Awards are logged on the sheet and posted to chat.
- Fate and Fortune only: Resilience, Resolve and Motivation disappear from the sheet and character generation, Fortune gains the maximum and refresh button described under [Refreshing Fortune](./basics.md#refreshing-fortune), calculated from the Species Fortune this toggle installs rather than from Fate, and the **Luck** Talent adds +1 to it per purchase (p.122, up to three), and any effect or script that changes Resilience or Resolve changes Fate or Fortune instead (the p.364 conversion). Species get the 5th Edition Fate and Fortune (Human 4/3, Dwarf 2/2, Halfling 2/3, High Elf 1/2, Wood Elf 1/2) and stat lines (Dwarf Initiative 2d10+10, Halfling Toughness 2d10+10 and Initiative 2d10+40), and Halflings no longer start with Small; content modules can override through `game.wfrp4e.config.speciesFate`, `speciesFortune`, `speciesCharacteristics` and `speciesTalents`. Character generation assigns 8 Career Skill Advances of +5 with at most 3 in one Skill, and pays out the two rewards for keeping random results: rolling your Species and accepting it grants +1 maximum Fortune (p.22), carried by an effect on the new character so you can see where it came from, and accepting the first result for Species, Career *and* Characteristics grants +1 Fate (Oh Fickle Fate, p.40).
- Five Size steps: Little counts as Tiny and Small (Halflings) as Average, which fixes their Wounds and token size; the size-difference damage multiplier is off because 5th Edition profiles already include the extra Strength Bonus.
- Combat modifiers in SL: range bands (+2/+1/0/-1/-2), Disadvantage when shooting into melee, ranged size modifiers of ±1 SL (±2 for Monstrous or Tiny), no melee bonus against larger targets, a flat -2 SL when parrying something bigger, a Called Shot at -2 SL, and -1 SL to Stealth for each of mail and plate worn. Mounted combat also moves to Advantage and Disadvantage: a rider with a Cavalry weapon has Advantage against anything smaller than their mount, reaching past a mount to its rider costs Disadvantage unless the weapon's reach is Long or greater, and riding gives Disadvantage on Dodge Tests unless you have Trick Rider. Two 4th Edition rules disappear rather than convert: the Fast Quality no longer penalises the defence (5th Edition gives it +20 combat Initiative instead, which is not automated), and Accurate, which 5th Edition dropped, does what its successor Precise does — +1 SL on a successful Test. The percentage **Modifier** field is hidden while nothing has written to it, since 5th Edition has no percentage modifiers to put there; it reappears the moment an effect or a script does write one, so nothing can apply unseen. Adjustments of your own go in the **Add Modifier** row instead, which is available in every game.
- Daily healing: Rest & Recover asks whether the day was restful and rolls an Average Endurance Test; success heals SL + TB, a restful day heals a further TB even on a failure.
- Corruption tested once per session: the end-of-combat Corruption prompt is skipped.
- Difficulty labels in SL: cosmetic; the numbers were already equivalent.

## Still by hand

Getting Help is the Advantage field set to 1 for the helper. Whether a Charge covered at least your Move in yards is the player's call, as it is in 4th Edition. Without Automatic engagements, Disengage and Flee still use selected targets: target every Engaged opponent for Flee and the highest Melee opponent for a Disengage Test, and adjudicate Surrounded manually. The +20 combat Initiative a Fast weapon grants (p.304) is not automated either.

## Engagement automation

Enable **Automatic engagements (map-based)** under House Rules. Enable **Momentum** too for automated Disengage/Flee consequences. An active GM is required for shared updates; for map estimates, that GM should view the combat scene.

- **Becoming Engaged (p.163):** a targeted Melee Attack records a relationship between its two tokens, even on a miss or when the target does not oppose. Melee Skills used to attack count too. Defence rolls, Disengage Tests, rerolls and edits do not count as new attacks. Cancelling an attack dialog does not engage anyone. Proximity alone does not engage.
- **Ending an engagement:** Disengage/Flee remove that token's relationships without disturbing its opponents' other fights. Dragging a token does not grant a free Disengage. At round boundaries, relationships expire after one complete quiet numbered round: an attack in round 1 survives round 2 and expires at the start of round 3 if neither participant attacks the other again. Before initiative, relationships persist until an explicit exit or GM clear; starting combat attaches them to its round clock. Combat deletion/end clears its relationships. Deleted, defeated, dead or unconscious combatants are removed from the active engagement graph.
- **Outnumbered (pp.167,360):** only the connected melee contributes. Attack relationships determine the two sides; allies engaged with a shared enemy count, unrelated combats do not. The side being outnumbered uses the existing defensive Size weighting, while the attacking side counts heads. Conflicting relationships in a three-way fight are left to GM adjudication. Token identities, not Actor ids, count combatants.
- **Surrounded (p.167):** a local path search estimates whether the token's rectangular footprint can move clear of its Engaged opponents, respecting scene bounds and movement-blocking walls (including closed doors). It searches at quarter-grid intervals, allows allies to yield passage, and does not use a three-enemy threshold: two enemies can block a corridor; three on one side can leave an escape.
- **Rolls (p.166):** melee attacks gain +1 SL against an Outnumbered target or +2 SL against a Surrounded target, never both. The pending attack is included in the preview without persisting it until rolled. These are attack modifiers, not parry penalties. Disengage prefills its editable Outnumbered checkbox, chooses the highest Melee/WS opponent, and is blocked while Surrounded. The existing Size exemption still allows a creature to leave smaller opponents without needing to Disengage. Flee remains available while Surrounded.

### GM controls and limits

The token HUD has an **Engagements** button. Set Outnumbered/Surrounded to **Automatic**, **Yes**, or **No**; overrides persist until reset, but inactive tokens do not carry derived statuses. **Clear engagements** removes that token's relationships and overrides. Clicking a derived status icon, or right-clicking Engaged, also opens the controls for a GM.

Square grids and gridless scenes are supported. Hex grids, mixed-elevation opponents, unavailable canvases and ambiguous sides return an unknown result rather than inventing a penalty. Flight, jumps, unusual terrain, passable creatures, weapon-reach control, non-rectangular footprints and openings finer than the search interval require a GM ruling. This is a local escape estimate, not a complete movement/pathfinding implementation. Background scenes cannot use the movement walls of the GM's currently viewed scene.

Relationships and overrides are per token. Linked copies still share Actor effect icons, so an Actor may display Engaged while only one copy is actually engaged; attack modifiers use the specific token instead. Select exactly one copy or use an unlinked token sheet when acting with ambiguous copies. Existing manually applied effects are preserved; GM Clear can clear a manual Engaged effect once none of that Actor's copies is engaged. Disabling automation and reloading removes its managed effects and relationships, not unrelated manual Conditions.

### In-world verification checklist

The Node suite exercises the rules, geometry and mocked document/socket lifecycle. Before using this in a campaign, verify Foundry's actual wall backend, hooks and HUD with a GM and player client:

1. Miss a targeted melee attack. Both tokens gain Engaged; a ranged attack and a cancelled dialog do not.
2. Add another attacker. Check the +1 SL preview and Outnumbered icon; add an engaged ally to cancel the ratio. Repeat with a Large defender and four Average attackers.
3. Place three attackers on one side in the open: an escape should remain. Put two opponents at opposite ends of a narrow corridor: Surrounded should apply.
4. Open/close a movement-blocking door, and move/resize tokens. Check that Surrounded refreshes; verify Automatic/Yes/No in the HUD.
5. Roll a parry: no Outnumbered/Surrounded attack bonus. Try Disengage while Surrounded, then override to No and verify the highest Melee defender is targeted without changing the user's unrelated selections.
6. Flee with two tracked opponents. Check their Momentum, your Broken count, and cleanup on all three tokens. Repeat with the Flee! Talent.
7. Attack in round 1, advance through round 2 without another attack, then start round 3. Repeat with a reverse-direction attack in round 2.
8. Repeat with linked copies of one Actor, multiple players attacking simultaneously, token deletion, defeat/unconsciousness, combat deletion, reload and GM reconnection.
9. Switch the GM to another scene or use hex/mixed elevations. Verify unknown estimates and GM overrides rather than another scene's walls.
10. Disable the setting and reload. Managed status effects should disappear and ordinary 4e/manual handling should remain available.

## What the system already did

Hit location is rolled on the table rather than by reversing the attack roll, Impenetrable already ignores Criticals from odd rolls, and a Critical Hit that also drops a target below 0 Wounds already shows both Critical Wounds. These match 5th Edition without a toggle.

## For module and macro authors

`game.wfrp4e.fifthEdition` exposes the class: `enabled("Momentum")`, `flags`, `applyPreset()`, `resolveAdvantage(preData)`, `resolveOutcome(test)`, `awardAmbitionXP(actor, "progress" | "achieved")`, `completePartyAmbition(actor)`, `flee(actor)`, `disengage(actor)`, `luckFortune(actor)` and the `TALENT_MAX` table.
