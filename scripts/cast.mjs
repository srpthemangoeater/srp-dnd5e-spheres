import { categoryLabel } from "../src/categories.mjs";
import { SPHERES_B } from "../src/spheres-b.mjs";
import { cardFlags, postCastPreview } from "./chat.mjs";
import { MODULE_ID, SP_TARGET, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { casterLevel, computeSpheres, defaultEffects, getSpellPointsItem, isFeatureType, itemFlags, spellPointState, tierDice } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Activities currently being used through the cast dialog, so the usage hook lets them through. */
const CASTING = new Set();

/** Area templates chosen in the cast dialog (blast shapes, shape augments), applied when the activity is used. */
const PENDING_TEMPLATES = new Map();

/** Every spirit ability by package, with the (spirit) talent that grants it, to show what each package offers. */
const SPIRIT_CATALOG = (SPHERES_B.find(s => s.key === "nature")?.talents ?? []).flatMap(([talent, category, , , extra]) =>
  (category === "spirit") ? (extra?.abilities ?? []).map(a => ({ talent, name: a.name, cost: a.cost ?? 0, package: a.package ?? null,
    summary: a.summary })) : []);

/** Nature packages in display order. */
const NATURE_PACKAGES = ["Air Package", "Earth Package", "Fire Package", "Metal Package", "Plant Package", "Water Package"];
const GENERAL = "general";
const castKey = activity => `${activity.actor?.id}.${activity.item?.id}.${activity.id}`;

/** Sphere ability metadata for an activity, or null if it is not a sphere ability. */
export const abilityMeta = activity => itemFlags(activity?.item).abilities?.[activity?.id] ?? null;

const plainText = html => {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  return div.querySelector("p")?.textContent ?? div.textContent ?? "";
};

/** All paragraphs of a description except the wiki link line. */
const fullText = html => {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  return [...div.querySelectorAll("p")].map(p => p.textContent.trim())
    .filter(t => t && !t.startsWith("Full rules:")).join(" ");
};


/** A section of an item description: the paragraph that follows `<h3>name</h3>`. */
const sectionText = (item, name) => plainText(item?.system.description?.value?.split(`<h3>${name}</h3>`)[1] ?? "");

/** Readable area for a template tuple [type, size, width, height]. */
const areaLabel = ([type, size, width, height]) => {
  const label = CONFIG.DND5E.areaTargetTypes[type]?.label ?? type;
  const extra = [width && (type !== "cone") ? `${width} ft ${type === "wall" ? "thick" : "wide"}` : null, height ? `${height} ft high` : null].filter(_ => _);
  return `${size} ft ${game.i18n.localize(label).toLowerCase()}${extra.length ? ` (${extra.join(", ")})` : ""}`;
};

/** Short rules line for an activity: action, range, duration and save or attack. */
const activityInfo = activity => {
  if ( !activity ) return "";
  const labels = activity.labels ?? {};
  const parts = [labels.activation, labels.range, labels.concentrationDuration || labels.duration];
  if ( activity.type === "save" ) {
    const ability = activity.save?.ability?.first?.() ?? [...(activity.save?.ability ?? [])][0];
    const label = CONFIG.DND5E.abilities[ability]?.label;
    if ( label ) parts.push(game.i18n.format("DND5E-SPHERES.Cast.Save", { ability: label }));
  }
  else if ( activity.type === "attack" ) parts.push(game.i18n.localize("DND5E-SPHERES.Cast.SpellAttack"));
  return parts.filter(_ => _).join(" · ");
};

/**
 * Configure and cast a sphere ability: choose talents and augments, check the spell point cost against the
 * proficiency cap and the pool, then use the dnd5e activity with the cost as its consumption scaling.
 *
 * Package roots are cast in steps: choose one of the actor's packages, then one of its abilities, with the package's
 * talents applying as modifiers. Geomancy and Universal's Package Ability list each package's own abilities; Spirit
 * lists the spirit abilities the actor's (spirit) talents grant for each package, and shows the ones still missing.
 */
export class CastDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(activity, options={}) {
    super(options);
    this.activity = activity;
    this.item = activity.item;
    this.actor = activity.actor;
    this.meta = abilityMeta(activity);
    this.#openFromPackage();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "cast-dialog", "dnd5e2"],
    tag: "form",
    window: { icon: "fas fa-wand-magic-sparkles", resizable: true },
    position: { width: 540, height: "auto" },
    form: { handler: CastDialog.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: { cancel: CastDialog.#onCancel, sendToChat: CastDialog.#onSendToChat }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.cast } };

  /**
   * Selected options. Package roots only: `pkg` is the chosen package (an item id, or a package name for Spirit),
   * `subItem` and `sub` the item and activity of the chosen ability. `groups[key]` is a talent id (or a Set for
   * multi-select groups), `augments` holds keys.
   */
  #state = { pkg: "", subItem: "", sub: "", groups: {}, augments: new Set(), option: "", choice: "" };

  /** @override */
  get title() {
    return `${this.meta.name}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  get sphereKey() {
    return itemFlags(this.item).sphere ?? this.item.system.identifier;
  }

  /** How a package root lists abilities: "package" (each package's own) or "spirit" (from spirit talents). */
  get rootMode() {
    const mode = this.meta.packages;
    return mode === true ? "package" : (mode || null);
  }

  /** Is this a package root, cast by choosing a package and then one of its abilities? */
  get isRoot() {
    return !!this.rootMode;
  }

  /** The actor's package items for this sphere. */
  #packageItems(withAbilities) {
    return this.actor.items.filter(i => isFeatureType(i, "talent") && (itemFlags(i).sphere === this.sphereKey)
      && (itemFlags(i).category === "package")
      && (!withAbilities || Object.values(itemFlags(i).abilities ?? {}).some(m => !m.hidden)))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** The actor's (spirit) talents. */
  get #spiritTalents() {
    return this.actor.items.filter(i => isFeatureType(i, "talent") && (itemFlags(i).sphere === this.sphereKey)
      && (itemFlags(i).category === "spirit"));
  }

  /**
   * The packages to choose from, as { key, name }. For Spirit these are the actor's Nature packages (all of them with
   * Master of Elements), plus General for spirit abilities any package can use.
   */
  get packages() {
    if ( this.rootMode !== "spirit" ) return this.#packageItems(true).map(i => ({ key: i.id, name: i.name }));
    const owned = this.#packageItems(false).map(i => i.name);
    const master = this.actor.items.some(i => isFeatureType(i, "talent") && (i.name === "Master of Elements"));
    const names = master ? NATURE_PACKAGES : NATURE_PACKAGES.filter(n => owned.includes(n));
    const list = names.map(name => ({ key: name, name, borrowed: !owned.includes(name) }));
    if ( this.#spiritAbilities(GENERAL).length ) {
      list.push({ key: GENERAL, name: game.i18n.localize("DND5E-SPHERES.Cast.GeneralSpirit") });
    }
    return list;
  }

  /** Name of the chosen package (null for none or General). */
  get packageName() {
    if ( !this.isRoot || !this.#state.pkg || (this.#state.pkg === GENERAL) ) return null;
    return this.rootMode === "spirit" ? this.#state.pkg : (this.actor.items.get(this.#state.pkg)?.name ?? null);
  }

  /** The item that holds the chosen ability (a package, or a spirit talent). */
  get subItem() {
    return this.isRoot ? (this.actor.items.get(this.#state.subItem) ?? null) : null;
  }

  get subMeta() {
    return itemFlags(this.subItem).abilities?.[this.#state.sub] ?? null;
  }

  get subActivity() {
    return this.subMeta ? this.subItem.system.activities.get(this.#state.sub) : null;
  }

  /**
   * Abilities offered under a package key: [{ item, id, meta }] the actor can cast, plus (for Spirit) the ones a
   * (spirit) talent the actor lacks would grant, as [{ missing: talentName, name, cost, summary }].
   */
  #spiritAbilities(key, { missing=false }={}) {
    const pkg = key === GENERAL ? null : key;
    const owned = this.#spiritTalents.flatMap(item => Object.entries(itemFlags(item).abilities ?? {})
      .filter(([, m]) => !m.hidden && ((m.package ?? null) === pkg)).map(([id, meta]) => ({ item, id, meta })));
    if ( !missing || !pkg ) return owned;
    const have = new Set(this.#spiritTalents.map(t => t.name));
    return owned.concat(SPIRIT_CATALOG.filter(a => (a.package === pkg) && !have.has(a.talent))
      .map(a => ({ missing: a.talent, name: a.name, cost: a.cost, summary: a.summary })));
  }

  /** The castable abilities under a package key, as [{ item, id, meta }]. */
  #abilitiesUnder(key) {
    if ( this.rootMode === "spirit" ) return this.#spiritAbilities(key);
    const item = this.actor.items.get(key);
    return Object.entries(itemFlags(item).abilities ?? {}).filter(([, m]) => !m.hidden).map(([id, meta]) => ({ item, id, meta }));
  }

  /** The ability actually cast: the chosen package ability, or this ability itself. */
  get castMeta() {
    return this.subMeta ?? this.meta;
  }

  /**
   * A package or spirit ability opened directly (from its talent row) is shown under its root (Geomancy, Spirit,
   * Package Ability) with it already chosen, when the actor has that root.
   */
  #openFromPackage() {
    const category = itemFlags(this.item).category;
    if ( this.isRoot || !["package", "spirit"].includes(category) ) return;
    const mode = category === "spirit" ? "spirit" : "package";
    const sphere = this.actor.items.find(i => isFeatureType(i, "sphere") && (itemFlags(i).sphere === itemFlags(this.item).sphere));
    const rootId = Object.entries(itemFlags(sphere).abilities ?? {})
      .find(([, m]) => (m.packages === true ? "package" : m.packages) === mode)?.[0];
    const root = sphere?.system.activities.get(rootId);
    if ( !root ) return;
    this.#state.pkg = mode === "spirit" ? (this.meta.package ?? GENERAL) : this.item.id;
    this.#state.subItem = this.item.id;
    this.#state.sub = this.activity.id;
    this.activity = root;
    this.item = sphere;
    this.meta = abilityMeta(root);
  }

  /** Group keys and multi-select keys of the root and the chosen package ability. */
  get #groupDefs() {
    const sub = this.subMeta;
    if ( this.isRoot && !sub ) return { groups: {}, multi: [] };
    return {
      groups: { ...(this.meta.groups ?? {}), ...(sub?.groups ?? {}) },
      multi: [...(this.meta.multi ?? []), ...(sub?.multi ?? [])]
    };
  }

  /** Talents usable with this ability: the sphere's own talents plus talents that apply to every sphere. */
  get talents() {
    return this.actor.items.filter(i => isFeatureType(i, "talent")
      && ((itemFlags(i).sphere ?? i.system.type?.subtype) === this.sphereKey || itemFlags(i).appliesAll));
  }

  /** A talent limited to some packages applies only when one of them is chosen. */
  #fitsPackage(talent) {
    const packages = itemFlags(talent).packages;
    if ( !packages?.length || !this.isRoot ) return true;
    return !!this.packageName && packages.includes(this.packageName);
  }

  /** Current selection of a group, set up on first use (blast types preselect the first option). */
  #groupState(key, multi, options) {
    if ( !(key in this.#state.groups) ) {
      this.#state.groups[key] = multi ? new Set() : ((key === "blastType") && options[0] ? options[0].id : "");
    }
    return this.#state.groups[key];
  }

  /** Build the option lists and the running total. */
  #options() {
    const actor = this.actor;
    const talents = this.talents;
    const cast = this.castMeta;
    const { groups: groupDefs, multi: multiKeys } = this.#groupDefs;
    const groupKeys = Object.keys(groupDefs);
    const cost = t => Number(itemFlags(t).cost) || 0;

    const groups = groupKeys.map(key => {
      const multi = multiKeys.includes(key);
      const candidates = talents.filter(t => (itemFlags(t).category === key) && this.#fitsPackage(t));
      const selected = this.#groupState(key, multi, candidates);
      const options = candidates.map(t => ({
        id: t.id, name: t.name, cost: cost(t), summary: plainText(t.system.description?.value),
        selected: multi ? selected.has(t.id) : selected === t.id
      }));
      return { key, label: groupDefs[key], multi, options, none: !multi && !options.some(o => o.selected) };
    });

    const hasTalent = name => actor.items.some(i => i.name === name && isFeatureType(i, "talent"));
    const castKeys = [this.meta.key, cast.key];
    const chosenTalents = groups.flatMap(g => g.options.filter(o => o.selected)).map(o => actor.items.get(o.id));

    // A chosen talent with options (e.g. Physical Enhancement): pick one that fits this ability (enhance or degrade).
    const optionTalent = chosenTalents.find(t => itemFlags(t).options?.some(o => !o.mode || (o.mode === cast.key)));
    const optionList = (itemFlags(optionTalent).options ?? []).filter(o => !o.mode || (o.mode === cast.key));
    const option = optionList.find(o => o.key === this.#state.option) ?? optionList[0] ?? null;
    const choiceKeys = Object.keys(option?.choice?.values ?? {});
    const choice = choiceKeys.includes(this.#state.choice) ? this.#state.choice : (choiceKeys[0] ?? "");
    const optionGroup = optionTalent ? {
      talent: optionTalent.name,
      options: optionList.map(o => ({ key: o.key, name: o.name, summary: o.summary, cost: o.cost ?? null,
        effect: !!(o.changes || o.statuses), selected: o === option })),
      choice: option?.choice ? { label: option.choice.label,
        values: Object.entries(option.choice.values).map(([key, label]) => ({ key, label, selected: key === choice })) } : null
    } : null;
    const augments = (this.isRoot && !this.subMeta) ? [] : [
      ...(cast.augments ?? []).filter(a => !a.talent || hasTalent(a.talent)).map(a => ({
        key: `base.${a.key}`, label: a.label, cost: a.cost, template: a.template ?? null
      })),
      // Augments of the chosen option (e.g. Speed Control's degrade).
      ...(option?.augments ?? []).map(a => ({ key: `opt.${a.key}`, label: a.label, cost: a.cost })),
      // Area options of the chosen blast shape (e.g. Sculpt as a cone or a line).
      ...chosenTalents.flatMap(t => (itemFlags(t).shapeOptions ?? []).filter(o => !o.talent || hasTalent(o.talent)).map(o => ({
        key: `shape.${o.key}`, label: o.label, cost: o.cost, template: o.template, shape: t.name
      }))),
      ...talents.filter(t => {
        const f = itemFlags(t);
        if ( (f.cost === undefined) || groupKeys.includes(f.category) || !this.#fitsPackage(t) ) return false;
        return f.appliesAll || castKeys.some(k => f.applies?.includes(k));
      }).map(t => ({ key: `talent.${t.id}`, label: t.name, cost: cost(t), summary: plainText(t.system.description?.value) }))
    ].map(a => ({ ...a, selected: this.#state.augments.has(a.key) }));

    const selectedTalents = groups.flatMap(g => g.options.filter(o => o.selected));
    const selectedAugments = augments.filter(a => a.selected);
    // An option with its own cost replaces the ability's base cost.
    const total = Math.max(0, (option?.cost ?? cast.cost ?? 0)
      + selectedTalents.reduce((s, o) => s + o.cost, 0)
      + selectedAugments.reduce((s, a) => s + a.cost, 0));

    const data = computeSpheres(actor);
    const pool = spellPointState(actor);
    const overCap = getSetting("enforceCap") && (total > data.cap);
    const noPool = (total > 0) && !pool.item;
    const overPool = !!pool.item && (total > pool.value);
    const needsChoice = this.isRoot && !this.subMeta;
    // The area: a chosen augment's shape, else the chosen talent's (blast shape), else the ability's own.
    const template = selectedAugments.findLast(a => a.template)?.template
      ?? chosenTalents.map(t => itemFlags(t).template).find(_ => _) ?? null;
    return {
      groups, augments, total, cap: data.cap, pool, overCap, noPool, overPool, needsChoice, template,
      optionGroup, option, choice, optionTalent,
      area: template ? areaLabel(template) : null,
      canCast: !overCap && !noPool && !overPool && !needsChoice,
      selectedTalents: selectedTalents.map(o => actor.items.get(o.id)),
      selectedAugments
    };
  }

  /** The package tree of a root: each package with its abilities, the chosen ones marked. */
  #packageTree() {
    return this.packages.map(pkg => {
      const selected = pkg.key === this.#state.pkg;
      const list = this.rootMode === "spirit" ? this.#spiritAbilities(pkg.key, { missing: true }) : this.#abilitiesUnder(pkg.key);
      const abilities = list.map(entry => {
        if ( entry.missing ) return {
          value: "", name: entry.name, cost: entry.cost, summary: entry.summary, disabled: true,
          info: game.i18n.format("DND5E-SPHERES.Cast.NeedsTalent", { talent: entry.missing })
        };
        const { item, id, meta } = entry;
        return {
          value: `${pkg.key}|${item.id}|${id}`, name: meta.name, cost: meta.cost ?? 0,
          info: activityInfo(item.system.activities.get(id)), summary: sectionText(item, meta.name),
          source: item.id === pkg.key ? null : item.name,
          damage: meta.fx ? this.#previewFormula(meta) : null,
          selected: selected && (item.id === this.#state.subItem) && (id === this.#state.sub)
        };
      });
      const count = abilities.filter(a => !a.disabled).length;
      return { key: pkg.key, name: pkg.name, borrowed: pkg.borrowed, selected, abilities, count };
    });
  }

  /** Base damage formula of a package ability before modifiers, for the ability list. */
  #previewFormula(meta) {
    const formula = defaultEffects(this.actor, computeSpheres(this.actor))[meta.fx];
    return formula ? Roll.replaceFormulaData(formula, this.actor.getRollData(), { missing: "0" }) : null;
  }

  /** @override */
  async _prepareContext(options) {
    const opts = this.#options();
    const data = computeSpheres(this.actor);
    const sub = this.subMeta;
    return {
      ...opts,
      ability: this.castMeta,
      root: this.isRoot ? { packages: this.#packageTree(), none: !this.packages.length } : null,
      path: this.#path(),
      info: activityInfo(this.subActivity ?? this.activity),
      description: sub ? sectionText(this.subItem, sub.name) : this.#abilitySummary(),
      damage: this.#damagePreview(opts),
      dc: data.dc,
      attack: data.attack
    };
  }

  /** The damage or healing this cast will roll with the current choices, e.g. "3d8 fire". */
  #damagePreview(opts) {
    const effect = this.#effect(opts);
    if ( !effect?.formula ) return null;
    const formula = Roll.replaceFormulaData(effect.formula, this.actor.getRollData(), { missing: "0" });
    const type = effect.damageType ? CONFIG.DND5E.damageTypes[effect.damageType]?.label ?? effect.damageType : "";
    return `${formula}${type ? ` ${type.toLowerCase()}` : ""}`;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("change", this.#onChange.bind(this));
  }

  #onChange(event) {
    const { name, value, checked } = event.target;
    if ( name === "package" || name === "packageAbility" ) {
      // Choosing a package picks its first ability; either change resets talents and augments.
      let pkg = value;
      let subItem = "";
      let sub = "";
      if ( name === "package" ) {
        const first = this.#abilitiesUnder(value)[0];
        if ( first ) [subItem, sub] = [first.item.id, first.id];
      }
      else [pkg, subItem, sub] = value.split("|");
      Object.assign(this.#state, { pkg, subItem, sub, groups: {} });
      this.#state.augments.clear();
    }
    else if ( name?.startsWith("group.") ) {
      const key = name.slice(6);
      this.#state.groups[key] = value;
      Object.assign(this.#state, { option: "", choice: "" });
      for ( const k of [...this.#state.augments] ) if ( k.startsWith("opt.") ) this.#state.augments.delete(k);
    }
    else if ( name === "option" ) {
      Object.assign(this.#state, { option: value, choice: "" });
      for ( const k of [...this.#state.augments] ) if ( k.startsWith("opt.") ) this.#state.augments.delete(k);
    }
    else if ( name === "choice" ) this.#state.choice = value;
    else if ( name?.startsWith("multi.") ) {
      const [, key, id] = name.split(".");
      if ( checked ) this.#state.groups[key].add(id);
      else this.#state.groups[key].delete(id);
    }
    else if ( name?.startsWith("aug.") ) {
      const key = name.slice(4);
      const defs = this.castMeta.augments ?? [];
      if ( checked ) {
        // Only one area shape at a time.
        const area = this.#options().augments;
        if ( area.find(a => a.key === key)?.template ) {
          for ( const a of area ) if ( a.template ) this.#state.augments.delete(a.key);
        }
        this.#state.augments.add(key);
        // Some augments are upgrades of another (powerful charm instead of greater charm).
        const def = defs.find(a => `base.${a.key}` === key);
        if ( def?.replaces ) this.#state.augments.delete(`base.${def.replaces}`);
        for ( const a of defs ) {
          if ( def && (a.replaces === def.key) ) this.#state.augments.delete(`base.${a.key}`);
        }
      }
      else this.#state.augments.delete(key);
    }
    else return;
    this.render();
  }

  /* -------------------------------------------- */

  /** Work out the damage or healing formula and damage type for the chosen options. */
  #effect(opts) {
    const actor = this.actor;
    const level = casterLevel(actor);
    const data = computeSpheres(actor);
    const rollData = actor.getRollData();
    const talents = opts.selectedTalents.concat(
      opts.selectedAugments.filter(a => a.key.startsWith("talent.")).map(a => actor.items.get(a.key.slice(7)))
    ).filter(_ => _);
    const flags = talents.map(t => itemFlags(t));
    const bonus = flags.map(f => f.bonus).filter(_ => _)
      .map(b => Roll.replaceFormulaData(b, rollData, { missing: "0" })).join(" + ");
    const withBonus = formula => bonus ? `${formula} + ${bonus}` : formula;
    const damageType = flags.find(f => f.dt)?.dt ?? null;

    switch ( this.castMeta.fx ) {
      case "blast": {
        const dice = this.#state.augments.has("base.empower") ? 1 + Math.floor(level / 2) : tierDice(level);
        return { key: "blast", formula: withBonus(`${dice}d8`), damageType };
      }
      case "cure":
        return { key: "cure", formula: flags.some(f => f.healFlat)
          ? `${5 * level} + ${data.kamMod}` : withBonus(`${tierDice(level)}d8 + ${data.kamMod}`) };
      case "invigorate":
        return { key: "invigorate", formula: flags.some(f => f.tempFlat) ? `${5 * tierDice(level)}` : `${data.prof}` };
      case "projectile": {
        const base = level >= 17 ? "2d8" : level >= 11 ? "2d6" : level >= 5 ? "1d8" : "1d6";
        return { key: "projectile", formula: withBonus(base), damageType };
      }
      default: {
        const fx = this.castMeta.fx;
        if ( !fx ) return null;
        // Other damaging abilities (e.g. Nature geomancy): level-based default plus talent and augment bonuses.
        let formula = withBonus(defaultEffects(actor, data)[fx] ?? "0");
        if ( this.#state.augments.has("base.bonus") ) formula += ` + ${data.kamMod}`;
        return { key: fx, formula, damageType };
      }
    }
  }

  /** The activity to use: the chosen package ability, or the attack variant for blast shapes that use spell attacks. */
  #activityToUse(opts) {
    if ( this.subActivity ) return this.subActivity;
    const attack = opts.selectedTalents.some(t => itemFlags(t).attack);
    if ( !attack ) return this.activity;
    const abilities = itemFlags(this.item).abilities ?? {};
    const id = Object.entries(abilities).find(([, m]) => m.key === `${this.meta.key}Attack`)?.[0];
    return this.item.system.activities.get(id) ?? this.activity;
  }

  /** Set while the cast runs, so a second click cannot cast twice. */
  #casting = false;

  static async #onSubmit() {
    if ( this.#casting ) return;
    const opts = this.#options();
    if ( !opts.canCast ) {
      ui.notifications.warn("DND5E-SPHERES.Cast.CannotCast", { localize: true });
      throw new Error("Cannot cast");
    }
    const effect = this.#effect(opts);
    const activity = this.#activityToUse(opts);
    if ( effect ) await this.actor.update({ [`flags.${MODULE_ID}.cast.${effect.key}`]: effect.formula });
    if ( effect?.damageType ) await activity.item.setFlag("dnd5e", `last.${activity.id}.damageType`, { 0: effect.damageType });

    const key = castKey(activity);
    CASTING.add(key);
    if ( opts.template ) PENDING_TEMPLATES.set(key, opts.template);
    this.#casting = true;
    try {
      const usage = { scaling: opts.total, ...(opts.template ? { create: { measuredTemplate: true } } : {}) };
      await activity.use(usage, { configure: false },
        { data: { flags: { [MODULE_ID]: cardFlags(this.actor, this.#castData(opts, effect)) } } });
    } finally {
      CASTING.delete(key);
      PENDING_TEMPLATES.delete(key);
      this.#casting = false;
    }
  }

  /** Where the cast ability sits: sphere > ability, or sphere > root > package > package ability. */
  #path() {
    const sphere = SPHERE_NAMES[this.sphereKey] ?? this.item.name;
    if ( this.subMeta ) return [sphere, this.meta.name,
      this.packageName ?? game.i18n.localize("DND5E-SPHERES.Cast.GeneralSpirit"), this.subMeta.name];
    if ( ["package", "spirit"].includes(itemFlags(this.item).category) ) return [sphere, this.item.name, this.meta.name];
    return [sphere, this.meta.name];
  }

  /** Everything the chat card needs to describe this cast, including the full text of each choice. */
  #castData(opts, effect) {
    const details = opts.selectedTalents.map(t => ({
      name: t.name, category: categoryLabel(itemFlags(t).category), cost: Number(itemFlags(t).cost) || 0,
      summary: fullText(t.system.description?.value)
    }));
    const augmentDetails = opts.selectedAugments.map(a => {
      const item = a.key.startsWith("talent.") ? this.actor.items.get(a.key.slice(7)) : null;
      return { label: a.label, cost: a.cost, summary: item ? fullText(item.system.description?.value) : "" };
    });
    const sub = this.subMeta;
    return {
      sphere: this.item.name,
      ability: this.castMeta.name,
      path: this.#path(),
      info: [activityInfo(this.#activityToUse(opts)), opts.area].filter(_ => _).join(" · "),
      summary: sub ? sectionText(this.subItem, sub.name) : this.#abilitySummary(),
      talents: details.map(d => d.name),
      augments: augmentDetails.map(a => a.label),
      details,
      augmentDetails,
      total: opts.total,
      formula: effect?.formula ?? null,
      fxKey: effect?.key ?? null,
      damageType: effect?.damageType ?? null,
      option: opts.option ? { talent: opts.optionTalent.name, name: opts.option.name, mode: opts.option.mode,
        choice: opts.option.choice?.values?.[opts.choice] ?? null, summary: opts.option.summary } : null,
      effect: this.#effectData(opts)
    };
  }

  /**
   * The Active Effect a chosen option applies to its targets (Enhancement), with its placeholders filled in:
   * {choice} (the choice made), {speedBonus} (10 ft, +5 ft at 5th, 11th and 17th level) and {halfProf}.
   */
  #effectData(opts) {
    const option = opts.option;
    if ( !option || (!option.changes && !option.statuses) ) return null;
    const level = casterLevel(this.actor);
    const prof = this.actor.system.attributes?.prof ?? 0;
    const vars = { choice: opts.choice, speedBonus: 5 + (5 * tierDice(level)), halfProf: Math.floor(prof / 2) };
    const fill = v => typeof v === "string" ? v.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : v;
    const list = Array.isArray(option.changes) ? option.changes : (option.changes?.[opts.choice] ?? []);
    const choice = option.choice?.values?.[opts.choice];
    const mode = game.i18n.localize(`DND5E-SPHERES.Cast.Mode.${option.mode}`);
    const duration = this.#activityToUse(opts).duration;
    return {
      name: `${option.name}${choice ? ` (${choice})` : ""}: ${mode}`,
      img: opts.optionTalent?.img ?? this.item.img,
      description: `<p>${option.summary}</p>`,
      changes: list.map(([key, type, value]) => ({ key: fill(key), type, value: String(fill(value)) })),
      statuses: (option.statuses ?? []).map(fill),
      duration: duration?.units && Number.isNumeric(duration.value) ? { value: Number(duration.value), units: `${duration.units}s` } : null,
      concentration: !!duration?.concentration && !opts.selectedAugments.some(a => a.key === "base.noConc")
    };
  }

  /** The ability's own paragraph from the sphere (or package) description. */
  #abilitySummary() {
    return sectionText(this.item, this.meta.name);
  }

  static #onCancel() {
    this.close();
  }

  /** Post the current choices to chat without casting. */
  static async #onSendToChat() {
    const opts = this.#options();
    if ( opts.needsChoice ) return ui.notifications.warn("DND5E-SPHERES.Cast.ChoosePackage", { localize: true });
    await postCastPreview(this.actor, this.#castData(opts, this.#effect(opts)));
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** Send sphere abilities through the cast dialog. */
function onPreUseActivity(activity) {
  const meta = abilityMeta(activity);
  if ( !meta || !activity.actor || CASTING.has(castKey(activity)) ) return;
  const original = activity.actor.items.get(activity.item.id)?.system.activities.get(activity.id) ?? activity;
  new CastDialog(original).render({ force: true });
  return false;
}

/**
 * Point the spell point placeholder target at the actor's pool right before consumption is calculated.
 * Only the prepared data is changed: this runs after usage scaling (which re-prepares the item), and changing the
 * source would reset the activity's prepared fields, such as the duration.getEffectData concentration needs.
 * Without a pool nothing is spent: casts that cost spell points are blocked by the dialog, and free ones consume nothing.
 */
function onPreActivityConsumption(activity) {
  if ( !abilityMeta(activity) || !activity.actor ) return;
  // The area chosen in the cast dialog replaces the activity's own for this use (prepared data only).
  const area = PENDING_TEMPLATES.get(castKey(activity));
  if ( area && activity.target?.template ) {
    const [type, size, width, height] = area;
    Object.assign(activity.target.template, { type, size: Number(size), width: width ? Number(width) : null,
      height: height ? Number(height) : null, count: 1, units: "ft" });
  }

  const pool = getSpellPointsItem(activity.actor);
  if ( !pool ) return;
  for ( const target of activity.consumption?.targets ?? [] ) {
    if ( target.target === SP_TARGET ) target.target = pool.id;
  }
}

/**
 * Damage rolled from a sphere chat card uses that card's formula (e.g. an empowered blast), not the formula of the
 * caster's latest cast, and its damage type.
 */
function onPreRollDamage(config, dialog, message) {
  if ( !abilityMeta(config.subject) ) return;
  const id = config.event?.target?.closest?.("[data-message-id]")?.dataset.messageId ?? message?.data?.system?.origin;
  const cast = game.messages.get(id)?.flags?.[MODULE_ID]?.cast;
  if ( !cast?.formula || !cast.fxKey ) return;
  for ( const roll of config.rolls ?? [] ) {
    const spheres = roll.data?.spheres;
    if ( !spheres?.fx ) continue;
    roll.data.spheres = { ...spheres, fx: { ...spheres.fx, [cast.fxKey]: cast.formula } };
    if ( cast.damageType && roll.options ) roll.options.type = cast.damageType;
  }
}

export function registerCastHooks() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.preRollDamageV2", onPreRollDamage);
  Hooks.on("dnd5e.preActivityConsumption", onPreActivityConsumption);
}
