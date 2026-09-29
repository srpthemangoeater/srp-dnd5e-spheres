import { categoryLabel } from "../src/categories.mjs";
import { cardFlags, postCastPreview } from "./chat.mjs";
import { MODULE_ID, SP_TARGET, TEMPLATES } from "./constants.mjs";
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

/**
 * Configure and cast a sphere ability: choose talents and augments, check the spell point cost against the
 * proficiency cap and the pool, then use the dnd5e activity with the cost as its consumption scaling.
 */
export class CastDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(activity, options={}) {
    super(options);
    this.activity = activity;
    this.item = activity.item;
    this.actor = activity.actor;
    this.meta = abilityMeta(activity);
    this.#initState();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "cast-dialog", "dnd5e2"],
    tag: "form",
    window: { icon: "fas fa-wand-magic-sparkles", resizable: true },
    position: { width: 520, height: "auto" },
    form: { handler: CastDialog.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: { cancel: CastDialog.#onCancel, sendToChat: CastDialog.#onSendToChat }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.cast } };

  /** Selected options: `groups[key]` is a talent id (or a Set for multi-select groups), `augments` holds keys. */
  #state = { groups: {}, augments: new Set() };

  /** @override */
  get title() {
    return `${this.meta.name}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  get sphereKey() {
    return itemFlags(this.item).sphere ?? this.item.system.identifier;
  }

  /** Talents usable with this ability: the sphere's own talents plus talents that apply to every sphere. */
  get talents() {
    return this.actor.items.filter(i => isFeatureType(i, "talent")
      && ((itemFlags(i).sphere ?? i.system.type?.subtype) === this.sphereKey || itemFlags(i).appliesAll));
  }

  #initState() {
    for ( const key of Object.keys(this.meta.groups ?? {}) ) {
      if ( this.meta.multi?.includes(key) ) this.#state.groups[key] = new Set();
      else {
        // Preselect the first option of required-looking groups so a blast always has a type.
        const first = this.talents.find(t => itemFlags(t).category === key);
        this.#state.groups[key] = (key === "blastType") && first ? first.id : "";
      }
    }
  }

  /** Build the option lists and the running total. */
  #options() {
    const actor = this.actor;
    const talents = this.talents;
    const groupKeys = Object.keys(this.meta.groups ?? {});
    const cost = t => Number(itemFlags(t).cost) || 0;

    const groups = groupKeys.map(key => {
      const multi = this.meta.multi?.includes(key);
      const selected = this.#state.groups[key];
      const options = talents.filter(t => itemFlags(t).category === key).map(t => ({
        id: t.id, name: t.name, cost: cost(t), summary: plainText(t.system.description?.value),
        selected: multi ? selected.has(t.id) : selected === t.id
      }));
      return { key, label: this.meta.groups[key], multi, options, none: !multi && !options.some(o => o.selected) };
    });

    const hasTalent = name => actor.items.some(i => i.name === name && isFeatureType(i, "talent"));
    const augments = [
      ...(this.meta.augments ?? []).filter(a => !a.talent || hasTalent(a.talent)).map(a => ({
        key: `base.${a.key}`, label: a.label, cost: a.cost
      })),
      ...talents.filter(t => {
        const f = itemFlags(t);
        if ( (f.cost === undefined) || groupKeys.includes(f.category) ) return false;
        return f.appliesAll || f.applies?.includes(this.meta.key);
      }).map(t => ({ key: `talent.${t.id}`, label: t.name, cost: cost(t), summary: plainText(t.system.description?.value) }))
    ].map(a => ({ ...a, selected: this.#state.augments.has(a.key) }));

    const selectedTalents = groups.flatMap(g => g.options.filter(o => o.selected));
    const selectedAugments = augments.filter(a => a.selected);
    const total = Math.max(0, (this.meta.cost ?? 0)
      + selectedTalents.reduce((s, o) => s + o.cost, 0)
      + selectedAugments.reduce((s, a) => s + a.cost, 0));

    const data = computeSpheres(actor);
    const pool = spellPointState(actor);
    const overCap = getSetting("enforceCap") && (total > data.cap);
    const noPool = (total > 0) && !pool.item;
    const overPool = !!pool.item && (total > pool.value);
    return {
      groups, augments, total, cap: data.cap, pool, overCap, noPool, overPool,
      canCast: !overCap && !noPool && !overPool,
      selectedTalents: selectedTalents.map(o => actor.items.get(o.id)),
      selectedAugments
    };
  }

  /** @override */
  async _prepareContext(options) {
    const opts = this.#options();
    const data = computeSpheres(this.actor);
    return {
      ...opts,
      ability: this.meta,
      description: plainText(this.item.system.description?.value?.split(`<h3>${this.meta.name}</h3>`)[1] ?? ""),
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
    if ( name?.startsWith("group.") ) {
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
      if ( checked ) {
        this.#state.augments.add(key);
        // Some augments are upgrades of another (powerful charm instead of greater charm).
        const def = this.meta.augments?.find(a => `base.${a.key}` === key);
        if ( def?.replaces ) this.#state.augments.delete(`base.${def.replaces}`);
        for ( const a of this.meta.augments ?? [] ) {
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

    switch ( this.meta.fx ) {
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
        if ( !this.meta.fx ) return null;
        // Other damaging abilities (e.g. Nature geomancy): level-based default plus talent and augment bonuses.
        let formula = withBonus(defaultEffects(actor, data)[this.meta.fx] ?? "0");
        if ( this.#state.augments.has("base.bonus") ) formula += ` + ${data.kamMod}`;
        return { key: this.meta.fx, formula, damageType };
      }
    }
  }

  /** The activity to use: blast shapes that use spell attacks switch to the attack variant. */
  #activityToUse(opts) {
    const attack = opts.selectedTalents.some(t => itemFlags(t).attack);
    if ( !attack ) return this.activity;
    const abilities = itemFlags(this.item).abilities ?? {};
    const id = Object.entries(abilities).find(([, m]) => m.key === `${this.meta.key}Attack`)?.[0];
    return this.item.system.activities.get(id) ?? this.activity;
  }

  static async #onSubmit() {
    const opts = this.#options();
    if ( !opts.canCast ) {
      ui.notifications.warn("DND5E-SPHERES.Cast.CannotCast", { localize: true });
      throw new Error("Cannot cast");
    }
    const effect = this.#effect(opts);
    const activity = this.#activityToUse(opts);
    if ( effect ) await this.actor.update({ [`flags.${MODULE_ID}.cast.${effect.key}`]: effect.formula });
    if ( effect?.damageType ) await this.item.setFlag("dnd5e", `last.${activity.id}.damageType`, { 0: effect.damageType });

    const key = castKey(activity);
    CASTING.add(key);
    try {
      await activity.use({ scaling: opts.total }, { configure: false },
        { data: { flags: { [MODULE_ID]: cardFlags(this.actor, this.#castData(opts, effect)) } } });
    } finally {
      CASTING.delete(key);
    }
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
    return {
      sphere: this.item.name,
      ability: this.meta.name,
      summary: this.#abilitySummary(),
      talents: details.map(d => d.name),
      augments: augmentDetails.map(a => a.label),
      details,
      augmentDetails,
      total: opts.total,
      formula: effect?.formula ?? null,
      damageType: effect?.damageType ?? null
    };
  }

  /** The ability's own paragraph from the sphere description. */
  #abilitySummary() {
    return plainText(this.item.system.description?.value?.split(`<h3>${this.meta.name}</h3>`)[1] ?? "");
  }

  static #onCancel() {
    this.close();
  }

  /** Post the current choices to chat without casting. */
  static async #onSendToChat() {
    const opts = this.#options();
    await postCastPreview(this.actor, this.#castData(opts, this.#effect(opts)));
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * Send sphere abilities through the cast dialog, and point their spell point consumption at the actor's pool.
 */
function onPreUseActivity(activity) {
  const meta = abilityMeta(activity);
  if ( !meta || !activity.actor ) return;

  if ( !CASTING.has(castKey(activity)) ) {
    const original = activity.actor.items.get(activity.item.id)?.system.activities.get(activity.id) ?? activity;
    new CastDialog(original).render({ force: true });
    return false;
  }

  const pool = getSpellPointsItem(activity.actor);
  const targets = activity.toObject().consumption.targets;
  if ( !targets.some(t => t.target === SP_TARGET) ) return;
  const updated = pool ? targets.map(t => t.target === SP_TARGET ? { ...t, target: pool.id } : t)
    : targets.filter(t => t.target !== SP_TARGET);
  activity.item.updateSource({ [`system.activities.${activity.id}.consumption.targets`]: updated });
}

export function registerCastHooks() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
}
