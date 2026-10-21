/**
 * Presentation helpers for the existing roll breakdown. Values are captured by the
 * evaluator; formatting must not re-run rules against potentially changed settings.
 */
export function formatSLExplanation(calculation, finalSL) {
  if (!calculation) return "";
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const row = (key, value) => `<p><strong>${escape(game.i18n.localize(key))}</strong>: ${escape(value)}</p>`;
  let html = row("BREAKDOWN.Base", calculation.base);
  if (calculation.bonus) html += row("DIALOG.SLBonus", calculation.bonus);
  if (calculation.successBonus) html += row("DIALOG.SuccessBonus", calculation.successBonus);
  if (calculation.override != null) html += row("BREAKDOWN.SLOverride", calculation.override);
  if (calculation.advantage) {
    const { net, extraSL } = calculation.advantage;
    html += row("BREAKDOWN.AdvantageSources", calculation.advantageSources ?? 0);
    html += row("BREAKDOWN.DisadvantageSources", calculation.disadvantageSources ?? 0);
    html += row("BREAKDOWN.AdvantageBalance", net);
    if (!net) html += `<p>${escape(game.i18n.localize("BREAKDOWN.AdvantageCancelled"))}</p>`;
    if (extraSL) html += row("BREAKDOWN.AdvantageSL", extraSL);
  }
  if (calculation.originalRoll != null) {
    html += row("BREAKDOWN.OriginalDice", `${calculation.originalRoll} → ${calculation.roll}`);
  }
  for (const adjustment of calculation.adjustments || []) {
    html += row(adjustment.reason, `${adjustment.before} → ${adjustment.after}`);
  }
  // Bounds, properties and scripts may change SL after the initial arithmetic.
  // Report that result explicitly, rather than imply the input rows form an equation.
  html += row("BREAKDOWN.FinalSL", finalSL);
  return html;
}

/** Capture overrides as they happen; never infer their cause from the final value. */
export function recordSLAdjustment(calculation, reason, before, after) {
  if (calculation && String(before) !== String(after)) {
    calculation.adjustments.push({ reason, before, after });
  }
}

/** The existing opposed winner rule, with its deciding branch retained for display. */
export function resolveOpposedWinner(attackerSL, defenderSL, { initiatorWinsTies, attackerTarget, defenderTarget, unopposedSuccess }) {
  if (attackerSL > defenderSL) return { winner: "attacker", reason: "BREAKDOWN.HigherSL" };
  if (attackerSL < defenderSL) return { winner: "defender", reason: "BREAKDOWN.HigherSL" };
  if (attackerSL !== defenderSL) return { winner: "defender", reason: "BREAKDOWN.InvalidComparison" };
  if (initiatorWinsTies) return { winner: "attacker", reason: "BREAKDOWN.InitiatorTie" };
  if (attackerTarget > defenderTarget) return { winner: "attacker", reason: "BREAKDOWN.TargetTie" };
  if (unopposedSuccess) return { winner: "attacker", reason: "BREAKDOWN.UnopposedSuccess" };
  if (defenderTarget > attackerTarget) return { winner: "defender", reason: "BREAKDOWN.DefenderTargetTie" };
  return { winner: "defender", reason: "BREAKDOWN.DefenderTie" };
}
