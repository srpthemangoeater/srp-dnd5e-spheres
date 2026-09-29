import { KEY_ABILITIES, MODULE_ID, PACKS, TEMPLATES } from "./constants.mjs";
import { casterLevel, computeSpheres, drawbackBonus } from "./spell-points.mjs";
import { applyTradition, packEntries, readTradition } from "./tradition.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Plain text summary of an item description, for tooltips. */
const summarize = html => {
  const text = foundry.utils.cleanHTML?.(html ?? "") ?? html ?? "";
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.querySelector("p")?.textContent ?? div.textContent ?? "";
};

/**
 * Pick a casting tradition preset or build a custom one: key ability, drawbacks and boons,
 * with a live preview of the resulting spell point pool.
 */
export class TraditionBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options={}) {
    super(options);
    this.actor = actor;
    this.#state = readTradition(actor);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["dnd5e-spheres", "tradition-builder", "dnd5e2"],
    tag: "form",
    window: { icon: "fas fa-atom", resizable: true },
    position: { width: 820, height: 760 },
    form: {
      handler: TraditionBuilder.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      cancel: TraditionBuilder.#onCancel
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.builder, scrollable: [".drawback-list", ".boon-list"] }
  };

  /** @type {import("./tradition.mjs").TraditionState} */
  #state;

  /** Cached compendium entries. */
  #entries;

  /** @override */
  get title() {
    return `${game.i18n.localize("DND5E-SPHERES.Builder.Title")}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */

  async #loadEntries() {
    this.#entries ??= {
      traditions: await packEntries(PACKS.traditions),
      drawbacks: await packEntries(PACKS.drawbacks),
      boons: await packEntries(PACKS.boons)
    };
    return this.#entries;
  }

  /** Apply a preset tradition's key ability, drawbacks and boons to the working state. */
  #applyPreset(uuid) {
    const state = this.#state;
    state.preset = uuid;
    const preset = this.#entries.traditions.find(t => t.uuid === uuid);
    if ( !preset ) return;
    state.name = preset.name;
    const byKey = list => Object.fromEntries(list.map(e => [e.flags.key, e.uuid]));
    const drawbacks = byKey(this.#entries.drawbacks);
    const boons = byKey(this.#entries.boons);
    state.drawbacks = {};
    for ( const { key, count = 1 } of preset.flags.drawbacks ?? [] ) {
      if ( drawbacks[key] ) state.drawbacks[drawbacks[key]] = count;
    }
    state.boons = new Set((preset.flags.boons ?? []).map(k => boons[k]).filter(_ => _));
    // Traditions offering several key abilities use the highest one.
    const options = preset.flags.kam ?? [];
    const abilities = this.actor.system.abilities;
    state.kam = options.reduce((best, k) => (!best || (abilities[k]?.value > abilities[best]?.value) ? k : best), "");
  }

  /** @override */
  async _prepareContext(options) {
    const entries = await this.#loadEntries();
    const state = this.#state;
    const level = this.actor.type === "npc" && state.casterLevel ? state.casterLevel : casterLevel(this.actor);
    const current = computeSpheres(this.actor);

    const drawbacks = entries.drawbacks.map(e => {
      const count = state.drawbacks[e.uuid] ?? 0;
      return {
        uuid: e.uuid, name: e.name, count, checked: count > 0,
        weight: e.flags.weight ?? 1, repeatable: !!e.flags.repeatable, automated: !!e.flags.automated,
        summary: summarize(e.system?.description?.value)
      };
    });
    const points = drawbacks.reduce((sum, d) => sum + (d.count * d.weight), 0);
    const boonSlots = Math.floor(points / 2);
    const boons = entries.boons.map(e => {
      const checked = state.boons.has(e.uuid);
      return {
        uuid: e.uuid, name: e.name, checked,
        disabled: !checked && (state.boons.size >= boonSlots),
        summary: summarize(e.system?.description?.value)
      };
    });
    const unspent = Math.max(0, points - (2 * state.boons.size));
    const bonus = drawbackBonus(unspent, level);
    const ability = state.kam ? this.actor.system.abilities[state.kam] : null;
    const kamMod = ability?.mod ?? 0;
    const classFromScale = current.classSP - (Number(this.actor.flags[MODULE_ID]?.classSP) || 0);
    const classSP = classFromScale + (Number(state.classSP) || 0);
    const max = Math.max(0, classSP + kamMod + bonus + (Number(state.spBonus) || 0));

    const presets = entries.traditions.map(t => ({
      uuid: t.uuid,
      label: t.flags.parent ? `${t.flags.parent} › ${t.name}` : t.name,
      selected: t.uuid === state.preset
    })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    return {
      state,
      isNPC: this.actor.type === "npc",
      presets,
      abilities: KEY_ABILITIES.map(k => ({
        key: k, label: CONFIG.DND5E.abilities[k].label, selected: k === state.kam,
        mod: this.actor.system.abilities[k]?.mod ?? 0
      })),
      drawbacks,
      boons,
      summary: {
        level, points, boonSlots, boonCount: state.boons.size, overBoons: state.boons.size > boonSlots,
        unspent, bonus, classSP, classFromScale, kamMod, spBonus: Number(state.spBonus) || 0, max,
        dc: 8 + (this.actor.system.attributes?.prof ?? 0) + kamMod
      }
    };
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("change", this.#onChange.bind(this));
  }

  /** Update the working state from the form and re-render the preview. */
  #onChange(event) {
    const target = event.target;
    const state = this.#state;
    const name = target.name ?? "";
    if ( name === "preset" ) {
      if ( target.value ) this.#applyPreset(target.value);
      else state.preset = "";
    }
    else if ( name.startsWith("drawback.") ) {
      const uuid = name.slice("drawback.".length);
      const repeat = this.element.querySelector(`[name="drawbackTwice.${CSS.escape(uuid)}"]`);
      state.drawbacks[uuid] = target.checked ? (repeat?.checked ? 2 : 1) : 0;
    }
    else if ( name.startsWith("drawbackTwice.") ) {
      const uuid = name.slice("drawbackTwice.".length);
      if ( state.drawbacks[uuid] ) state.drawbacks[uuid] = target.checked ? 2 : 1;
    }
    else if ( name.startsWith("boon.") ) {
      const uuid = name.slice("boon.".length);
      if ( target.checked ) state.boons.add(uuid);
      else state.boons.delete(uuid);
    }
    else if ( ["classSP", "spBonus", "talentBonus", "casterLevel"].includes(name) ) state[name] = Number(target.value) || 0;
    else if ( name === "setSpellcasting" ) state.setSpellcasting = target.checked;
    else if ( name in state ) state[name] = target.value;
    else return;
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const state = this.#state;
    const points = Object.entries(state.drawbacks).reduce((sum, [uuid, count]) => {
      const weight = this.#entries.drawbacks.find(e => e.uuid === uuid)?.flags.weight ?? 1;
      return sum + (count * weight);
    }, 0);
    if ( state.boons.size > Math.floor(points / 2) ) {
      ui.notifications.warn("DND5E-SPHERES.Warning.TooManyBoons", { localize: true });
      throw new Error("Too many boons");
    }
    state.name = formData.object.name ?? state.name;
    await applyTradition(this.actor, state);
  }

  static #onCancel() {
    this.close();
  }
}
