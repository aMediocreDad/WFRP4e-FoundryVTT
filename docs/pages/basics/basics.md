---
layout: default
title: The Basics
nav_order: 2
has_children: 2
---


{: .warning}
While this covers the basics of using this system, it still assumes you know the basics of Foundry first. These concepts include most notably how Actors and Items and Effects interact with each other. You can find more information about basic Foundry concepts in the [Knowledge Base](https://foundryvtt.com/kb/).

{:toc}

## General Topics

Below are topics that should be known when using the system and can be described briefly. Topics that require more in-depth descriptions are given dedicated sub-pages.

### Test Context Menu Options

Like many other things in Foundry, right clicking a Test in chat provides many useful options that every user should know about.

![Test Context](../../assets/basics/test-context.webp)

### Adding a Modifier by Hand

Every roll dialog has an **Add Modifier** row beside Difficulty: an SL value, the name of whatever is causing it, and a button to add it. Added modifiers appear as a row of chips you can click to remove, and each one is listed by name in the Test's breakdown, exactly like a modifier the system worked out itself. Use it for anything the system cannot know about — a ruling at the table, an improvised circumstance, a bonus from a source you have not written an effect for.

The **Modifier** field in the left-hand column still takes a raw percentage adjustment to the target number, and remains the right place for one. What it cannot do is say where the adjustment came from.

### Refreshing Fortune

Fortune is spent through a session and comes back at the start of the next one, so it has a maximum to come back to. The refresh button beside the **Fortune** label on a character's main tab sets the current value to that maximum.

The maximum is calculated for you, the way max Wounds is: your Species Fortune under 5th Edition rules, and your Fate Points otherwise, which is the 4th Edition rule — you have as many Fortune Points as Fate Points. Change Fate and the maximum follows, and Advances of the **Luck** Talent add to it. Effects can have the last word through the [`fortuneCalc`](../effects/triggers/fortuneCalc.md) script trigger.

The refresh itself can be interfered with — several results cap what you get back or stop it entirely — through the [`fortuneRefresh`](../effects/triggers/fortuneRefresh.md) script trigger. Macros can refresh an actor with `actor.refreshFortune()`, which goes through the same trigger.

To set the maximum by hand instead, turn off **Auto-calculate Fortune** in Actor Settings; the field then becomes editable. It lives on the 5th Edition metacurrency box — the four-currency layout shows only the refresh button, since it has no column to spare and needs no field while the maximum is the Fate value printed directly beneath it.

### Actor Settings

The Actor Settings menu lets you configure automated behavior within the Actor, namely disabling automatic calculations. Here you can disabling automatic max wound calculation, encumbrance calculation, token sizing, and more. 

![Actor Settings](../../assets/basics/actor-settings.webp)


### System Effects

Adding Conditions to Actors is easy, but what about other effects? For example, Consume Alcohol effects, Overexposure to Heat or Cold, or Symptoms independent of [Diseases](./diseases.md). You can do this via a dropdown selector at the bottom of the Effects tab. Other modules may add more effects to choose from, such as **Rattled** or **Besmirched**

![System Effects](../../assets/basics/system-effects.webp)


### Theme Configuration

You can modify the system's styling of Foundry to suit your personal taste and needs. To do so, simply navigate to the System Settings and open the Theme Configuration window. 

![Theme Config](../../assets/basics/theme-config.webp)

Here you can choose to disable the Theme in specific areas, or use a more readable (sans-serif) font.

{: .important}
This is a client specific setting, so whatever you choose only applies to you!
