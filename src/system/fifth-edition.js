import Engagements from "./engagements.js";

/**
 * Warhammer Fantasy Roleplay 5th Edition rules.
 *
 * Every rule is an opt-in toggle in the House Rules menu (the `homebrew` setting, keys prefixed `fifthEd`).
 * Nothing here changes behaviour unless a toggle is on. Rules that only need configuration data changed are
 * applied at `ready` via `FifthEdition.apply()`; rules that need code paths altered query `FifthEdition.enabled()`.
 *
 * Page references are to the 5th Edition Core Rulebook.
 */
export default class FifthEdition {

  /** Toggle keys, without the `fifthEd` prefix. */
  static TOGGLES = ["Outcome", "Advantage", "Momentum", "Engagements", "CriticalSL", "OpposedTies", "NoCriticalDeflection", "XP", "Conditions", "Fortune", "Fate", "Metacurrency", "Size", "Modifiers", "Healing", "Corruption", "DifficultyLabels", "ArmourWinds", "CriticalHits", "Misfire", "Magic", "Qualities", "Ambitions"];

  /** Species Fate and Fortune (p.27-35). Keys match the core content module. */
  static SPECIES = {
    human: { fate: 4, fortune: 3 },
    dwarf: { fate: 2, fortune: 2 },
    halfling: { fate: 2, fortune: 3 },
    helf: { fate: 1, fortune: 2 },
    welf: { fate: 1, fortune: 2 }
  };

  /** Species stat lines that changed (p.38): Dwarf Initiative, Halfling Toughness and Initiative. Other lines match 4e. */
  static SPECIES_CHARACTERISTICS = {
    dwarf: { i: "2d10+10" },
    halfling: { t: "2d10+10", i: "2d10+40" }
  };

  /** 5e collapses the Size ladder to five steps (p.360): Little becomes Tiny, Small (Halflings) becomes Average. */
  static SIZE_MAP = { ltl: "tiny", sml: "avg" };

  /**
   * The five 5e Size steps in order (p.360). `config.actorSizeNums` still numbers all seven 4e sizes, so the two
   * unused rungs leave gaps in it - Tiny to Average is one 5e step but three of those numbers.
   */
  static SIZE_STEPS = ["tiny", "avg", "lrg", "enor", "mnst"];

  /**
   * How many combatants a creature counts as when working out whether it is outnumbered (p.360). The printed table
   * starts at Small and never goes below 1, and Tiny is not listed at all, so Tiny counts as one like everything
   * else the book bothers to name. Small collapses into Average under SIZE_MAP and needs no row of its own.
   */
  static SIZE_COUNTS = { tiny: 1, avg: 1, lrg: 2, enor: 3, mnst: 4 };

  /** Weapon groups whose weapons can Misfire (p.165). Values match `config.weaponGroups` keys. */
  static MISFIRE_GROUPS = ["blackpowder", "engineering", "explosives"];

  /** Range band SL modifiers (p.166). */
  static RANGE_SL = { pb: 2, short: 1, normal: 0, long: -1, extreme: -2 };

  /** XP for a personal Ambition (p.41): genuine progress during a session, and achieving it. */
  static AMBITION_XP = { progress: 50, achieved: 250 };

  /**
   * 5e Talents have no Max: a Talent is bought once unless its description says it may be taken again (p.114-128, p.191).
   * Specialisation Talents (Acute Sense, Artistic, Craftsman, Fearless, Resistant, Savant, Striding Gait) are separate
   * Items per specialisation and need no entry. "-" means no limit.
   *
   * Keyed by localisation key rather than by English name, because the lookup runs against the Talent Item's own
   * name, which a translation module has already translated. Content modules may override this table, and a plain
   * name works there too - talentMax() accepts either.
   */
  static TALENT_MAX = { "NAME.AA": 2, "NAME.Luck": 3, "NAME.MagnumOpus": "-", "NAME.StrongBack": 2, "NAME.Wealthy": 2 };

  /**
   * Overcast Table (p.236) as incremental costs per step, the shape `config.overCastTablesPerWind` uses.
   * Cumulative thresholds: Targets +1/+2/+3 at 2/8/18 SL, Range x2/x3/x4 at 2/8/18, AoE x2/x3 at 3/18,
   * Duration x2/x3 at 2/13, Damage +1 to +7 at 1/2/3/5/8/13/18.
   */
  static OVERCAST_TABLE = {
    range: [{ cost: 2, value: 2 }, { cost: 6, value: 3 }, { cost: 10, value: 4 }],
    target: [{ cost: 2, value: 1 }, { cost: 6, value: 2 }, { cost: 10, value: 3 }],
    AoE: [{ cost: 3, value: 2 }, { cost: 15, value: 3 }],
    duration: [{ cost: 2, value: 2 }, { cost: 11, value: 3 }],
    damage: [{ cost: 1, value: 1 }, { cost: 1, value: 2 }, { cost: 1, value: 3 }, { cost: 2, value: 4 }, { cost: 3, value: 5 }, { cost: 5, value: 6 }, { cost: 5, value: 7 }]
  };

  /**
   * @param {string} size 4e size key
   * @returns {string} 5e size key when the Size toggle is on, otherwise unchanged
   */
  static mapSize(size) {
    return this.enabled("Size") ? (this.SIZE_MAP[size] || size) : size;
  }

  /**
   * Difference in 5e Size steps between two actors, counted on the five-step ladder.
   * @param {Actor} larger
   * @param {Actor} smaller
   * @returns {number|null} steps `larger` is above `smaller` (negative if below), or null if either size is unknown
   */
  static sizeSteps(larger, smaller) {
    let index = actor => this.SIZE_STEPS.indexOf(this.mapSize(actor?.details?.size?.value));
    let a = index(larger);
    let b = index(smaller);
    return (a < 0 || b < 0) ? null : a - b;
  }

  /**
   * How many combatants one actor counts as (p.360). Unknown sizes count as one - the same as Average, which is
   * what an actor with no Size Trait is.
   * @param {Actor} actor
   * @returns {number}
   */
  static sizeCount(actor) {
    if (!this.enabled("Size")) return 1;
    return this.SIZE_COUNTS[this.mapSize(actor?.details?.size?.value)] || 1;
  }

  /**
   * 5e (p.167): "You outnumber an opponent only if your side has at least twice as many Engaged combatants as
   * theirs." p.360 weights that headcount by Size, but only on one side of the ratio, and which side is the whole
   * of the rule:
   *
   *   "Larger creatures count as several creatures for the sake of working out if they are outnumbered in combat...
   *    you would need 4 Size (Average) creatures to outnumber a Size (Large) creature by 2 to 1."
   *
   * so a creature's own Size makes it *harder* to outnumber - 4 against 1 Large is 4:2, not 4:1 - while
   *
   *   "Conversely... they do not themselves count as multiple opponents when working out if they receive a bonus
   *    for outnumbering themselves. 2 Size (Large) Ogres outnumber 1 Size (Average) Human 2 to 1, not 4 to 1."
   *
   * takes that same weight away from the side doing the outnumbering. Weighting both sides is what the second
   * quote's "not 4 to 1" exists to forbid, and weighting only the opponents would make a lone Ogre outnumber you,
   * which p.167's "twice as many Engaged combatants" cannot mean of a single combatant.
   *
   * So: the side being outnumbered counts its Size, the side outnumbering counts heads. Here the actor is the one
   * asking whether they are outnumbered, so the weight is theirs and the opponents are a plain count.
   *
   * (p.360's second example, "3 Size (Large) creatures to outnumber a Size (Monstrous) creature by 2 to 1", is
   * 3:4 under this reading and does not come out at 2 to 1 under any other either - it is a slip in the book, and
   * the two examples that are self-consistent are the ones followed here.)
   *
   * @param {Actor} actor The one who may be outnumbered
   * @param {Array<Actor>} opponents The combatants Engaged with them
   * @returns {{theirs: number, weighted: number, ours: number, outnumbered: boolean}}
   */
  static outnumbering(actor, opponents = []) {
    let theirs = opponents.length;
    // Not what the ratio is measured on - shown in the prompt so the reading above is auditable at the table
    let weighted = opponents.reduce((total, opponent) => total + this.sizeCount(opponent), 0);
    let ours = this.sizeCount(actor);
    return { theirs, weighted, ours, outnumbered: theirs >= 2 * ours };
  }

