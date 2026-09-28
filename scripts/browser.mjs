import { categoryLabel } from "../src/categories.mjs";
import { MODULE_ID, PACKS, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MAX_RESULTS = 250;

const plainText = html => {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  return div.querySelector("p")?.textContent ?? "";
};

/**
 * A searchable browser for spheres and talents, in the spirit of a compendium browser:
 * text search plus filters for sphere, category, basic/advanced and augment cost, with one-click adding.
 */
export class SpheresBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options={}) {
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "spheres-browser", "dnd5e2"],
    window: { icon: "fas fa-book-atlas", resizable: true },
    position: { width: 860, height: 720 },
    actions: {
      add: SpheresBrowser.#onAdd,
      view: SpheresBrowser.#onView,
      reset: SpheresBrowser.#onReset
    }
  };

  /** @override */
  static PARTS = {
    filters: { template: TEMPLATES.browserFilters },
    results: { template: TEMPLATES.browserResults, scrollable: [".browser-results"] }
  };

  /** Cached index entries shared by all browsers. */
  static #entries;

  /** Current filter values. */
  filters = { text: "", type: "talent", sphere: "", category: "", level: "", cost: "", hideOwned: false };

  /** @override */
  get title() {
    return `${game.i18n.localize("DND5E-SPHERES.Browser.Title")}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  static async loadEntries() {
    this.#entries ??= (async () => {
      const fields = [`flags.${MODULE_ID}`, "system.type", "system.description.value", "img"];
      const load = async (packId, type) => {
        const pack = game.packs.get(packId);
        if ( !pack ) return [];
        const index = await pack.getIndex({ fields });
        return index.filter(e => e.type === "feat").map(e => {
          const f = e.flags?.[MODULE_ID] ?? {};
          const sphere = f.sphere ?? "";
          return {
            uuid: e.uuid, name: e.name, img: e.img, type, sphere,
            sphereLabel: SPHERE_NAMES[sphere] ?? "",
            category: f.category ?? "", categoryLabel: f.category ? categoryLabel(f.category) : "",
            advanced: !!f.advanced, cost: Number.isFinite(f.cost) ? f.cost : null, free: f.free ?? null,
            summary: plainText(e.system?.description?.value),
            search: `${e.name} ${f.category ?? ""} ${SPHERE_NAMES[sphere] ?? ""}`.toLowerCase()
          };
        });
      };
      const entries = [...await load(PACKS.spheres, "sphere"), ...await load(PACKS.talents, "talent")];
      return entries.sort((a, b) => a.sphereLabel.localeCompare(b.sphereLabel) || (a.type === "sphere" ? -1 : 0)
        - (b.type === "sphere" ? -1 : 0) || a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
    })();
    return this.#entries;
  }

  /** Compendium UUIDs and sphere/name pairs the actor already has. */
  #owned() {
    const uuids = new Set();
    const names = new Set();
    for ( const item of this.actor.items ) {
      if ( !isFeatureType(item, "sphere") && !isFeatureType(item, "talent") ) continue;
      if ( item._stats?.compendiumSource ) uuids.add(item._stats.compendiumSource);
      names.add(`${itemFlags(item).sphere ?? ""}.${item.name}`);
    }
    return entry => uuids.has(entry.uuid) || names.has(`${entry.sphere}.${entry.name}`);
  }

  /** @override */
  async _prepareContext(options) {
    const entries = await SpheresBrowser.loadEntries();
    return { entries, filters: this.filters };
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const f = this.filters;
    if ( partId === "filters" ) {
      const categories = new Map();
      for ( const e of context.entries ) {
        if ( e.type !== "talent" || (f.sphere && e.sphere !== f.sphere) ) continue;
        categories.set(e.category, e.categoryLabel);
      }
      const option = (value, label, selected) => ({ value, label, selected: value === selected });
      context.spheres = Object.entries(SPHERE_NAMES).map(([k, v]) => option(k, v, f.sphere));
      context.categories = [...categories].sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => option(k, v, f.category));
      context.types = [["", "DND5E-SPHERES.Browser.All"], ["sphere", "DND5E-SPHERES.FeatureType.sphere"],
        ["talent", "DND5E-SPHERES.FeatureType.talent"]].map(([k, v]) => option(k, game.i18n.localize(v), f.type));
      context.levels = [["", "DND5E-SPHERES.Browser.All"], ["basic", "DND5E-SPHERES.Browser.Basic"],
        ["advanced", "DND5E-SPHERES.Advanced"]].map(([k, v]) => option(k, game.i18n.localize(v), f.level));
      context.costs = [["", "DND5E-SPHERES.Browser.AnyCost"], ["none", "DND5E-SPHERES.Browser.NoCost"],
        ["sp", "DND5E-SPHERES.Browser.HasCost"]].map(([k, v]) => option(k, game.i18n.localize(v), f.cost));
    }
    if ( partId === "results" ) {
      const owned = this.#owned();
      const words = f.text.toLowerCase().split(/\s+/).filter(_ => _);
      const matches = context.entries.filter(e => {
        if ( f.type && e.type !== f.type ) return false;
        if ( f.sphere && e.sphere !== f.sphere ) return false;
        if ( f.category && e.category !== f.category ) return false;
        if ( f.level === "basic" && e.advanced ) return false;
        if ( f.level === "advanced" && !e.advanced ) return false;
        if ( f.cost === "none" && e.cost ) return false;
        if ( f.cost === "sp" && !e.cost ) return false;
        if ( words.length && !words.every(w => e.search.includes(w)) ) return false;
        return true;
      }).map(e => ({ ...e, owned: owned(e) })).filter(e => !f.hideOwned || !e.owned);
      context.total = matches.length;
      context.results = matches.slice(0, MAX_RESULTS);
      context.truncated = matches.length > MAX_RESULTS;
      context.canAdd = this.actor.isOwner;
    }
    return context;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const refreshResults = foundry.utils.debounce(() => this.render({ parts: ["results"] }), 200);
    this.element.addEventListener("input", event => {
      if ( event.target.name !== "text" ) return;
      this.filters.text = event.target.value;
      refreshResults();
    });
    this.element.addEventListener("change", event => {
      const { name, value, checked, type } = event.target;
      if ( !name || (name === "text") || !(name in this.filters) ) return;
      this.filters[name] = type === "checkbox" ? checked : value;
      // Changing the sphere changes which categories exist.
      if ( name === "sphere" ) this.filters.category = "";
      this.render({ parts: name === "sphere" ? ["filters", "results"] : ["results"] });
    });
    this.element.addEventListener("dragstart", event => {
      const row = event.target.closest("[data-uuid]");
      if ( row ) event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: row.dataset.uuid }));
    });
  }

  /* -------------------------------------------- */

  static async #onAdd(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const doc = uuid ? await fromUuid(uuid) : null;
    if ( !doc ) return;
    const data = doc.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
    await this.actor.createEmbeddedDocuments("Item", [data]);
    const sphere = itemFlags(doc).sphere;
    const hasSphere = this.actor.items.some(i => isFeatureType(i, "sphere") && itemFlags(i).sphere === sphere);
    if ( isFeatureType(doc, "talent") && !hasSphere ) {
      ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Browser.MissingSphere", { name: doc.name, sphere: SPHERE_NAMES[sphere] }));
    }
    else ui.notifications.info(game.i18n.format("DND5E-SPHERES.Browser.Added", { name: doc.name, actor: this.actor.name }));
    this.render({ parts: ["results"] });
  }

  static async #onView(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    (await fromUuid(uuid))?.sheet.render({ force: true });
  }

  static #onReset() {
    this.filters = { text: "", type: "talent", sphere: "", category: "", level: "", cost: "", hideOwned: false };
    this.render();
  }
}
