import { MODULE_ID, PACKS } from "./constants.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

/** Data version of sphere and talent items. Raise it when their module data changes shape. */
const DATA_VERSION = "0.7.1";

/** Enhancement talents that 0.7.0 folded into parent talents, as on the wiki: old name -> new talent. */
const ENHANCEMENT_MERGES = {
  "Keen Weapon": "Deadly Weapon", "Pursuant Ammunition": "Deadly Weapon", "Versatile Weapon": "Deadly Weapon",
  "Corrosive Poison": "Enhance Poison", "Enhance Virulence": "Enhance Poison",
  "Enhance Capacity": "Enhance Size", "Improved Flexibility": "Enhance Size",
  "Ignore Exhaustion": "False Energy", "Resist Debilitation": "False Energy",
  "Enhance Focus": "Mental Enhancement", "Enhance Mind": "Mental Enhancement",
  "Enhance Physique": "Physical Enhancement", "Superior Reflexes": "Physical Enhancement",
  "Steal Senses": "Steal Ability", "Still Tongue": "Steal Ability"
};

/** How a talent was gained, carried over when it is replaced. */
const KEPT_FLAGS = ["freePick", "freePickSource", "freePickSlot", "bonusTalent", "override", "overrideNote"];

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
  for ( const actor of actors ) count += await mergeEnhancementTalents(actor, sources);
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

/**
 * Replace old split Enhancement talents (e.g. Enhance Physique) with the talent that now holds them (Physical
 * Enhancement), keeping how the first one was gained. Nothing is added if the actor already has the new talent.
 */
async function mergeEnhancementTalents(actor, sources) {
  const old = actor.items.filter(i => isFeatureType(i, "talent") && (itemFlags(i).sphere === "enhancement")
    && !itemFlags(i).custom && (i.name in ENHANCEMENT_MERGES) && !sources.has(sourceKey(i)));
  if ( !old.length ) return 0;
  const create = [];
  for ( const name of new Set(old.map(i => ENHANCEMENT_MERGES[i.name])) ) {
    if ( actor.items.some(i => isFeatureType(i, "talent") && (i.name === name) && (itemFlags(i).sphere === "enhancement")) ) continue;
    const source = sources.get(`talent|enhancement|${name}`);
    if ( !source ) continue;
    const first = old.find(i => ENHANCEMENT_MERGES[i.name] === name);
    const data = source.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "_stats.compendiumSource", source.uuid);
    for ( const key of KEPT_FLAGS ) {
      if ( itemFlags(first)[key] !== undefined ) foundry.utils.setProperty(data, `flags.${MODULE_ID}.${key}`, itemFlags(first)[key]);
    }
    data.sort = first.sort;
    create.push(data);
  }
  await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));
  // Merged talents are not new picks, so their free-pick dialogs are skipped.
  if ( create.length ) await actor.createEmbeddedDocuments("Item", create, { spheresSkipFreePicks: true });
  console.log(`${MODULE_ID} | ${actor.name}: replaced ${old.map(i => i.name).join(", ")} with ${create.map(d => d.name).join(", ") || "existing talents"}`);
  return old.length;
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
