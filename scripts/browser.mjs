import { categoryLabel } from "../src/categories.mjs";
import { MODULE_ID, PACKS, SPHERE_NAMES, TEMPLATES } from "./constants.mjs";
import { computeTalents, isFeatureType, itemFlags } from "./spell-points.mjs";

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
      remove: SpheresBrowser.#onRemove,
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

  /** Add new items as overrides (outside the magic talent limit), with an optional note. */
  addMode = { override: false, note: "" };

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

  /** The actor's items that match a browser entry (same compendium source, or same sphere and name). */
  #matching(entry) {
    return this.actor.items.filter(item => (isFeatureType(item, "sphere") || isFeatureType(item, "talent"))
      && ((item._stats?.compendiumSource === entry.uuid)
        || (((itemFlags(item).sphere ?? "") === entry.sphere) && (item.name === entry.name))));
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

  /** Reasons an item cannot normally be taken: magic talent limit, missing sphere, level requirement. */
  #problems(doc) {
    const problems = [];
    const f = itemFlags(doc);
    const talents = computeTalents(this.actor);
    const free = f.builtIn || (f.free && this.actor.items.some(i => isFeatureType(i, "sphere")
      && itemFlags(i).sphere === f.free.toLowerCase()));
    if ( !free && (talents.spent + 1 > talents.total) ) {
      problems.push(game.i18n.format("DND5E-SPHERES.Override.OverLimit", { spent: talents.spent + 1, total: talents.total }));
    }
    if ( isFeatureType(doc, "talent") && !this.actor.items.some(i => isFeatureType(i, "sphere") && itemFlags(i).sphere === f.sphere) ) {
      problems.push(game.i18n.format("DND5E-SPHERES.Override.NoSphere", { sphere: SPHERE_NAMES[f.sphere] ?? f.sphere }));
    }
    // Advanced talents state their level requirement in their text, e.g. "(11th level)".
    const level = Number(doc.system.description?.value?.match(/\((\d+)(?:st|nd|rd|th) level/)?.[1]);
    if ( level && ((this.actor.system.details?.level ?? 0) < level) ) {
      problems.push(game.i18n.format("DND5E-SPHERES.Override.Level", { level }));
    }
    return problems;
  }

  /** Ask whether to take an item despite problems: as an override (with a note), anyway, or not at all. */
  async #confirmProblems(doc, problems) {
    const escape = foundry.utils.escapeHTML;
    return foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("DND5E-SPHERES.Override.ConfirmTitle", { name: doc.name }) },
      content: `<ul>${problems.map(p => `<li>${escape(p)}</li>`).join("")}</ul>
        <p>${game.i18n.localize("DND5E-SPHERES.Override.ConfirmHint")}</p>
        <input type="text" name="note" placeholder="${game.i18n.localize("DND5E-SPHERES.Override.NotePlaceholder")}">`,
      buttons: [
        { action: "override", label: "DND5E-SPHERES.Override.AddOverride", icon: "fa-solid fa-unlock", default: true,
          callback: (event, button) => ({ override: true, note: button.form.elements.note.value.trim() }) },
        { action: "anyway", label: "DND5E-SPHERES.Override.AddAnyway", callback: () => ({ override: false }) },
        { action: "cancel", label: "Cancel", callback: () => null }
      ],
      rejectClose: false
    });
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
      context.addMode = this.addMode;
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
      if ( event.target.name === "overrideNote" ) this.addMode.note = event.target.value.trim();
      if ( event.target.name !== "text" ) return;
      this.filters.text = event.target.value;
      refreshResults();
    });
    this.element.addEventListener("change", event => {
      const { name, value, checked, type } = event.target;
      if ( name === "addOverride" ) {
        this.addMode.override = checked;
        this.element.querySelector("[name=overrideNote]")?.toggleAttribute("disabled", !checked);
        return;
      }
      if ( !name || (name === "text") || (name === "overrideNote") || !(name in this.filters) ) return;
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
    let override = this.addMode.override ? { override: true, note: this.addMode.note } : null;
    if ( !override ) {
      const problems = this.#problems(doc);
      if ( problems.length ) {
        const choice = await this.#confirmProblems(doc, problems);
        if ( !choice ) return;
        if ( choice.override ) override = choice;
      }
    }
    const data = doc.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
    if ( override ) {
      foundry.utils.mergeObject(data, { flags: { [MODULE_ID]: { override: true, overrideNote: override.note ?? "" } } });
    }
    await this.actor.createEmbeddedDocuments("Item", [data]);
    const sphere = itemFlags(doc).sphere;
    const hasSphere = this.actor.items.some(i => isFeatureType(i, "sphere") && itemFlags(i).sphere === sphere);
    if ( isFeatureType(doc, "talent") && !hasSphere ) {
      ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Browser.MissingSphere", { name: doc.name, sphere: SPHERE_NAMES[sphere] }));
    }
    else ui.notifications.info(game.i18n.format("DND5E-SPHERES.Browser.Added", { name: doc.name, actor: this.actor.name }));
    this.render({ parts: ["results"] });
  }

  /** Deselect: remove the actor's copy of this entry. */
  static async #onRemove(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const entry = (await SpheresBrowser.loadEntries()).find(e => e.uuid === uuid);
    const items = entry ? this.#matching(entry) : [];
    if ( !items.length ) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.format("DND5E-SPHERES.DeleteTitle", { name: entry.name }) },
      content: `<p>${game.i18n.format("DND5E-SPHERES.DeleteConfirm", { name: foundry.utils.escapeHTML(entry.name) })}</p>`
    });
    if ( !confirmed ) return;
    await this.actor.deleteEmbeddedDocuments("Item", items.map(i => i.id));
    ui.notifications.info(game.i18n.format("DND5E-SPHERES.Browser.Removed", { name: entry.name, actor: this.actor.name }));
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
