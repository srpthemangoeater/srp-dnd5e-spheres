import { MODULE_ID, PACKS } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

/** Data version of sphere and talent items. Raise it when their module data changes shape. */
const DATA_VERSION = "0.7.0";

/** Module flags that always follow the compendium entry. */
const SYNCED_FLAGS = ["abilities", "packages", "template", "shapeOptions", "cost", "options", "freePicks", "repeatable"];

export function registerMigrationSetting() {
  game.settings.register(MODULE_ID, "dataVersion", { scope: "world", config: false, type: String, default: "" });
}

/**
 * Bring sphere and talent items already on actors up to date with the compendiums: ability metadata (such as the
 * Geomancy and Spirit package roots), the packages a talent works with, blast shape areas, new activities and the
 * rules text.
 * Runs once per data version for the active GM.
 */
export async function migrateWorld() {
  if ( !game.user.isActiveGM ) return;
  const current = game.settings.get(MODULE_ID, "dataVersion");
  if ( current && !foundry.utils.isNewerVersion(DATA_VERSION, current) ) return;

  const sources = new Map();
  for ( const pack of [PACKS.spheres, PACKS.talents] ) {
    for ( const doc of await game.packs.get(pack)?.getDocuments() ?? [] ) sources.set(sourceKey(doc), doc);
  }

  let count = 0;
  const actors = [...game.actors, ...game.scenes.contents.flatMap(s => s.tokens.contents)
    .filter(t => !t.actorLink && t.actor).map(t => t.actor)];
  for ( const actor of actors ) {
    const updates = actor.items.map(item => itemUpdate(item, sources)).filter(_ => _);
    if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
    count += updates.length;
  }
  const worldUpdates = game.items.map(item => itemUpdate(item, sources)).filter(_ => _);
  if ( worldUpdates.length ) await Item.implementation.updateDocuments(worldUpdates);
  count += worldUpdates.length;

  await game.settings.set(MODULE_ID, "dataVersion", DATA_VERSION);
  if ( count ) console.log(`${MODULE_ID} | Updated ${count} sphere and talent items to data version ${DATA_VERSION}`);
}

const sourceKey = item => `${item.system.type?.value}|${itemFlags(item).sphere}|${item.name}`;

/** The update that brings one item in line with its compendium entry, or null if nothing changed. */
function itemUpdate(item, sources) {
  if ( !isFeatureType(item, "sphere") && !isFeatureType(item, "talent") ) return null;
  if ( itemFlags(item).custom ) return null;
  const source = sources.get(sourceKey(item));
  if ( !source ) return null;
  const from = itemFlags(source);
  const to = itemFlags(item);
  const update = {};

  for ( const key of SYNCED_FLAGS ) {
    if ( from[key] === undefined ) {
      if ( to[key] !== undefined ) update[`flags.${MODULE_ID}.-=${key}`] = null;
    }
    // Replace rather than merge, so abilities or options that were removed do not linger.
    else if ( !foundry.utils.objectsEqual({ v: from[key] }, { v: to[key] }) ) update[`flags.${MODULE_ID}.==${key}`] = from[key];
  }
  for ( const activity of source.system.activities ) {
    if ( !item.system.activities.has(activity.id) ) update[`system.activities.${activity.id}`] = activity.toObject();
  }
  if ( foundry.utils.isEmpty(update) ) return null;
  update["system.description.value"] = source.system.description.value;
  return { _id: item.id, ...update };
}