  static get settings() {
    return game.settings.get("wfrp4e", "homebrew") || {};
  }

  /**
   * Give locally converted content modules a row in the module-initialization menu.
   *
   * warhammer-lib builds that menu from `WFRP4E.premiumModules` alone, so a module has to be listed
   * there before its tables and scenes can be imported in-app — and importing matters because
   * `WFRP_Tables.findTable` resolves against `game.tables`, not compendia.
   *
   * The list cannot carry them from the start. The system's integrity check runs during `init` and
   * strips `game.data.packs` of every pack belonging to a listed module that is not `protected`,
   * which locally converted modules never are. Registering at `setup` runs after that check and
   * before the menu is ever opened, so the packs survive and the rows still appear.
   */
  static registerContentModules() {
    for (let module of game.modules.filter(m => m.active && m.flags?.initializationPacks?.length)) {
      if (game.wfrp4e.config.premiumModules[module.id]) continue;

      game.wfrp4e.config.premiumModules[module.id] = module.title;

      // warhammer-lib registers this only for modules that were listed at `init`, and the
      // initializer reads it eagerly when it builds each row.
      game.settings.register(module.id, "initialized", {
        name: "Initialization",
        scope: "world",
        config: false,
        default: false,
        type: Boolean
      });
    }
  }

  /**
   * @param {string} key Toggle key without the `fifthEd` prefix, e.g. "Momentum"
   * @returns {boolean}
   */
  static enabled(key) {
    return !!this.settings[`fifthEd${key}`];
  }

  /**
   * Advantage/Disadvantage as digit reversal (p.130) is the mechanic several other toggles produce, so any of them enables it.
   */
  static get usesAdvantage() {
    return this._usesAdvantage(this.settings);
  }

  /**
   * @param {object} settings The `homebrew` setting, read once by the caller
   * @returns {boolean}
   */
  static _usesAdvantage(settings) {
    return !!(settings.fifthEdAdvantage || settings.fifthEdMomentum || settings.fifthEdConditions || settings.fifthEdFortune);
  }

  /**
   * How many times a Talent may be taken under 5e rules (p.191): once, unless its description says otherwise.
   * @param {string} name Talent name, with or without a specialisation
   * @returns {number|string} A count, or "-" for no limit
   */
  static talentMax(name) {
    let base = String(name || "").split("(")[0].trim();
    if (!base) return 1;
    for (let [key, max] of Object.entries(this.TALENT_MAX)) {
      // Match the translated name, or the key itself so a module may key an override by plain name
      if (base == key || base == game.i18n.localize(key)) return max;
    }
    return 1;
  }

  /**
   * 5e Luck (p.122): "You gain +1 maximum Fortune. If you wish, you may purchase this Talent up to three times, for
   * a maximum of +3 Fortune." No content module gives the Talent Item an effect of its own - the 5e core module's
   * Luck carries none - so the maximum has to read the Advances itself. TALENT_MAX already refuses a fourth
   * purchase, so the cap lives there rather than being repeated here.
   *
   * Gated on Metacurrency, the toggle that owns what Fortune's maximum is made of: this is the 5e wording, and 4e's
   * Luck is not on this machine to check against. A 4e world that wants the same can add it through the
   * `fortuneCalc` script trigger.
   *
   * @param {Actor} actor
   * @returns {number} Fortune the actor's Luck Talent adds to their maximum
   */
  static luckFortune(actor) {
    if (!this.enabled("Metacurrency")) return 0;
    // TalentModel.Advances already totals Advances across every Item of the same name, so the first match is enough
    let luck = actor?.itemTypes?.talent?.find(t => t.name == game.i18n.localize("NAME.Luck"));
    return luck?.system.Advances || 0;
  }

  /**
   * Talents the actor may buy from their Career (p.191): the current level's list and, under 5e, the lists of the
   * lower levels of the same Career the actor has held.
   * @param {Actor} actor
   * @param {Item} career Current career item
   * @returns {string[]}
   */
  static careerTalents(actor, career) {
    let talents = career?.system.talents || [];
    if (!career || !this.enabled("XP")) return talents;
    let lower = actor.itemTypes.career.filter(c => c.system.careergroup.value == career.system.careergroup.value && c.system.level.value < career.system.level.value);
    return Array.from(new Set(talents.concat(...lower.map(c => c.system.talents))));
  }

  /**
   * A career Talent entry split into its base name and its specialisation, both lower-cased and with runs of
   * whitespace collapsed. Comparing the parts rather than the raw strings is what lets the wildcard be recognised
   * without treating every specialisation as interchangeable.
   * @param {string} name e.g. "Etiquette (Soldiers)"
   * @returns {{base: string, spec: string}} spec is "" when the name carries no parenthetical
   */
  static _splitTalentName(name) {
    let match = String(name || "").match(/^([^(]*)\(([^)]*)\)\s*$/);
    if (!match) return { base: this._normaliseTalentPart(name), spec: "" };
    return { base: this._normaliseTalentPart(match[1]), spec: this._normaliseTalentPart(match[2]) };
  }

