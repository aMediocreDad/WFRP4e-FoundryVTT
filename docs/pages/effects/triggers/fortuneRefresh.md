---
layout: default
title: Fortune Refresh
parent: Scripts
nav_order: 56
grand_parent: Active Effects
---

This trigger runs when Fortune is refreshed — the button beside Fortune on a Character's main tab, or `actor.refreshFortune()` from a macro. It runs before anything is written, so a script can change how much comes back, or stop it coming back at all.

"You regain all Fortune Points at the start of each gaming session" (page 133), but several results interfere with that, and this is where they go.

## Key

`fortuneRefresh`

## Arguments

`args.actor` - Actor whose Fortune is being refreshed

`args.fortune` - The value about to be written, which starts as the maximum

`args.current` - What Fortune the actor holds now, so a script can express a gain rather than a total

## Examples

### Behold Your Wickedness

**Usage**: "The next time you would normally refresh your pool of Fortune Points you only gain 1." Give the effect a duration or delete it after it fires, or it will cap every refresh.

```js
args.fortune = Math.min(args.fortune, args.current + 1)
```

### Traitor's Heart

**Usage**: "You may no longer regain Fortune Points until the next downtime or until you attack or otherwise betray another Character." Leaving Fortune where it is means no gain at all.

```js
args.fortune = args.current
```

### A patron who tops you up

**Usage**: Refresh to one above the usual maximum.

```js
args.fortune += 1
```

Notes: nothing clamps Fortune to its maximum, which is deliberate — Miracles and Spells grant Fortune Points above it that last until the end of the session.
