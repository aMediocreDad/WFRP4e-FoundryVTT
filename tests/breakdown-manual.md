# Roll breakdown acceptance checks

The Node suite exercises the production Test evaluator, opposed evaluator, and
message visibility methods with Foundry dependencies stubbed. These checks still
need a running Foundry world; they are not covered by a passing Node test.

## Display and keyboard

- Make an ordinary characteristic Test. The title has an information disclosure,
  with no additional row while closed. Clicking it reveals the existing modifier
  sources plus original/used dice, base SL, and final SL.
- Tab to the disclosure and toggle it with Enter and Space. Confirm a visible
  focus indicator, readable text, no horizontal overflow, and no accidental
  chat action or form submission.
- Close/reopen the chat popout and inspect the same card there.
- Open an older saved Test with no calculation snapshot: its existing breakdown
  should still render.

## Calculations and recomputation

- Roll with two Advantage and two Disadvantage sources. Confirm cancellation is
  explicit. Repeat with three Advantage: confirm reversal and additional SL.
- Try a Critical, a Fumble, an automatic result, a zero-SL outcome, and a Fate
  override. Check that the explanation follows the actual result, including
  intermediate bounds that later rules replace.
- Edit SL to zero, reroll, and apply post-opposed modifiers. Confirm explanations
  replace previous calculation details rather than duplicate them.
- Resolve an opposed tie and a defender victory with no damage. Both have a
  result explanation independent of the damage breakdown.
- Exercise Size and Fate overrides and an effect that changes the winner.
  Existing warnings/actions remain visible; the explanation records compared
  SL and the deciding branch.

## Viewer permissions

- As GM, inspect all roll explanations.
- As a player owning the roller, inspect a normal public roll.
- As another player, confirm both the new disclosure and old title tooltips
  are removed. Repeat after deleting the speaker actor.
- Enable Hide Test Data and inspect a GM-generated card as a player.
- Opposed SL explanations should be visible to the GM or a viewer owning both
  participants, not to a player who owns only one participant.

These are **display permissions**, not a new confidentiality boundary: Foundry
message documents already persist Test data. Whisper/blind-message permissions
still determine access to the message itself.

## Deliberate limits of this increment

- Condition suppression provenance is not yet recorded.
- Arbitrary item/property scripts can change final SL without supplying a reason;
  the final value is shown, but no cause is invented.
- Existing consequence messages and action buttons are retained rather than moved
  into the disclosure.