  /**
   * How a Talent name or specialisation is normalised before it is compared: trimmed, lower-cased, and with runs of
   * whitespace collapsed. Shared so the Lore resolver below compares specialisations exactly as _splitTalentName
   * produces them.
   * @param {string} value
   * @returns {string}
   */
  static _normaliseTalentPart(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * Specialisations a Career may list to mean "any specialisation of this Talent". The converted 5e content writes
   * the idea three ways - `Any One` x44, `Any` x7, `any` x2 and `All` x5 across the 316 converted Careers - so all
   * three are recognised, case-insensitively. Everything else is a specific specialisation and matches exactly.
   */
  static TALENT_WILDCARDS = ["any", "any one", "all"];

  /**
   * Whether a Talent is one of a Career's Talents (names may carry a specialisation, e.g. "Etiquette (Soldiers)").
   *
   * The specialisation is part of the identity: a Career listing Etiquette (Soldiers) does not grant Etiquette
   * (Nobles), and buying the latter must not fill the Advancement box the former promised. A Career entry may still
   * name the whole family with one of TALENT_WILDCARDS, and then any specialisation of that base satisfies it.
   *
   * A Career entry with no specialisation means exactly that Talent. Nothing is lost by the strictness: across the
   * converted content no bare career-talent name is also the base of a specialised one.
   *
   * @param {string[]} talents The Career's Talent entries, e.g. a Career Path tier's availableTalents
   * @param {string} talentName The Talent bought
   * @returns {boolean}
   */
  static isCareerTalent(talents, talentName) {
    let wanted = this._splitTalentName(talentName);
    return (talents || []).some(t => {
      let entry = this._splitTalentName(t);
      if (entry.base != wanted.base) return false;
      return entry.spec == wanted.spec || this.TALENT_WILDCARDS.includes(entry.spec);
    });
  }

  /* -------------------------------------------- */
  /*  Arcane Spells take the caster's Lore (p.242)*/
  /* -------------------------------------------- */

  /**
   * Lore specialisations that name a Lore through neither `config.magicLores` nor `config.magicWind`. Each is an
   * English synonym or slip with no localisation key to resolve through, which is why it is spelled out here rather
   * than looked up: the 5e Arcane Magic Talent's own text tells players to pick "Shadows", and strict matching
   * against magicLores ("Shadow") would silently miss it.
   *
   * Keys are normalised the way _normaliseTalentPart normalises a specialisation. Kept as one named table, beside
   * TALENT_WILDCARDS, so a content module or a translation can extend it and so the hardcoded-English exception is
   * visible in one place instead of scattered through the resolver.
   */
  static LORE_ALIASES = {
    "shadows": "shadow",
    "celestial": "heavens",
    "witchery": "witchcraft"
  };

  /**
   * The Lore a Talent specialisation names, or undefined.
   *
   * Resolution order is the Lore's own name ("Fire"), then its Wind ("Aqshy"), then LORE_ALIASES - localised tables
   * first, so a translation or a content module that supplies its own name always beats the English fallbacks.
   *
   * Undefined comes back for an empty specialisation, for a TALENT_WILDCARDS entry, and for anything naming no Lore
   * at all - the career placeholder "Any Colour Lore" among them, which resolves through none of the three tables.
   *
   * A Lore with no Lore Attribute still resolves: Necromancy and Daemonology are real Lores and belong in a spell's
   * lore.value. They yield no effect and no appended text because config.loreEffects and loreEffectDescriptions
   * carry nothing for them, which is what 5e says - p.242 gives Arcane Spells the Lore Attributes of Lore Spells,
   * and those two Lores have none to give.
   *
   * Note that several Winds share a name: "Dhar" is the Wind of all six Dark Lores, and resolves to the first of
   * them. A specialisation that names a Lore outright is never ambiguous, and that is how the content writes them.
   *
   * @param {string} spec e.g. "Fire", "Aqshy", "Shadows", "Any Colour Lore"
   * @returns {string|undefined} a key of config.magicLores
   */
  static loreKeyForSpec(spec) {
    let name = this._normaliseTalentPart(spec);
    if (!name || this.TALENT_WILDCARDS.includes(name)) return undefined;
    let config = game.wfrp4e.config;
    return warhammer.utility.findKey(name, config.magicLores, { caseInsensitive: true })
      || warhammer.utility.findKey(name, config.magicWind, { caseInsensitive: true })
      || this.LORE_ALIASES[name];
  }

  /**
   * The Lores an actor's `Arcane Magic (<Lore>)` and `Chaos Magic (<Lore>)` Talents grant (p.242 names both).
   *
   * Talent base names are matched against the localised NAME.ArcaneMagic and NAME.ChaosMagic, never against English
   * literals, so a translation module still works. A bare `Arcane Magic` with no specialisation grants nothing:
   * there is no Lore in the name to grant.
   *
   * Returns [] whenever the Magic toggle is off, which is what keeps a 4e world byte-for-byte 4e.
   *
   * @param {Actor} actor
   * @returns {string[]} Lore keys, deduplicated, in the actor's own Item order
   */
  static arcaneLores(actor) {
    if (!this.enabled("Magic") || !actor) return [];
    let bases = [game.i18n.localize("NAME.ArcaneMagic"), game.i18n.localize("NAME.ChaosMagic")]
      .map(name => this._normaliseTalentPart(name));
    let lores = [];
    for (let item of actor.items) {
      if (item.type != "talent") continue;
      let { base, spec } = this._splitTalentName(item.name);
      if (!bases.includes(base)) continue;
      let lore = this.loreKeyForSpec(spec);
      if (lore && !lores.includes(lore)) lores.push(lore);
    }
    return lores;
  }

  /* -------------------------------------------- */
  /*  Ambitions (p.41-42)                         */
  /* -------------------------------------------- */

  /**
   * Award the XP for a personal Ambition: 50 for genuine progress during a session, 250 for achieving it (p.41).
   * The award is logged on the sheet and announced in chat.
   * @param {Actor} actor
   * @param {"progress"|"achieved"} kind
   */
  static async awardAmbitionXP(actor, kind) {
    let amount = this.AMBITION_XP[kind];
    if (!amount) return;
    let reason = game.i18n.localize(kind == "achieved" ? "FIFTHED.AmbitionAchieved" : "FIFTHED.AmbitionProgress");
    let experience = actor.system.details.experience;
    let total = experience.total + amount;
    let log = actor.system.addToExpLog(amount, reason, experience.spent, total, "total");
    await actor.update({ "system.details.experience.total": total, "system.details.experience.log": log });
    let html = `<h3 class="center"><b>${game.i18n.localize("FIFTHED.Ambition")}</b></h3>`;
    html += game.i18n.format("FIFTHED.AmbitionAwardText", { character: `<b>${actor.name}</b>`, amount, reason });
    ChatMessage.create(game.wfrp4e.utility.chatDataSetup(html));
  }

  /**
   * Completing the Party Ambition grants every Character an additional Fate Point (p.42). Awards this actor's point.
   * @param {Actor} actor
   */
  static async completePartyAmbition(actor) {
    let fate = actor.system.status.fate.value + 1;
    await actor.update({ "system.status.fate.value": fate });
    let html = `<h3 class="center"><b>${game.i18n.localize("FIFTHED.PartyAmbition")}</b></h3>`;
    html += game.i18n.format("FIFTHED.PartyAmbitionCompleteText", { character: `<b>${actor.name}</b>`, fate });
    ChatMessage.create(game.wfrp4e.utility.chatDataSetup(html));
  }

  /**
   * Parse an Inflict (Condition) quality value (p.304) such as "Entangled 50", "Prone" or "Entangled 35, Prone"
   * into condition keys. A trailing number is the Condition's Strength or Difficulty and is only reported.
   * @param {string} value
   * @returns {Array<{key: string, name: string, strength: number|null}>}
   */
  static parseInflict(value) {
    let results = [];
    for (let part of String(value || "").split(/[,;]/)) {
      let text = part.trim();
      if (!text) continue;
      let strength = text.match(/(\d+)\s*$/);
      let name = strength ? text.slice(0, strength.index).trim() : text;
      let key = Object.keys(game.wfrp4e.config.conditions).find(k => game.wfrp4e.config.conditions[k].toLowerCase() == name.toLowerCase() || k == name.toLowerCase());
      if (key) {
        results.push({ key, name: game.wfrp4e.config.conditions[key], strength: strength ? Number(strength[1]) : null });
      }
    }
    return results;
  }

  /**
   * 5e limits on Overcasting (p.236-237): Petty and unmemorised spells cannot Overcast, and at most IB + WPB SL may be spent.
   * @param {CastTest} test
   * @param {number} overcasts SL available for overcasting as computed by the 4e rules
   * @returns {number}
   */
  static limitOvercasts(test, overcasts) {
    if (!this.enabled("Magic")) return overcasts;
    let spell = test.item;
    // lore.value is an array. Comparing it to a bare string worked only by coercion, and coercion stops working the
    // moment a spell carries two Lores - which a derived Arcane spell now can (p.242).
    if (spell.system.lore.value.includes("petty") || !spell.system.memorized.value) return 0;
    let characteristics = test.actor.system.characteristics;
    return Math.min(overcasts, characteristics.int.bonus + characteristics.wp.bonus);
  }

  /**
   * Template-friendly snapshot of every toggle
   * @returns {object}
   */
  static get flags() {
    // One settings read for the lot. This runs on every sheet and dialog render, and reading the setting per toggle
    // meant 23 reads of a DataModel-backed setting each time. Deliberately not cached across calls: a stale toggle
    // would change which rules apply, which is far worse than a Map lookup.
    let settings = this.settings;
    let flags = {};
    for (let key of this.TOGGLES) {
      flags[key.charAt(0).toLowerCase() + key.slice(1)] = !!settings[`fifthEd${key}`];
    }
    flags.usesAdvantage = this._usesAdvantage(settings);
    return flags;
  }

  /**
   * XP cost of one Skill Advance in the 41-45 band. The book prints 170 (p.364), repeating the 36-40 value, and
   * p.191 repeats 850 for the same band — but p.364 is p.191 divided by 5 on every row of both columns, so those
   * are one printed number, not two attestations. It does not survive either structural test that every other
   * value in the table passes:
   *
   *  - Each cost is the geometric mean of its neighbours, rounded: sqrt(400 * 850) = 583 -> 600,
   *    sqrt(1700 * 3500) = 2439 -> 2500, and for Characteristics at this very band sqrt(1300 * 2550) = 1821 -> 1800.
   *    Here sqrt(850 * 1700) = 1202 -> 1200, i.e. 240 per Advance.
   *  - The Skill/Characteristic ratio climbs monotonically across the table (.400 .429 .400 .429 .500 .571 .632
   *    .654 ... .667 .694 .697 .684 .722 .756). The printed value drops it to .472; 240 gives .667.
   *
   * So the repeat is a misprint. No published errata covers it, and 240 is a reconstruction rather than a printed
   * value, which is why it is named here instead of sitting anonymously in the array. See tests/fifth-edition.test.mjs.
   */
  static SKILL_XP_41_45 = 240;

  /**
   * Appendix II (p.364): XP cost per individual (+1) Advance, bucketed by 5 as the system already does.
   */
  static XP_COST = {
    characteristic: [25, 35, 50, 70, 100, 140, 190, 260, 360, 510, 720, 1005, 1390, 1800, 2250],
    skill: [10, 15, 20, 30, 50, 80, 120, 170, this.SKILL_XP_41_45, 340, 500, 700, 950, 1300, 1700]
  };

  /**
   * Called once at `ready`, after Moo's house rules. Applies configuration-only rules.
   */
  static apply() {
    let config = game.wfrp4e.config;

    if (this.enabled("Momentum") && game.settings.get("wfrp4e", "useGroupAdvantage")) {
      // Reachable only if a world was configured before the settings form started refusing the pair, or by a script.
      // Left as it is rather than silently rewritten, because either setting could be the one the GM meant.
      ui.notifications.error("SETTINGS.FifthEdMomentumGroupAdvantage", { localize: true, permanent: true });
    }

    if (this.enabled("DifficultyLabels")) {
      game.wfrp4e.utility.logHomebrew("fifthEdDifficultyLabels");
      for (let key of ["veasy", "easy", "average", "challenging", "difficult", "hard", "vhard"]) {
        config.difficultyLabels[key] = game.i18n.format("FIFTHED.Difficulty", {
          label: config.difficultyLabels[key].replace(/\s*\(.*\)\s*$/, ""),
          sl: this._signed(config.difficultyModifiers[key] / 10)
        });
      }
    }

    if (this.enabled("XP")) {
      game.wfrp4e.utility.logHomebrew("fifthEdXP");
      config.xpCost.characteristic = foundry.utils.duplicate(this.XP_COST.characteristic);
      config.xpCost.skill = foundry.utils.duplicate(this.XP_COST.skill);
    }

    if (this.enabled("Momentum")) {
      game.wfrp4e.utility.logHomebrew("fifthEdMomentum");
      // The Advantage counter is Momentum in 5e; the word "Advantage" now means digit reversal (p.364).
      game.i18n.translations["Advantage"] = game.i18n.localize("Momentum");
      game.i18n.translations["DIALOG.AdvantageUpdate"] = game.i18n.localize("FIFTHED.MomentumUpdate");
      this._applyOnTheDefensive(config);
    }

    if (this.enabled("Conditions")) {
      game.wfrp4e.utility.logHomebrew("fifthEdConditions");
      this._applyConditions(config);
      this._applyFear(config);
    }

    if (this.enabled("Modifiers")) {
      game.wfrp4e.utility.logHomebrew("fifthEdModifiers");
      this._applyAccurate(config);
    }

    if (this.enabled("Magic")) {
      game.wfrp4e.utility.logHomebrew("fifthEdMagic");
      // One Overcast Table for every Wind (p.236); keep each table's "other" column, which spells define themselves
      for (let key of Object.keys(config.overCastTablesPerWind)) {
        config.overCastTablesPerWind[key] = foundry.utils.mergeObject(config.overCastTablesPerWind[key], foundry.utils.deepClone(this.OVERCAST_TABLE), { inplace: false });
      }
    }

    if (this.enabled("Metacurrency")) {
      game.wfrp4e.utility.logHomebrew("fifthEdMetacurrency");
      // Species give fixed Fate and Fortune with nothing to allot (p.27-35); content modules may override these
      for (let [key, values] of Object.entries(this.SPECIES)) {
        config.speciesFate[key] = values.fate;
        config.speciesFortune[key] = values.fortune;
        config.speciesRes[key] = 0;
        config.speciesExtra[key] = 0;
      }
      // Species stat lines that changed (p.38)
      for (let [key, formulae] of Object.entries(this.SPECIES_CHARACTERISTICS)) {
        if (config.speciesCharacteristics[key]) {
          Object.assign(config.speciesCharacteristics[key], formulae);
        }
      }
      // Halflings no longer start with the Small Talent (p.31); Size handles their Wounds and token
      if (Array.isArray(config.speciesTalents.halfling)) {
        let small = game.i18n.localize("NAME.Small");
        config.speciesTalents.halfling = config.speciesTalents.halfling.filter(t => t != small && t != "Small");
      }
    }
  }

  /**
   * p.364: "If an effect refers to Resilience, use Fate instead. If it refers to Resolve, use Fortune instead."
   * Rewrites a pending actor update so changes to the removed attributes land on their replacements.
   * @param {object} data Expanded update data (mutated)
   * @param {object} status Current status data of the actor
   */
  static redirectMetacurrency(data, status) {
    if (!this.enabled("Metacurrency") || !data?.system?.status) return;
    for (let [from, to] of [["resilience", "fate"], ["resolve", "fortune"]]) {
      let path = `system.status.${from}.value`;
      if (!foundry.utils.hasProperty(data, path)) continue;
      let delta = (Number(foundry.utils.getProperty(data, path)) || 0) - (status[from]?.value || 0);
      let toPath = `system.status.${to}.value`;
      let current = foundry.utils.hasProperty(data, toPath) ? Number(foundry.utils.getProperty(data, toPath)) : (status[to]?.value || 0);
      if (delta) {
        foundry.utils.setProperty(data, toPath, Math.max(0, current + delta));
      }
      delete data.system.status[from];
    }
  }

  static _signed(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  /**
   * 5e has no Accurate Quality: the list on p.304-305 goes Blackpowder, Blast, Damaging, Defensive, Fast, Hack,
   * Impale, Inflict, Magical, Parry, Penetrating, Pistol, Precise, Pummel, Repeater, Trap Blade, Unbreakable, Wrap.
   * Precise is its successor - "+1 SL to any successful Test" - and it is what 5e prints on the Hochland Long Rifle
   * (p.303), the weapon 4e gave Accurate to. So Accurate does what Precise does rather than keep writing a percentage
   * modifier into a game that has none.
   */
  static _applyAccurate(config) {
    let script = config.propertyEffects?.accurate?.system?.scriptData?.find(s => s.trigger == "dialog");
    if (script) {
      script.script = "args.fields.successBonus += 1;";
    }
  }

  /* -------------------------------------------- */
  /*  On the Defensive (p.162)                    */
  /* -------------------------------------------- */

  /**
   * A System Effect (available from the sheet's effect picker) for the "On the Defensive" Action: pick a Skill when
   * applying it, gain +2 SL on defensive Tests with that Skill, and it removes itself at the start of your next Turn.
   */
  static _applyOnTheDefensive(config) {
    if (config.systemEffects.onTheDefensive) return;
    config.systemEffects.onTheDefensive = {
      name: game.i18n.localize("FIFTHED.OnTheDefensive"),
      img: "icons/svg/shield.svg",
      statuses: ["onTheDefensive"],
      duration: { rounds: 1 },
      system: {
        transferData: {},
        scriptData: [
          {
            label: "@effect.name",
            trigger: "immediate",
            script: `
              let skills = this.actor.itemTags["skill"] || [];
              let chosen = await ItemDialog.create(skills, 1, { title: this.effect.name, text: game.i18n.localize("FIFTHED.ChooseDefensiveSkill") });
              let name = chosen?.[0]?.name || game.i18n.localize("NAME.Dodge");
              this.effect.updateSource({ name: this.effect.name + " (" + name + ")", "flags.wfrp4e.defensiveSkill": name });`
          },
          {
            label: game.i18n.localize("FIFTHED.DefensiveBonus"),
            trigger: "dialog",
            script: `args.fields.slBonus += 2`,
            options: {
              hideScript: "const s = args.skill?.name ?? args.weapon?.system?.getSkillToUse?.(args.actor)?.name; return s != this.effect.flags.wfrp4e?.defensiveSkill",
              activateScript: "return !!args.actor.attacker"
            }
          },
          {
            label: "@effect.name",
            trigger: "startTurn",
            script: `this.effect.delete()`
          }
        ]
      }
    };
  }

  /* -------------------------------------------- */
  /*  Leaving combat (p.163)                      */
  /* -------------------------------------------- */

  /**
   * Tracked opponents when engagement automation is on; targets remain the manual
   * fallback when it is off. Never fall back to unrelated targets in automated mode.
   *
   * @param {Actor} actor The one leaving combat
   * @returns {Array<Actor>}
   */
  static engagedOpponents(actor, token) {
    if (Engagements.enabled) {
      token = Engagements.tokenFor(actor, token);
      return token ? Engagements.opponents(token).map(t => t.actor) : [];
    }
    return Array.from(game.user.targets).map(t => t.actor).filter(a => a && a.id != actor.id);
  }

  static async leaveEngagement(actor, token) {
    if (Engagements.enabled) return Engagements.leave(actor, token);
    return actor.removeCondition("engaged");
  }

  /** Momentum is binary (p.168), so an opponent who already holds it gains nothing. */
  static async grantMomentum(opponent) {
    if (opponent?.status?.advantage && !(opponent.status.advantage.value > 0)) {
      await opponent.setAdvantage(1);
    }
  }

  static _names(actors) {
    return actors.map(a => a.prototypeToken?.name || a.name).join(", ");
  }

  /**
   * 5e (p.120), Flee!: "If you choose to Flee in combat (page 163), you do not gain any Broken Conditions."
   *
   * Matched by name because the Talent Item in the converted 5e content carries no effect for this half - the Pursuit
   * half (+1 SL as the Quarry) is an effect script on the Item, and the extra Move on a Disengage is narration. The
   * key is accepted alongside its translation for the same reason talentMax does it: a module may key an override by
   * plain name.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  static hasFleeTalent(actor) {
    let name = game.i18n.localize("NAME.Flee");
    return !!actor?.itemTypes?.talent?.some(t => t.name == name || t.name == "NAME.Flee");
  }

  /**
   * 5e (p.163): Fleeing is your Move, and the only exit left while Surrounded. Each Engaged opponent immediately gains
   * Momentum, which they may lose to make one free Melee Attack against you, and you gain one Broken Condition for
   * each enemy you were Engaged with.
   *
   * Lives on the combat tracker rather than the sheet's Momentum row: it is a Move, not a Momentum spend, and the
   * tracker is both where a player is looking on their Turn and the one place every actor type reaches it from.
   *
   * @param {Actor} actor
   */
  static async flee(actor, token) {
    if (!this.enabled("Momentum") || !actor) return;
    token = Engagements.enabled ? Engagements.tokenFor(actor, token) : token;
    if (Engagements.enabled && (!token || !game.users?.activeGM)) {
      return ui.notifications.warn(token ? "FIFTHED.EngagementNoGM" : "FIFTHED.EngagementTokenRequired", { localize: true });
    }
    let opponents = this.engagedOpponents(actor, token);
    if (!opponents.length) {
      return ui.notifications.warn(Engagements.enabled ? "FIFTHED.EngagementNoOpponents" : "FIFTHED.LeaveCombatNoTargets", { localize: true });
    }

    // 5e (p.120), Flee!: "If you choose to Flee in combat (page 163), you do not gain any Broken Conditions."
    // Only the Conditions are waived - the Talent says nothing about the Momentum the opponents gain, nor about
    // still leaving the Engagement, so both stand. Asked before the prompt so the prompt does not promise Conditions
    // the actor will not take.
    let talent = this.hasFleeTalent(actor);

    let confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("FIFTHED.Flee") },
      content: `<p>${game.i18n.format(talent ? "FIFTHED.FleeConfirmTalent" : "FIFTHED.FleeConfirm", { count: opponents.length, targets: this._names(opponents) })}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;

    for (let opponent of opponents) {
      await this.grantMomentum(opponent);
    }
    if (!talent) {
      // Last, because gaining a Condition costs the fleeing actor any Momentum they still held (p.184)
      await actor.addCondition("broken", opponents.length);
    }
    await this.leaveEngagement(actor, token);

    let text = game.i18n.format(talent ? "FIFTHED.FleeTextTalent" : "FIFTHED.FleeText", { name: actor.prototypeToken?.name || actor.name, count: opponents.length, targets: this._names(opponents) });
    ChatMessage.create(game.wfrp4e.utility.chatDataSetup(text));
  }

  /**
   * 5e (p.163): the other two ways out of an Engagement, which is why they share one prompt rather than sitting on
   * the sheet as separate buttons. With Momentum you lose it to move away without penalty. Without it you spend your
   * Action on a Dodge or Perform (Acrobatics) Test opposed by the highest Melee Skill among the foes you are Engaged
   * with, with Disadvantage while Outnumbered (p.167) and no option at all while Surrounded (p.167).
   *
   * The Test is the system's ordinary opposed flow, so the targeted opponent answers it with their own Melee and the
   * outcome is settled where every other opposed consequence is - see OpposedTest.handleDisengage.
   *
   * @param {Actor} actor
   */
  static async disengage(actor, token) {
    if (!this.enabled("Momentum") || !actor) return;

    token = Engagements.enabled ? Engagements.tokenFor(actor, token) : token;
    if (Engagements.enabled && (!token || !game.users?.activeGM)) {
      return ui.notifications.warn(token ? "FIFTHED.EngagementNoGM" : "FIFTHED.EngagementTokenRequired", { localize: true });
    }
    if (Engagements.enabled) {
      await Engagements.request("refresh", { sceneId: token.parent.id });
    }
    // Capture the same opponents for all consequences, even if another user resolves the Test.
    let opponents = this.engagedOpponents(actor, token);
    if (Engagements.enabled && !opponents.length) {
      return ui.notifications.warn("FIFTHED.EngagementNoOpponents", { localize: true });
    }

    // 5e (p.360): "Creatures ignore the need to Disengage from melee combat with smaller combatants." Nothing to
    // contest, so nothing to spend and nothing to roll - but only when every opponent is smaller, and only when
    // there is someone to be larger than. sizeSteps is null for an unknown size, which is not "smaller".
    if (this.enabled("Size") && opponents.length && opponents.every(o => this.sizeSteps(actor, o) > 0)) {
      await this.leaveEngagement(actor, token);
      let text = game.i18n.format("FIFTHED.DisengageSizeText", { name: actor.prototypeToken?.name || actor.name, targets: this._names(opponents) });
      return ChatMessage.create(game.wfrp4e.utility.chatDataSetup(text));
    }

    if (Engagements.enabled && Engagements.state(token).surrounded) {
      return ui.notifications.warn("FIFTHED.EngagementCannotDisengage", { localize: true });
    }

    let hasMomentum = actor.status?.advantage?.value > 0;

    let routes = [];
    if (hasMomentum) {
      routes.push({ action: "momentum", label: game.i18n.localize("FIFTHED.DisengageWithMomentum") });
    }
    routes.push({ action: "dodge", label: game.i18n.localize("NAME.Dodge") });
    routes.push({ action: "acrobatics", label: game.i18n.localize("FIFTHED.PerformAcrobatics") });

    // Keep the prefill visible and editable for table adjudication.
    let counts = Engagements.enabled ? Engagements.state(token) : this.outnumbering(actor, opponents);

    let content = `<p>${game.i18n.localize("FIFTHED.DisengagePrompt")}</p>`;
    content += `<div class="form-group"><label>${game.i18n.localize("FIFTHED.DisengageOutnumbered")}</label>`;
    content += `<div class="form-fields"><input type="checkbox" name="outnumbered"${counts.outnumbered ? " checked" : ""}></div></div>`;
    // Only with the Size toggle on: the sentence is about how Size weights the ratio, and without it every
    // creature counts as one, so it would explain a rule that is not being applied
    if (opponents.length && this.enabled("Size")) {
      content += `<p class="hint">${game.i18n.format(Engagements.enabled ? "FIFTHED.EngagementCounts" : "FIFTHED.DisengageOutnumberedCount", counts)}</p>`;
    }
    content += `<p class="hint">${game.i18n.localize("FIFTHED.DisengageHint")}</p>`;

    let choice = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FIFTHED.Disengage") },
      content,
      buttons: routes.map((route, index) => ({
        action: route.action,
        label: route.label,
        default: index == 0,
        callback: (event, button) => ({ route: route.action, outnumbered: !!button.form.elements.outnumbered?.checked })
      })),
      rejectClose: false
    });
    if (!choice) return;

    if (choice.route == "momentum") {
      await actor.setAdvantage(0);
      await this.leaveEngagement(actor, token);
      let text = game.i18n.format("FIFTHED.DisengageMomentumText", { name: actor.prototypeToken?.name || actor.name });
      return ChatMessage.create(game.wfrp4e.utility.chatDataSetup(text));
    }

    // Without Momentum the exit is contested, so there has to be someone to contest it
    if (!opponents.length) {
      return ui.notifications.warn("FIFTHED.LeaveCombatNoTargets", { localize: true });
    }

    const defender = Engagements.enabled ? Engagements.strongest(Engagements.opponents(token)) : null;
    let skill = choice.route == "dodge" ? game.i18n.localize("NAME.Dodge") : game.i18n.localize("FIFTHED.PerformAcrobatics");
    let test = await actor.setupSkill(skill, {
      disengage: true,
      engagementToken: token?.uuid,
      engagementTarget: defender?.uuid,
      // p.163 gives Momentum to your *opponents*, plural, and by the time the contest resolves only the one who
      // answered the Test is still in hand. So the set is carried with the Test, as UUIDs: `context` is serialized
      // into the chat message, which no Actor survives, and unlinked tokens from one statblock share an `id`,
      // which is exactly the case this exists for. Resolved with fromUuid in OpposedTest.handleDisengage.
      disengageOpponents: opponents.map(o => o.uuid),
      appendTitle: ` - ${game.i18n.localize("FIFTHED.Disengage")}`,
      // The prefilled Disadvantage is a dialog "initial field", which the breakdown labels generically unless the
      // caller names it - and "Initial" tells a player nothing about why they are rolling at a Disadvantage
      fields: choice.outnumbered ? { disSources: 1 } : {},
      initialTooltip: choice.outnumbered ? game.i18n.localize("FIFTHED.DisengageOutnumbered") : undefined
    });
    if (test) {
      if (defender) {
        test.context.speaker = actor.speakerData(token);
        test.context.targets = [defender.actor.speakerData(defender)];
      }
      await test.roll();
    }
  }

  /* -------------------------------------------- */
  /*  Conditions (p.184-187)                      */
  /* -------------------------------------------- */

  /**
   * Dialog script fragment applying an SL penalty such that only the single highest Condition penalty applies (p.184).
   * Each Condition records the penalty it wants in `args.flags.fePenalty` and only adds the difference above what
   * another Condition already applied, so the order scripts run in does not matter.
   * @param {string} expression JS expression evaluating to the penalty magnitude
   */
  static _penaltyScript(expression) {
    return `const fePenalty = ${expression}; const fePrev = args.flags.fePenalty || 0; if (fePenalty > fePrev) { args.fields.slBonus -= (fePenalty - fePrev); args.flags.fePenalty = fePenalty; }`;
  }

  /**
   * Dialog predicate matching a Test by the Skill being rolled, the way `broken` below already does. The name is
   * matched at the start so a Grouped Skill's specialisation - "Melee (Basic)", "Ride (Horse)", "Perform (Dancing)" -
   * still counts as its parent Skill.
   * @param {string[]} keys Skill-name localisation keys
   * @param {string} [extra] A further expression OR-ed onto the match, for Tests that are not one of those Skills
   */
  static _skillScript(keys, extra) {
    let names = `[${keys.map(key => `'${key}'`).join(", ")}].map(key => game.i18n.localize(key))`;
    return `const feSkills = ${names}; return feSkills.some(name => args.skill?.name?.startsWith(name))${extra ? ` || (${extra})` : ""}`;
  }

  static _applyConditions(config) {
    // p.186 Entangled: "all your actions involving movement of any kind suffer a penalty of -1 SL (including
    // Grappling; see page 167)", and Prone the same in Disadvantage. The Skills are the ones whose own 5e
    // descriptions (p.110-113) are about moving your body: Athletics ("run, jump, move"), Climb ("ascend steep or
    // vertical surfaces"), Dodge ("ducking, diving, and moving quickly"), Melee, Perform ("physical speed and
    // coordination"), Ride, Row ("pulling an oar"), Stealth ("move and hide"), Swim ("moving and staying afloat").
    // Drive and Sail are deliberately out: they manoeuvre a vehicle, not you.
    //
    // Two Tests are not named by a Skill. A Melee Attack made without the Skill falls back to a bare WS Test, so it
    // is matched on the weapon, the way FifthEdition.isMeleeItem does. A Grapple is an Opposed Strength Test
    // (p.167), which here is a bare Strength Characteristic Test - the same shape OpposedTest.isStrengthTest
    // matches. That catches every bare Strength Test rather than only a Grapple, which is what "movement of any
    // kind" reads like; where it is not, the GM deselects the row in the dialog.
    const movement = this._skillScript(
      ["NAME.Athletics", "NAME.Climb", "NAME.Dodge", "NAME.Melee", "NAME.Perform", "NAME.Ride", "NAME.Row", "NAME.Stealth", "NAME.Swim"],
      "args.item?.attackType == 'melee' || (!args.skill && args.characteristic == 's')"
    );

    // p.185 Blinded: Disadvantage on "Melee Attacks and other Tests that rely heavily on sight but do not strictly
    // require it, such as Climb or Ride", and p.130's Darkness box names the same family - "Melee Tests, Ranged
    // Tests, and Perception Tests based on sight incur Disadvantage". p.130 says Test rather than Attack, so Melee
    // and Ranged are matched on the Skill as well as on the weapon: a Melee Test rolled from the Skill alone, which
    // is how an opposed defence resolves, is still a Melee Test. A Test carries no sense to read off, so every
    // Perception Test matches and the GM deselects the row for one made by smell or hearing.
    const sight = this._skillScript(
      ["NAME.Climb", "NAME.Melee", "NAME.Perception", "NAME.Ranged", "NAME.Ride"],
      "args.item?.attackType == 'melee' || args.item?.attackType == 'ranged'"
    );

    // p.185: "Melee Attacks against you benefit from Advantage, unless your foe is also Blinded." A targeter script
    // runs in the attacker's dialog, so args.actor is the foe.
    const blindAttacker = "args.actor?.statuses?.has('blinded')";

    const melee = "return args.item?.attackType == 'melee'";
    const notMelee = "return args.item?.attackType != 'melee'";
    const always = "return true";

    const ranged = "return args.item?.attackType == 'ranged'";
    const notRanged = "return args.item?.attackType != 'ranged'";

    const dialogScripts = {
      deafened: [], // 5e Deafened has no Test penalty (p.186)
      fatigued: [{
        trigger: "dialog", label: "FIFTHED.ConditionPenalty",
        script: this._penaltyScript("this.effect.conditionValue"),
        options: { activateScript: always }
      }],
      poisoned: [{
        trigger: "dialog", label: "FIFTHED.ConditionPenalty",
        script: this._penaltyScript("this.effect.conditionValue"),
        options: { activateScript: always }
      }],
      stunned: [{
        trigger: "dialog", label: "FIFTHED.ConditionPenalty",
        script: this._penaltyScript("this.effect.conditionValue"),
        options: { activateScript: always }
      }],
      broken: [{
        trigger: "dialog", label: "FIFTHED.ConditionPenaltyBroken",
        script: this._penaltyScript("this.effect.conditionValue"),
        options: { activateScript: "return !args.skill?.name?.includes(game.i18n.localize('NAME.Stealth')) && args.skill?.name != game.i18n.localize('NAME.Athletics')" }
      }],
      entangled: [
        {
          trigger: "dialog", label: "FIFTHED.ConditionEntangledMovement",
          script: this._penaltyScript("this.effect.conditionValue"),
          options: { activateScript: movement }
        },
        {
          trigger: "dialog", label: "FIFTHED.ConditionEntangledTarget",
          script: `args.fields.slBonus += 1`,
          options: { targeter: true, hideScript: notMelee, activateScript: melee }
        }
      ],
      blinded: [
        {
          // p.185 would stop a Test that "requires sight", a Ranged Attack among them, outright rather than
          // disadvantage it. Nothing in the dialog can refuse a submission - warhammer-lib discards what a
          // submission script returns - so a Ranged Attack keeps the Disadvantage that p.130 gives it in the dark.
          trigger: "dialog", label: "FIFTHED.ConditionBlindedSight",
          script: `args.fields.disSources++`,
          options: { activateScript: sight }
        },
        {
          trigger: "dialog", label: "FIFTHED.ConditionBlindedAdvantage",
          script: `args.fields.advSources++`,
          options: {
            targeter: true,
            hideScript: `return args.item?.attackType != 'melee' || ${blindAttacker}`,
            activateScript: `return args.item?.attackType == 'melee' && !${blindAttacker}`
          }
        }
      ],
      prone: [
        {
          trigger: "dialog", label: "FIFTHED.ConditionProneMovement",
          script: `args.fields.disSources++`,
          options: { activateScript: movement }
        },
        {
          trigger: "dialog", label: "FIFTHED.ConditionAdvantageMelee",
          script: `args.fields.advSources++`,
          options: { targeter: true, hideScript: notMelee, activateScript: melee }
        },
        {
          trigger: "dialog", label: "FIFTHED.ConditionProneRanged",
          script: `args.fields.slBonus -= 1`,
          options: { targeter: true, hideScript: notRanged, activateScript: ranged }
        }
      ],
      surprised: [{
        trigger: "dialog", label: "FIFTHED.ConditionSurprisedBonus",
        script: `args.fields.slBonus += 2`,
        options: { targeter: true, hideScript: notMelee, activateScript: melee }
      }]
    };

    for (let effect of config.statusEffects) {
      let replacement = dialogScripts[effect.id];
      if (!replacement) continue;
      // Keep every non-dialog script (end of round tests, movement halving, etc.), replace the modifiers
      let kept = (effect.system.scriptData || []).filter(s => s.trigger != "dialog");
      effect.system.scriptData = kept.concat(replacement.map(s => foundry.utils.mergeObject({}, s)));
      for (let s of effect.system.scriptData) {
        if (s.label?.startsWith("FIFTHED.")) s.label = game.i18n.localize(s.label);
      }
    }

    if (!config.statusEffects.find(e => e.id == "besmirched")) {
      // Insert before the non-condition entries (unconscious/grappling/engaged/dead) so it shows with the other Conditions
      let index = config.statusEffects.findIndex(e => e.id == "unconscious");
      let besmirched = {
        img: "systems/wfrp4e/icons/conditions/besmirched.svg",
        id: "besmirched",
        statuses: ["besmirched"],
        name: "WFRP4E.ConditionName.Besmirched",
        description: "WFRP4E.Conditions.Besmirched",
        system: {
          condition: { value: null, numbered: false },
          scriptData: [{
            trigger: "dialog",
            label: game.i18n.localize("FIFTHED.ConditionDisadvantageFellowship"),
            script: `args.fields.disSources++`,
            options: { activateScript: "return args.characteristic == 'fel'" }
          }]
        }
      };
      config.statusEffects.splice(index < 0 ? config.statusEffects.length : index, 0, besmirched);
      config.conditionDescriptions.besmirched = game.i18n.localize("WFRP4E.Conditions.Besmirched");
      config.conditions.besmirched = game.i18n.localize("WFRP4E.ConditionName.Besmirched"); // makes effect.isCondition true
      // Core keeps its own (shallow) copy of the list for the token HUD, so add it there too
      if (Array.isArray(CONFIG.statusEffects) && CONFIG.statusEffects !== config.statusEffects && !CONFIG.statusEffects.find(e => e.id == "besmirched")) {
        let coreIndex = CONFIG.statusEffects.findIndex(e => e.id == "unconscious");
        CONFIG.statusEffects.splice(coreIndex < 0 ? CONFIG.statusEffects.length : coreIndex, 0, besmirched);
      }
    }
  }

  /**
   * Fear (p.183): while subject to Fear you may not gain Momentum (enforced on the Momentum update path) and Melee Attacks
   * made against you by the source of your Fear benefit from Advantage. The 4e "-1 SL against the source" is removed.
   * The system defines the Fear effect twice (the extended test item and a bare system effect); both are rewritten.
   */
  static _applyFear(config) {
    const advantageScript = {
      trigger: "dialog",
      label: game.i18n.localize("FIFTHED.ConditionFearAdvantage"),
      script: `args.fields.advSources++`,
      options: {
        targeter: true,
        hideScript: "return args.item?.attackType != 'melee'",
        activateScript: `const source = this.item?.flags?.wfrp4e?.fearName; return args.item?.attackType == 'melee' && (!source || [args.actor.name, args.actor.prototypeToken?.name].includes(source))`
      }
    };
    let effects = [config.systemEffects.fear, ...(config.systemItems?.fear?.effects || [])].filter(e => e);
    for (let effect of effects) {
      let scriptData = effect.system?.scriptData || effect.flags?.wfrp4e?.scriptData;
      if (!scriptData) continue;
      let index = scriptData.findIndex(s => s.trigger == "dialog");
      if (index >= 0) scriptData.splice(index, 1, foundry.utils.deepClone(advantageScript));
      else scriptData.push(foundry.utils.deepClone(advantageScript));
    }
  }

  /**
   * Whether the actor is currently prevented from gaining Momentum (Fear, p.183).
   */
  static blocksMomentum(actor) {
    return this.enabled("Momentum") && !!actor?.statuses?.has("fear");
  }

  /* -------------------------------------------- */
  /*  Outcome (p.130-131)                         */
  /* -------------------------------------------- */

  /**
   * 5e decides success by the final SL: positive succeeds, negative fails, and at exactly 0 the unmodified roll
   * against the unmodified Skill decides (+0 Marginal Success, -0 Marginal Failure). Automatic success (01-05) and
   * failure (96-100) still apply. Outcome tiers also follow the 5e table: ±5 Astounding, ±3/4 Impressive, ±1/2 plain, 0 Marginal.
   *
   * @param {TestWFRP} test Test whose result has just been computed
   * @returns {boolean} whether anything changed
   */
  static resolveOutcome(test) {
    let roll = Number(test.result.roll);
    let sl = Number(test.result.SL);
    if (!Number.isFinite(roll) || !Number.isFinite(sl)) return false;

    // p.130: 96-100 is always a failure "resulting in at least a Marginal Failure", and 01-05 always a success
    // "achieving at least a Marginal Success". Those are bounds on how far the roll can carry the result, not a
    // magnitude - an automatic failure on a roll that had earned +5 SL is a Marginal Failure, not an Astounding one.
    let success;
    if (roll >= game.settings.get("wfrp4e", "automaticFailure"))
    {
      success = false;
      sl = Math.min(sl, 0);
    }
    else if (roll <= game.settings.get("wfrp4e", "automaticSuccess"))
    {
      success = true;
      sl = Math.max(sl, 0);
    }
    else if (sl > 0) success = true;
    else if (sl < 0) success = false;
    else success = roll <= (test.result.target - test.targetModifiers);

    let magnitude = Math.abs(sl);
    let tier = magnitude >= 5 ? "Astounding" : magnitude >= 3 ? "Impressive" : magnitude >= 1 ? "" : "Marginal";
    let outcome = success ? "success" : "failure";
    let changed = outcome != test.result.outcome;

    test.result.outcome = outcome;
    test.result.SL = success ? `+${magnitude}` : (magnitude == 0 ? "-0" : -magnitude);
    test.result.description = game.i18n.localize(`ROLL.${tier}${success ? "Success" : "Failure"}`);
    return changed;
  }

  /**
   * Whether an Item makes a Melee Test in the 5e sense (p.168): a melee weapon or trait attack, or a roll of the
   * Melee Skill itself. Momentum grants Advantage on these and is won and lost on these, so both halves of the rule
   * have to agree on what one is - hence a single predicate rather than a check at each site.
   *
   * @param {Item|object} item
   * @returns {boolean}
   */
  static isMeleeItem(item) {
    if (!item) return false;
    if (item.attackType == "melee") return true;
    return item.type == "skill" && !!item.name?.startsWith(game.i18n.localize("NAME.Melee"));
  }

  /**
   * 5e (p.130): a double is a Critical or a Fumble whatever the target number - unlike 4e, where a double only
   * counted if the roll also came in under the Skill. Which of the two it is follows the Test's outcome once SL
   * modifiers are in, and resolveOutcome has already settled that, including the roll-against-target tiebreak at
   * exactly 0 SL.
   *
   * @param {number} roll d100 result
   * @param {string} outcome The Test's resolved outcome, "success" or "failure"
   * @returns {"critical"|"fumble"|""} "" when the roll is not a double
   */
  static criticalFumble(roll, outcome) {
    let value = Number(roll);
    // A d100 never rolls 0, but the dummy test built for an unopposed defender carries one, and 0 % 11 is 0
    if (!Number.isFinite(value) || value < 1) return "";
    // 100 shows as 00, so it is a double too, but 100 % 11 is 1
    if (value % 11 != 0 && value != 100) return "";
    return outcome == "success" ? "critical" : "fumble";
  }

  /**
   * 5e (p.165), verbatim: "If you are using a Blackpowder, Engineering, or Explosive weapon and roll 99 or 00,
   * your weapon Misfires: roll on the Misfire Table instead of the Oops! Table." 4e Misfires on any *even* Fumble
   * and prints inline damage instead, so both halves of the rule change.
   *
   * The Fumble itself is the caller's business - p.165 substitutes one Fumble table for another, so a Misfire only
   * arises where an Oops! would have. Nothing is lost by leaving it out of the predicate: 96-100 is always a
   * failure (p.130) and both 99 and 00 are doubles, so every 99 and 00 on one of these weapons already Fumbles
   * under either outcome path.
   *
   * @param {number} roll d100 result; 00 is the value 100
   * @param {string} weaponGroup The weapon's `weaponGroup.value`
   * @returns {boolean}
   */
  static misfires(roll, weaponGroup) {
    if (!this.MISFIRE_GROUPS.includes(weaponGroup)) return false;
    let value = Number(roll);
    return value === 99 || value === 100;
  }

  /* -------------------------------------------- */
  /*  Advantage / Disadvantage (p.130)            */
  /* -------------------------------------------- */

  /**
   * Resolve counted Advantage and Disadvantage sources into the reversal the test pipeline already understands.
   * Sources cancel one for one; the first surviving source reverses the dice, each extra source is ±1 SL.
   *
   * @param {object} preData Test preData (mutated: `reversal`)
   * @returns {{net: number, extraSL: number}|null} null if the mechanic is off or nothing applies
   */
  static resolveAdvantage(preData) {
    if (!this.usesAdvantage) return null;

    let advantage = Number(preData.advSources) || 0;
    let disadvantage = Number(preData.disSources) || 0;

    // Tests are recomputed (opposed modifiers, edits), so remember the reversal scripts asked for before we overwrite it
    if (!preData.feLegacyReversal) {
      preData.feLegacyReversal = foundry.utils.deepClone(preData.reversal || { allowed: false, if: "better" });
    }
    let legacy = preData.feLegacyReversal;

    // Scripts that ask for a plain "better"/"worse" reversal count as one source
    if (legacy.allowed && legacy.if == "better") advantage++;
    if (legacy.allowed && legacy.if == "worse") disadvantage++;

    let net = advantage - disadvantage;
    if (net == 0) {
      preData.reversal = ["better", "worse"].includes(legacy.if) ? { allowed: false, if: "better" } : foundry.utils.deepClone(legacy);
      return (advantage || disadvantage) ? { net, extraSL: 0 } : null;
    }

    preData.reversal = { allowed: true, if: net > 0 ? "better" : "worse" };
    let extraSL = (Math.abs(net) - 1) * Math.sign(net);
    return { net, extraSL };
  }

  /* -------------------------------------------- */
  /*  Preset                                      */
  /* -------------------------------------------- */

  /**
   * One-click configuration for a 5th Edition game. Sets the existing settings whose 4e-supplement rules are 5e core,
   * and turns on every 5th Edition toggle.
   */
  static async applyPreset() {
    const world = {
      useWoMOvercast: true,          // Overcasting and Critical Casting (p.235-236)
      useWoMChannelling: true,       // SL pool channelling (p.236)
      useWoMInfluences: true,        // Malignant Influences (p.237)
      uiaCrits: true,                // +10 on the Critical table per Wound past 0 (p.171)
      uiaBleeding: true,             // Bleeding at 0 Wounds: Endurance Test or Unconscious (p.185)
      criticalsFumblesOnAllTests: true, // Doubles are Criticals/Fumbles on every Test (p.130)
      testDefaultDifficulty: false,  // Default difficulty is Challenging (p.131)
      useGroupAdvantage: false,      // Momentum is per-character (p.168)
      capAdvantageIB: false,
      advantagemax: 1,               // You either have Momentum or you don't (p.168)
      initiativeRule: "d10InitBonus" // d10 + Initiative Bonus (p.161)
    };

    for (let [key, value] of Object.entries(world)) {
      if (game.settings.get("wfrp4e", key) !== value) {
        await game.settings.set("wfrp4e", key, value);
      }
    }

    let homebrew = foundry.utils.deepClone(game.settings.get("wfrp4e", "homebrew"));
    homebrew.uiaCritsMod = 10;
    homebrew.mooPenetrating = true;  // Penetrating ignores 2 AP (p.305)
    homebrew.advantageBonus = 0;     // Momentum grants Advantage, not a flat bonus
    for (let key of this.TOGGLES) {
      homebrew[`fifthEd${key}`] = true;
    }
    await game.settings.set("wfrp4e", "homebrew", homebrew);

    ui.notifications.info(game.i18n.localize("FIFTHED.PresetApplied"));
  }
}
