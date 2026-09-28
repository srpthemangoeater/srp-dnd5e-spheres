import { MODULE_ID, PACKS } from "./constants.mjs";
import { getSpellPointsItem, isFeatureType, itemFlags } from "./spell-points.mjs";

/** Load a pack index with the module flags needed to match items by key. */
export async function packEntries(packId) {
  const pack = game.packs.get(packId);
  if ( !pack ) return [];
  const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}`, "system.description.value"] });
  return index.map(e => ({ ...e, flags: e.flags?.[MODULE_ID] ?? {}, uuid: e.uuid ?? `Compendium.${packId}.Item.${e._id}` }))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/** Prepare compendium item data for creation on an actor. */
async function sourceData(uuid, flags={}) {
  const doc = await fromUuid(uuid);
  if ( !doc ) return null;
  const data = doc.toObject();
  delete data._id;
  foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
  foundry.utils.mergeObject(data, { flags: { [MODULE_ID]: { ...flags, managed: true } } });
  return data;
}

/** Make sure the actor has a Spell Points pool item. */
export async function ensureSpellPointsItem(actor) {
  const existing = getSpellPointsItem(actor);
  if ( existing ) return existing;
  const entry = (await packEntries(PACKS.features)).find(e => e.flags.spellPoints);
  const data = entry ? await sourceData(entry.uuid) : null;
  if ( !data ) {
    ui.notifications.error("DND5E-SPHERES.Warning.MissingPool", { localize: true });
    return null;
  }
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/**
 * @typedef TraditionState
 * @property {string} preset          UUID of the preset tradition, or empty for a custom tradition.
 * @property {string} name            Tradition name.
 * @property {string} kam             Key ability.
 * @property {Record<string, number>} drawbacks  Drawback UUID -> times taken.
 * @property {Set<string>} boons      Boon UUIDs.
 * @property {number} classSP         Manual class spell points (non-spherecaster classes).
 * @property {number} spBonus         Manual spell point bonus.
 * @property {boolean} setSpellcasting  Also use the key ability as the actor's spellcasting ability.
 */

/** Read the current tradition setup from an actor. */
export function readTradition(actor) {
  const flags = actor.flags[MODULE_ID] ?? {};
  const tradition = actor.items.find(i => isFeatureType(i, "castingTradition"));
  const source = i => i._stats?.compendiumSource ?? i.flags?.core?.sourceId;
  const drawbacks = {};
  for ( const item of actor.items.filter(i => isFeatureType(i, "drawback")) ) {
    const uuid = source(item);
    if ( uuid ) drawbacks[uuid] = itemFlags(item).count ?? 1;
  }
  const boons = new Set(actor.items.filter(i => isFeatureType(i, "boon")).map(source).filter(_ => _));
  return {
    preset: flags.tradition?.preset ?? "",
    name: tradition?.name ?? flags.tradition?.name ?? "",
    kam: flags.kam ?? "",
    drawbacks,
    boons,
    classSP: Number(flags.classSP) || 0,
    spBonus: Number(flags.spBonus) || 0,
    setSpellcasting: !!flags.setSpellcasting
  };
}

/**
 * Replace the actor's tradition, drawbacks and boons with the given setup.
 * @param {Actor5e} actor
 * @param {TraditionState} state
 */
export async function applyTradition(actor, state) {
  const managed = actor.items.filter(i => itemFlags(i).managed
    && ["castingTradition", "drawback", "boon"].some(t => isFeatureType(i, t)));
  if ( managed.length ) await actor.deleteEmbeddedDocuments("Item", managed.map(i => i.id));

  const toCreate = [];
  let tradition = state.preset ? await sourceData(state.preset) : null;
  tradition ??= {
    name: game.i18n.localize("DND5E-SPHERES.Builder.CustomTradition"),
    type: "feat",
    img: "icons/svg/book.svg",
    system: { type: { value: "castingTradition" } },
    flags: { [MODULE_ID]: { managed: true } }
  };
  if ( state.name ) tradition.name = state.name;
  toCreate.push(tradition);

  for ( const [uuid, count] of Object.entries(state.drawbacks) ) {
    if ( count > 0 ) toCreate.push(await sourceData(uuid, { count }));
  }
  for ( const uuid of state.boons ) toCreate.push(await sourceData(uuid));
  await actor.createEmbeddedDocuments("Item", toCreate.filter(_ => _));

  const update = {
    [`flags.${MODULE_ID}`]: {
      kam: state.kam || null,
      classSP: Number(state.classSP) || 0,
      spBonus: Number(state.spBonus) || 0,
      setSpellcasting: !!state.setSpellcasting,
      tradition: { name: tradition.name, preset: state.preset || null }
    }
  };
  if ( state.setSpellcasting && state.kam ) update["system.attributes.spellcasting"] = state.kam;
  await actor.update(update);
  await ensureSpellPointsItem(actor);
}
