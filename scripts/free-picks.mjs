import { categoryLabel } from "../src/categories.mjs";
import { FREE_PICKS } from "../src/free-picks.mjs";
import { MODULE_ID, PACKS, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const sphereKeyOf = item => itemFlags(item).sphere ?? item.system.identifier;

/**
 * The item that grants picks: a sphere (key = sphere key) or a talent such as a package (key = talent key). Talents
 * that can be taken more than once (Extra Blast Type) count their picks per copy.
 */
const sourceKeyOf = item => isFeatureType(item, "sphere") ? sphereKeyOf(item)
  : itemFlags(item).repeatable ? `${item.name}#${item.id}` : (itemFlags(item).key ?? item.name);

/**
 * Destruction: each other sphere the actor has grants one free blast type associated with it (blast types list their
 * sphere as `free`). Returns one pick per such sphere, unless the actor already has one of its blast types.
 */
function sphereBlastPicks(destruction) {
  const actor = destruction.actor;
  if ( !actor || !isFeatureType(destruction, "sphere") || (sphereKeyOf(destruction) !== "destruction") ) return [];
  const blastTypes = actor.items.filter(i => isFeatureType(i, "talent") && (itemFlags(i).category === "blastType"));
  return actor.items.filter(i => isFeatureType(i, "sphere") && (sphereKeyOf(i) !== "destruction"))
    .map(sphere => SPHERE_NAMES[sphereKeyOf(sphere)] ?? sphere.name)
    .filter((name, i, all) => all.indexOf(name) === i)
    .map(name => ({
      categories: ["blastType"], count: 1, associated: name, slot: `sphere-${name.toLowerCase()}`,
      // Blast types from numbered picks (the first free blast type, Extra Blast Type) do not use up a sphere's.
      remaining: blastTypes.some(t => (itemFlags(t).free === name)
        && !(itemFlags(t).freePick && (typeof itemFlags(t).freePickSlot === "number"))) ? 0 : 1
    }));
}

/** Free pick slots for a sphere or talent: from its data, or the built-in table for older sphere items. */
export const freePicksOf = item => itemFlags(item).freePicks
  ?? (isFeatureType(item, "sphere") ? FREE_PICKS[sphereKeyOf(item)] : null) ?? [];

/** How many free picks remain in each slot of an item on its actor. */
export function remainingPicks(item) {
  const actor = item.actor;
  const source = sourceKeyOf(item);
  const sphere = sphereKeyOf(item);
  return freePicksOf(item).map((pick, slot) => {
    const taken = actor?.items.filter(i => {
      const f = itemFlags(i);
      if ( !isFeatureType(i, "talent") || !f.freePick || (f.freePickSlot !== slot) ) return false;
      // Picks from before 0.5 have no source and belong to their sphere.
      return (f.freePickSource ?? f.sphere) === source && (f.sphere === sphere);
    }).length ?? 0;
    return { ...pick, slot, remaining: Math.max(0, pick.count - taken) };
  }).concat(sphereBlastPicks(item));
}

export const hasRemainingPicks = item => remainingPicks(item).some(p => p.remaining > 0);

/** Create talents on an actor from compendium UUIDs, marked as free and linked to their source. */
async function addFreeTalents(actor, entries) {
  const data = [];
  for ( const { uuid, flags } of entries ) {
    const doc = await fromUuid(uuid);
    if ( !doc ) continue;
    const item = doc.toObject();
    delete item._id;
    foundry.utils.setProperty(item, "_stats.compendiumSource", uuid);
    foundry.utils.mergeObject(item, { flags: { [MODULE_ID]: { freePick: true, ...flags } } });
    data.push(item);
  }
  // A picked package can have picks of its own (e.g. Universal > Metasphere Package), offered in turn.
  if ( data.length ) await actor.createEmbeddedDocuments("Item", data);
}

/** Add the talents a sphere always includes (e.g. Darkvision for Dark) if the actor does not have them. */
async function addIncludedTalents(sphere) {
  const grants = itemFlags(sphere).grants ?? [];
  if ( !grants.length || !sphere.actor ) return;
  const key = sphereKeyOf(sphere);
  const owned = new Set(sphere.actor.items.filter(i => isFeatureType(i, "talent") && itemFlags(i).sphere === key).map(i => i.name));
  const index = await game.packs.get(PACKS.talents).getIndex({ fields: [`flags.${MODULE_ID}`] });
  const entries = grants.filter(name => !owned.has(name)).map(name => index.find(e => (e.name === name)
    && (e.flags?.[MODULE_ID]?.sphere === key))).filter(_ => _)
    .map(e => ({ uuid: e.uuid, flags: { freePickSource: key, freePickSlot: -1, included: true } }));
  await addFreeTalents(sphere.actor, entries);
}

/**
 * Choose the free talents a sphere (or a package talent) grants when first gained. Chosen talents are flagged
 * as free picks and do not cost magic talents.
 */
export class FreePicksDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(item, options={}) {
    super(options);
    this.source = item;
    this.actor = item.actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "free-picks", "dnd5e2"],
    tag: "form",
    window: { icon: "fas fa-gift" },
    position: { width: 460, height: "auto" },
    form: { handler: FreePicksDialog.#onSubmit, closeOnSubmit: true },
    actions: { later: FreePicksDialog.#onLater }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.freePicks } };

  /** @override */
  get title() {
    return game.i18n.format("DND5E-SPHERES.FreePicks.Title", { sphere: this.source.name });
  }

  /** @override */
  async _prepareContext() {
    const key = sphereKeyOf(this.source);
    const index = await game.packs.get(PACKS.talents).getIndex({ fields: [`flags.${MODULE_ID}`] });
    const owned = new Set(this.actor.items.filter(i => isFeatureType(i, "talent")).map(i => `${itemFlags(i).sphere}.${i.name}`));
    const slots = remainingPicks(this.source).filter(p => p.remaining > 0).map(pick => {
      const options = index.filter(e => {
        const f = e.flags?.[MODULE_ID] ?? {};
        return (f.sphere === key) && pick.categories.includes(f.category) && !f.advanced && !f.builtIn
          && (!pick.associated || (f.free === pick.associated)) && !owned.has(`${key}.${e.name}`);
      }).map(e => ({ uuid: e.uuid, name: e.name, category: categoryLabel(e.flags[MODULE_ID].category) }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      return {
        slot: pick.slot,
        note: pick.associated ? game.i18n.format("DND5E-SPHERES.FreePicks.Associated", { sphere: pick.associated }) : (pick.note ?? ""),
        label: pick.categories.map(categoryLabel).join(" / ") + (pick.associated ? ` (${pick.associated})` : ""),
        selects: Array.fromRange(pick.remaining).map(n => ({ name: `pick.${pick.slot}.${n}`, options }))
      };
    });
    return { sphere: this.source, slots };
  }

  static async #onSubmit(event, form, formData) {
    const source = sourceKeyOf(this.source);
    const entries = Object.entries(formData.object).filter(([k, v]) => k.startsWith("pick.") && v)
      .map(([name, uuid]) => {
        const slot = name.split(".")[1];
        return { uuid, flags: { freePickSource: source, freePickSlot: Number.isNumeric(slot) ? Number(slot) : slot } };
      });
    await addFreeTalents(this.actor, entries);
  }

  static #onLater() {
    this.close();
  }
}

/** When a sphere or package is added by this user: add its included talents and offer its free picks. */
async function onCreateItem(item, options, userId) {
  if ( (userId !== game.user.id) || !item.actor ) return;
  if ( !isFeatureType(item, "sphere") && !isFeatureType(item, "talent") ) return;
  if ( isFeatureType(item, "sphere") ) await addIncludedTalents(item);
  if ( options.spheresSkipFreePicks ) return;
  if ( hasRemainingPicks(item) ) new FreePicksDialog(item).render({ force: true });
  // A new sphere next to Destruction offers its associated blast type.
  if ( isFeatureType(item, "sphere") && (sphereKeyOf(item) !== "destruction") ) {
    const destruction = item.actor.items.find(i => isFeatureType(i, "sphere") && (sphereKeyOf(i) === "destruction"));
    const name = SPHERE_NAMES[sphereKeyOf(item)] ?? item.name;
    if ( destruction && remainingPicks(destruction).some(p => (p.associated === name) && p.remaining) ) {
      new FreePicksDialog(destruction, { id: `${MODULE_ID}-picks-${destruction.id}` }).render({ force: true });
    }
  }
}

export function registerFreePickHooks() {
  Hooks.on("createItem", onCreateItem);
}
