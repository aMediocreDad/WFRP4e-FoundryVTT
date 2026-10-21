---
layout: default
title: Fortune Calculation
parent: Scripts
nav_order: 55
grand_parent: Active Effects
---

This trigger runs after a Character's maximum Fortune has been calculated, letting you modify the final value. Anything that raises or lowers the maximum belongs here — a Talent, a blessing, a house rule.

The maximum is what the refresh button beside Fortune restores the current value to. It is only calculated at all while **Auto-calculate Fortune** is on in Actor Settings; turn that off and the actor's stored value is used untouched, and this trigger does not run.

{: .warning}
Like the other data-preparation triggers, this one runs synchronously — the value is used the moment your script returns. A script that `await`s something before changing `args.fortune` will have its change ignored, silently. Keep the script synchronous.

## Key

`fortuneCalc`

## Arguments

`args.actor` - Actor whose Fortune is being calculated

`args.fortune` - Maximum Fortune calculated

## Examples

### The Luck Talent, in a 4th Edition game

**Usage**: Adds +1 maximum Fortune per Advance of the Talent this effect is on. 5th Edition rules apply Luck already, so this is for a game running without them.

```js
args.fortune += this.item.system.Advances
```

### An Endeavour that changed your luck

**Usage**: Adds +1 maximum Fortune permanently. 5th Edition has Endeavours and misadventures that raise or lower maximum Fortune by 1; put each one on its own effect so it can be removed again.

```js
args.fortune += 1
```

### A blessing that doubles your luck

**Usage**: Multiply maximum Fortune by ×2

```js
args.fortune *= 2
```
