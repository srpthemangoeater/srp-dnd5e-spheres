import { categoryLabel } from "../src/categories.mjs";
import { SPHERES_A } from "../src/spheres-a.mjs";
import { SPHERES_B } from "../src/spheres-b.mjs";
import { MODULE_ID, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SPHERES = [...SPHERES_A, ...SPHERES_B];

const escape = text => String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Plain text of a description, one paragraph per line, for editing. */
const plainLines = html => {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  const paragraphs = [...div.querySelectorAll("p")].map(p => p.textContent.trim()).filter(_ => _);
  return paragraphs.length ? paragraphs.join("\n") : div.textContent.trim();
};

/** Talent categories and castable abilities of a sphere, from the module's data. */
function sphereInfo(key) {
  const sphere = SPHERES.find(s => s.key === key);
  const categories = [...new Set((sphere?.talents ?? []).map(t => t[1]))];
  if ( !categories.includes("other") ) categories.push("other");
  return {
    categories: categories.map(c => ({ key: c, label: categoryLabel(c) })),
    abilities: (sphere?.abilities ?? []).filter(a => !a.hidden && !a.packages).map(a => ({ key: a.key, name: a.name }))
  };
}

/**
 * Create or edit a custom magic talent: one missing from the compendiums. It is a normal talent item: it counts
 * against magic talents (unless marked free), appears under its sphere, joins the cast dialog's group for its
 * category (for example as a blast type), or offers itself as an augment for the abilities it applies to.
 */
export class CustomTalentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {Actor5e} actor
   * @param {Item5e} [item]  A custom talent to edit.
   */
  constructor(actor, item=null, options={}) {
    super(options);
    this.actor = actor;
    this.item = item;
    const f = itemFlags(item);
    const firstSphere = actor.items.find(i => isFeatureType(i, "sphere"));
    this.#state = {
      name: item?.name ?? "",
      sphere: f.sphere ?? itemFlags(firstSphere).sphere ?? "alteration",
      category: f.category ?? "other",
      advanced: !!f.advanced,
      cost: f.cost ?? "",
      applies: !f.applies?.length ? "" : (f.applies.length > 1 ? "*" : f.applies[0]),
      dt: f.dt ?? "",
      bonus: f.bonus ?? "",
      free: !!f.bonusTalent,
      description: plainLines(item?.system.description?.value)
    };
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "custom-talent", "dnd5e2"],
    tag: "form",
    window: { icon: "fas fa-wand-sparkles", resizable: true },
    position: { width: 480, height: "auto" },
    form: { handler: CustomTalentDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { cancel: CustomTalentDialog.#onCancel }
  };

  /** @override */
  static PARTS = { form: { template: TEMPLATES.customTalent } };

  #state;

  /** @override */
  get title() {
    return game.i18n.localize(this.item ? "DND5E-SPHERES.Custom.EditTitle" : "DND5E-SPHERES.Custom.Title");
  }

  /** @override */
  async _prepareContext() {
    const state = this.#state;
    const info = sphereInfo(state.sphere);
    if ( !info.categories.some(c => c.key === state.category) ) state.category = "other";
    const appliesOptions = [
      { key: "", label: game.i18n.localize("DND5E-SPHERES.Custom.AppliesNone") },
      { key: "*", label: game.i18n.localize("DND5E-SPHERES.Custom.AppliesAll") },
      ...info.abilities.map(a => ({ key: a.key, label: a.name }))
    ].map(o => ({ ...o, selected: o.key === state.applies }));
    return {
      state,
      spheres: Object.entries(SPHERE_NAMES).map(([key, label]) => ({ key, label, selected: key === state.sphere })),
      categories: info.categories.map(c => ({ ...c, selected: c.key === state.category })),
      appliesOptions,
      damageTypes: [{ key: "", label: "—" }, ...Object.entries(CONFIG.DND5E.damageTypes).map(([key, d]) => ({ key, label: d.label }))]
        .map(d => ({ ...d, selected: d.key === state.dt })),
      editing: !!this.item
    };
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Keep typed values across re-renders; the sphere choice changes the category and ability lists.
    this.element.addEventListener("change", event => {
      const { name, value, checked, type } = event.target;
      if ( !name || !(name in this.#state) ) return;
      this.#state[name] = type === "checkbox" ? checked : value;
      if ( name === "sphere" ) this.render();
    });
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const name = String(data.name ?? "").trim();
    if ( !name ) {
      ui.notifications.warn("DND5E-SPHERES.Custom.NeedName", { localize: true });
      throw new Error("A custom talent needs a name");
    }
    const sphere = data.sphere;
    const cost = String(data.cost ?? "").trim();
    // "*" makes it an augment for every ability of its sphere.
    const applies = data.applies === "*" ? sphereInfo(sphere).abilities.map(a => a.key) : (data.applies ? [data.applies] : null);
    const flags = {
      custom: true, sphere, category: data.category, advanced: !!data.advanced,
      ...(cost !== "" ? { cost: Number(cost) || 0 } : {}),
      ...(applies?.length ? { applies } : {}),
      ...(data.dt ? { dt: data.dt } : {}),
      ...(String(data.bonus ?? "").trim() ? { bonus: String(data.bonus).trim() } : {}),
      ...(data.free ? { bonusTalent: true } : {})
    };
    const description = String(data.description ?? "").split(/\n+/).map(l => l.trim()).filter(_ => _)
      .map(l => `<p>${escape(l)}</p>`).join("") + `<p><em>${escape(game.i18n.localize("DND5E-SPHERES.Custom.Note"))}</em></p>`;
    const sphereItem = this.actor.items.find(i => isFeatureType(i, "sphere") && (itemFlags(i).sphere === sphere));
    const system = {
      type: { value: "talent", subtype: sphere },
      description: { value: description },
      requirements: `${SPHERE_NAMES[sphere] ?? sphere}${flags.advanced ? " (advanced)" : ""}`
    };
    if ( this.item ) {
      // Replace the module flags so options that were cleared (cost, damage type...) do not linger.
      const keep = foundry.utils.deepClone(itemFlags(this.item));
      for ( const k of ["cost", "applies", "appliesAll", "dt", "bonus", "bonusTalent"] ) delete keep[k];
      await this.item.update({ name, system, [`flags.==${MODULE_ID}`]: { ...keep, ...flags } });
    }
    else {
      await this.actor.createEmbeddedDocuments("Item", [{
        name, type: "feat", img: sphereItem?.img ?? "icons/svg/upgrade.svg", system, flags: { [MODULE_ID]: flags }
      }]);
    }
  }

  static #onCancel() {
    this.close();
  }
}
