import { categoryLabel } from "../src/categories.mjs";
import { FREE_PICKS } from "../src/free-picks.mjs";
import { MODULE_ID, PACKS, TEMPLATES } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const sphereKeyOf = item => itemFlags(item).sphere ?? item.system.identifier;

/** Free pick slots for a sphere item: from its data, or the built-in table for older items. */
export const freePicksOf = sphere => itemFlags(sphere).freePicks ?? FREE_PICKS[sphereKeyOf(sphere)] ?? [];

/** How many free picks remain in each slot of a sphere on its actor. */
export function remainingPicks(sphere) {
  const actor = sphere.actor;
  const key = sphereKeyOf(sphere);
  return freePicksOf(sphere).map((pick, slot) => {
    const taken = actor?.items.filter(i => isFeatureType(i, "talent") && itemFlags(i).freePick
      && (itemFlags(i).sphere === key) && (itemFlags(i).freePickSlot === slot)).length ?? 0;
    return { ...pick, slot, remaining: Math.max(0, pick.count - taken) };
  });
}

export const hasRemainingPicks = sphere => remainingPicks(sphere).some(p => p.remaining > 0);

/**
 * Choose the free talents a sphere grants when first gained. Chosen talents are flagged as free picks
 * and do not cost magic talents.
 */
export class FreePicksDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(sphere, options={}) {
    super(options);
    this.sphere = sphere;
    this.actor = sphere.actor;
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
    return game.i18n.format("DND5E-SPHERES.FreePicks.Title", { sphere: this.sphere.name });
  }

  /** @override */
  async _prepareContext() {
    const key = sphereKeyOf(this.sphere);
    const index = await game.packs.get(PACKS.talents).getIndex({ fields: [`flags.${MODULE_ID}`] });
    const owned = new Set(this.actor.items.filter(i => isFeatureType(i, "talent")).map(i => `${itemFlags(i).sphere}.${i.name}`));
    const slots = remainingPicks(this.sphere).filter(p => p.remaining > 0).map(pick => {
      const options = index.filter(e => {
        const f = e.flags?.[MODULE_ID] ?? {};
        return (f.sphere === key) && pick.categories.includes(f.category) && !f.advanced && !owned.has(`${key}.${e.name}`);
      }).map(e => ({ uuid: e.uuid, name: e.name, category: categoryLabel(e.flags[MODULE_ID].category) }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      return {
        slot: pick.slot, note: pick.note ?? "",
        label: pick.categories.map(categoryLabel).join(" / "),
        selects: Array.fromRange(pick.remaining).map(n => ({ name: `pick.${pick.slot}.${n}`, options }))
      };
    });
    return { sphere: this.sphere, slots };
  }

  static async #onSubmit(event, form, formData) {
    const chosen = Object.entries(formData.object).filter(([k, v]) => k.startsWith("pick.") && v);
    const data = [];
    for ( const [name, uuid] of chosen ) {
      const slot = Number(name.split(".")[1]);
      const doc = await fromUuid(uuid);
      if ( !doc ) continue;
      const item = doc.toObject();
      delete item._id;
      foundry.utils.setProperty(item, "_stats.compendiumSource", uuid);
      foundry.utils.mergeObject(item, { flags: { [MODULE_ID]: { freePick: true, freePickSlot: slot } } });
      data.push(item);
    }
    if ( data.length ) await this.actor.createEmbeddedDocuments("Item", data);
  }

  static #onLater() {
    this.close();
  }
}

/** Offer the free picks when a sphere is added to a character by this user. */
function onCreateItem(item, options, userId) {
  if ( (userId !== game.user.id) || !item.actor || !isFeatureType(item, "sphere") ) return;
  if ( options.spheresSkipFreePicks || !hasRemainingPicks(item) ) return;
  new FreePicksDialog(item).render({ force: true });
}

export function registerFreePickHooks() {
  Hooks.on("createItem", onCreateItem);
}
