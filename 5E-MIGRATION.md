# WFRP 5e — fork posture and migration plan

## Why this branch exists

To play 5e **now**, rather than wait for moo-man to finish the official implementation.
Nothing here is intended for upstream: no PRs, no cherry-picks back to `master`. When
moo-man's 5e work is mature, the plan is to **migrate onto it and delete this stack** —
so the code is disposable, but the world data it produces is not (see below).

## Base: `upstream/master`

Rebased 2026-09-30. Upstream squashed its whole 5e line into `master` (`5c2dc78e`,
2026-09-21) and kept fixing it there; `upstream/master` also carries everything the old
`v14-exclusive` base gave us (Dice So Nice v6, `documentTypes`, v14 compatibility).
`upstream/v14-exclusive` stopped at `6005876d` (2026-08-11) and `upstream/5e` is a subset of
`master`, so neither is a base any more.

The unconditional `EditionManager.getConfig()` merge that ruled out `origin/5e` on 2026-09-04
is fixed: WFRP5E config, the `*Dialog5e`/`*Test5e` classes and `OpposedTest5e` apply only when
the world setting `editionSettings.use5e` is on (default off). This stack runs on the 4e path
with `use5e` **off**; with it on, upstream's 5e test classes bypass the 4e classes our toggles
patch. Templates that both sides changed show upstream's markup when `use5e` is on and ours
otherwise. Upstream requires `warhammer-lib` 3.4.1 or newer.

## What upstream's 5e surface actually is today

Re-surveyed 2026-09-30 on `upstream/master` = `a069ee35`:

- `src/system/5e/config-wfrp5e.js` is ~1,370 lines; `opposed-test5e.js` beside it.
- `src/system/rolls/5e/*` holds a full set of 5e test classes (characteristic, skill, weapon,
  attack, trait, cast, overcast, channelling, prayer) and `src/apps/roll-dialog/5e/*` their
  dialogs, dispatched by `EditionManager.getDialog()` / `getTestClass()`.
- Upstream now covers Momentum, opposed tests and damage, overcasting, dispelling, test
  breakdowns, rerolling and editing, fear, and ward saves, all behind `use5e`.
- `EditionManager.schema` has exactly one field, `use5e`. There are no per-rule toggles.

## "Mature enough to migrate" — the signals to watch for

Status as of 2026-09-30 in brackets.

1. `EditionManager.schema` is no longer empty. [Done, but it holds only `use5e`: one switch,
   not per-rule toggles, so our `homebrew.fifthEd*` surface still has nothing to map onto.]
2. `templates/apps/edition-manager.hbs` exists and the menu's `type:` is `EditionManager`. [Done.]
3. `getConfig()` is gated on the edition setting, so a 4e world is unaffected. [Done.]
4. The `*5e` dialog classes are actually dispatched from somewhere. [Done.]
5. Career advancement, metacurrency and Momentum are modelled upstream, the areas this
   stack owns most heavily. [All three. The house Career Advancement Tracker was retired on
   2026-10-22 in favour of upstream's `careerAdvancement5e` Career Paths.]

## The migration liability is world data, not code

Deleting our code costs nothing. What survives in a world and cannot be recovered by
switching branches:

| Path | What it is | Recoverable? |
|---|---|---|
| `Item(career).system.tracker.ticks` | Retired house tracker progress (5e p.196) | Dropped with the field on 2026-10-22. Only the dev stores ran the fork, so nothing was migrated |
| `Actor(character).system.status.fortune.max` | Fortune maximum | Yes — derived every `prepare` from Species/Fate |
| `Actor.system.settings.autoCalc.fortune` | Per-actor opt-out of that calculation | Preference only |
| `ActiveEffect.flags.wfrp4e.defensiveSkill` | Set on effects our Conditions code creates | Ephemeral |

Everything else the 5e code writes goes to **pre-existing 4e fields** —
`details.experience.{log,spent,total}`, `characteristics`, `status.fate.value`,
`details.motivation.value` — so those carry over as ordinary values with no schema debt.

**Corollary for new work:** prefer derived over stored. Every new stored field is a row that
a future migration has to carry; a derived one costs nothing to abandon.

## Convergence posture

**Already aligned — keep it that way.** Every toggle read funnels through
`FifthEdition.enabled()` / `FifthEdition.settings`. Zero of the 51
`game.settings.get("wfrp4e", "homebrew")` call sites in `src/` belong to this stack; they are
all pre-existing 4e homebrew reads. That makes the eventual switch from `homebrew.fifthEd*`
to `editionSettings` a **one-file change**. Never read the setting directly at a call site.

**Deliberately not aligned**, because it would raise the migration cost rather than lower it:

- Do not move `src/system/fifth-edition.js` under `src/system/5e/` to mirror upstream's layout.
  42 files import it, so the rename would touch 42 import lines — and there is no path
  collision with `src/system/5e/*` to begin with.
- Do not renamespace our `FIFTHED.*` localisation keys to upstream's `"5e"` object. Upstream
  has 9 keys there; this stack has ~190 under `FIFTHED.*`.

## Routine

Check the upstream delta:

```
git fetch upstream
git log --oneline upstream/master ^wfrp5e-house-rules   # what upstream has added since our base
```

Rebase (one commit, so one signature):

```
git branch -f master upstream/master     # local only; master tracks origin/master
git rebase --onto master <old-base> wfrp5e-house-rules
```

`rebase.gpgsign=true` must be set or the merge-based replay silently produces **unsigned**
commits — `commit.gpgsign` alone does not apply to a rebase. Warm the gpg agent first
(`gpgwarm repo`); a cold cache fails one commit at a time, two minutes per attempt.

Verify: `npm test` for the pure-logic harness, then build, rsync into the `dev-wfrp5`
datastore and drive the world — the v14 line rewrites the dice and chat pipeline this stack
modifies heavily, so a normal test, an opposed test end-to-end, the dialog difficulty labels
and XP costs with every toggle off are all worth checking by hand.
