import { categoryLabel } from "../src/categories.mjs";
import { cardFlags, postCastPreview } from "./chat.mjs";
import { MODULE_ID, SP_TARGET, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { computeSpheres, defaultEffects, getSpellPointsItem, isFeatureType, itemFlags, spellPointState, tierDice } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Activities currently being used through the cast dialog, so the usage hook lets them through. */
const CASTING = new Set();
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
 * Package roots (Nature's Geomancy, Universal's Package Ability) are cast in steps: choose one of the actor's
 * packages, then one of that package's abilities, with the package's talents applying as modifiers.
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
   * Selected options: `pkg` and `sub` are the chosen package item and its activity (package roots only),
   * `groups[key]` is a talent id (or a Set for multi-select groups), `augments` holds keys.
   */
  #state = { pkg: "", sub: "", groups: {}, augments: new Set() };

  /** @override */
  get title() {
    return `${this.meta.name}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  get sphereKey() {
    return itemFlags(this.item).sphere ?? this.item.system.identifier;
  }

  /** Is this a package root, cast by choosing a package and then one of its abilities? */
  get isRoot() {
    return !!this.meta.packages;
  }

  /** The actor's packages for this sphere that grant abilities. */
  get packages() {
    return this.actor.items.filter(i => isFeatureType(i, "talent") && (itemFlags(i).sphere === this.sphereKey)
      && (itemFlags(i).category === "package") && Object.values(itemFlags(i).abilities ?? {}).some(m => !m.hidden))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** The chosen package and package ability, when casting from a root. */
  get package() {
    return this.isRoot ? (this.actor.items.get(this.#state.pkg) ?? null) : null;
  }

  get subMeta() {
    return itemFlags(this.package).abilities?.[this.#state.sub] ?? null;
  }

  get subActivity() {
    return this.subMeta ? this.package.system.activities.get(this.#state.sub) : null;
  }

  /** The ability actually cast: the chosen package ability, or this ability itself. */
  get castMeta() {
    return this.subMeta ?? this.meta;
  }

  /** A package ability opened directly (from its package row) is shown under its root when the actor has one. */
  #openFromPackage() {
    if ( this.isRoot || (itemFlags(this.item).category !== "package") ) return;
    const sphere = this.actor.items.find(i => isFeatureType(i, "sphere") && (itemFlags(i).sphere === itemFlags(this.item).sphere));
    const rootId = Object.entries(itemFlags(sphere).abilities ?? {}).find(([, m]) => m.packages)?.[0];
    const root = sphere?.system.activities.get(rootId);
    if ( !root ) return;
    this.#state.pkg = this.item.id;
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
    return !!this.package && packages.includes(this.package.name);
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
    const augments = (this.isRoot && !this.subMeta) ? [] : [
      ...(cast.augments ?? []).filter(a => !a.talent || hasTalent(a.talent)).map(a => ({
        key: `base.${a.key}`, label: a.label, cost: a.cost
      })),
      ...talents.filter(t => {
        const f = itemFlags(t);
        if ( (f.cost === undefined) || groupKeys.includes(f.category) || !this.#fitsPackage(t) ) return false;
        return f.appliesAll || castKeys.some(k => f.applies?.includes(k));
      }).map(t => ({ key: `talent.${t.id}`, label: t.name, cost: cost(t), summary: plainText(t.system.description?.value) }))
    ].map(a => ({ ...a, selected: this.#state.augments.has(a.key) }));

    const selectedTalents = groups.flatMap(g => g.options.filter(o => o.selected));
    const selectedAugments = augments.filter(a => a.selected);
    const total = Math.max(0, (cast.cost ?? 0)
      + selectedTalents.reduce((s, o) => s + o.cost, 0)
      + selectedAugments.reduce((s, a) => s + a.cost, 0));

    const data = computeSpheres(actor);
    const pool = spellPointState(actor);
    const overCap = getSetting("enforceCap") && (total > data.cap);
    const noPool = (total > 0) && !pool.item;
    const overPool = !!pool.item && (total > pool.value);
    const needsChoice = this.isRoot && !this.subMeta;
    return {
      groups, augments, total, cap: data.cap, pool, overCap, noPool, overPool, needsChoice,
      canCast: !overCap && !noPool && !overPool && !needsChoice,
      selectedTalents: selectedTalents.map(o => actor.items.get(o.id)),
      selectedAugments
    };
  }

  /** The package tree of a root: each package with its abilities, the chosen ones marked. */
  #packageTree() {
    return this.packages.map(pkg => {
      const selected = pkg.id === this.#state.pkg;
      const abilities = Object.entries(itemFlags(pkg).abilities ?? {}).filter(([, m]) => !m.hidden).map(([id, m]) => {
        const activity = pkg.system.activities.get(id);
        return {
          id, name: m.name, cost: m.cost ?? 0, info: activityInfo(activity), summary: sectionText(pkg, m.name),
          damage: m.fx ? this.#previewFormula(m) : null,
          selected: selected && (id === this.#state.sub)
        };
      });
      return { id: pkg.id, name: pkg.name, selected, abilities };
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
      description: sub ? sectionText(this.package, sub.name) : this.#abilitySummary(),
      dc: data.dc,
      attack: data.attack
    };
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
      const [pkg, sub] = name === "package"
        ? [value, Object.entries(itemFlags(this.actor.items.get(value)).abilities ?? {}).find(([, m]) => !m.hidden)?.[0] ?? ""]
        : value.split(".");
      this.#state.pkg = pkg;
      this.#state.sub = sub;
      this.#state.groups = {};
      this.#state.augments.clear();
    }
    else if ( name?.startsWith("group.") ) {
      const key = name.slice(6);
      this.#state.groups[key] = value;
    }
    else if ( name?.startsWith("multi.") ) {
      const [, key, id] = name.split(".");
      if ( checked ) this.#state.groups[key].add(id);
      else this.#state.groups[key].delete(id);
    }
    else if ( name?.startsWith("aug.") ) {
      const key = name.slice(4);
      const defs = this.castMeta.augments ?? [];
      if ( checked ) {
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
    const level = actor.system.details?.level ?? 0;
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
    this.#casting = true;
    try {
      await activity.use({ scaling: opts.total }, { configure: false },
        { data: { flags: { [MODULE_ID]: cardFlags(this.actor, this.#castData(opts, effect)) } } });
    } finally {
      CASTING.delete(key);
      this.#casting = false;
    }
  }

  /** Where the cast ability sits: sphere > ability, or sphere > root > package > package ability. */
  #path() {
    const sphere = SPHERE_NAMES[this.sphereKey] ?? this.item.name;
    if ( this.subMeta ) return [sphere, this.meta.name, this.package.name, this.subMeta.name];
    if ( itemFlags(this.item).category === "package" ) return [sphere, this.item.name, this.meta.name];
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
      info: activityInfo(this.#activityToUse(opts)),
      summary: sub ? sectionText(this.package, sub.name) : this.#abilitySummary(),
      talents: details.map(d => d.name),
      augments: augmentDetails.map(a => a.label),
      details,
      augmentDetails,
      total: opts.total,
      formula: effect?.formula ?? null,
      damageType: effect?.damageType ?? null
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
  const pool = getSpellPointsItem(activity.actor);
  if ( !pool ) return;
  for ( const target of activity.consumption?.targets ?? [] ) {
    if ( target.target === SP_TARGET ) target.target = pool.id;
  }
}

export function registerCastHooks() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.preActivityConsumption", onPreActivityConsumption);
}
