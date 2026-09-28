import { MODULE_ID, SP_SCALE_ID } from "./constants.mjs";

/**
 * Bonus spell points granted by drawbacks that were not traded for boons.
 * @param {number} count  Unspent drawback points.
 * @param {number} level  Character level.
 * @returns {number}
 */
export function drawbackBonus(count, level) {
  if ( count <= 0 ) return 0;
  switch ( count ) {
    case 1: return 1 + Math.floor(level / 6);
    case 2: return 1 + Math.floor(level / 3);
    case 3: return Math.ceil(level / 2);
    case 4: return 1 + Math.floor(level / 1.5);
    default: return level;
  }
}

/** Module flags stored on an item. */
export const itemFlags = item => item?.flags?.[MODULE_ID] ?? {};

/** Is this a feature item of the given spheres type? */
export const isFeatureType = (item, type) => (item.type === "feat") && (item.system.type?.value === type);

/** How many drawback points a drawback item is worth (double drawbacks and drawbacks taken twice). */
export function drawbackWeight(item) {
  const { weight = 1, count = 1 } = itemFlags(item);
  return Number(weight) * Number(count);
}

/** The actor's Spell Points pool item, if any. */
export const getSpellPointsItem = actor => actor?.items.find(i => itemFlags(i).spellPoints) ?? null;

/** Ability modifier, falling back to the raw score if derived data is not ready yet. */
function abilityMod(actor, key) {
  const ability = actor.system.abilities?.[key];
  if ( !ability ) return 0;
  return Number.isFinite(ability.mod) ? ability.mod : Math.floor(((ability.value ?? 10) - 10) / 2);
}

/**
 * Compute everything the module needs to know about an actor's spherecasting.
 * @param {Actor5e} actor
 * @returns {object}
 */
export function computeSpheres(actor) {
  const flags = actor.flags?.[MODULE_ID] ?? {};
  const level = actor.system.details?.level ?? 0;
  const prof = actor.system.attributes?.prof ?? 0;
  const kam = flags.kam || null;
  const kamMod = kam ? abilityMod(actor, kam) : 0;

  // Spell points from spherecaster classes (ScaleValue "spell-points") plus any manual class SP.
  let classSP = 0;
  for ( const cls of Object.values(actor.classes ?? {}) ) {
    // Advancement is not ready during the earliest stages of data preparation.
    if ( !cls.advancement?.byType ) continue;
    const value = Number(cls.scaleValues?.[SP_SCALE_ID]?.value);
    if ( Number.isFinite(value) ) classSP += value;
  }
  classSP += Number(flags.classSP) || 0;

  const drawbacks = actor.items.filter(i => isFeatureType(i, "drawback"));
  const boons = actor.items.filter(i => isFeatureType(i, "boon"));
  const drawbackPoints = drawbacks.reduce((sum, i) => sum + drawbackWeight(i), 0);
  const unspent = Math.max(0, drawbackPoints - (2 * boons.length));
  const traditionBonus = drawbackBonus(unspent, level);
  const manual = Number(flags.spBonus) || 0;

  const isCaster = !!kam || (classSP > 0);
  const max = isCaster ? Math.max(0, classSP + kamMod + traditionBonus + manual) : 0;

  return {
    isCaster, kam, kamMod, level, prof, classSP, traditionBonus, manual,
    drawbackPoints, boonCount: boons.length, unspent, max,
    dc: 8 + prof + kamMod,
    attack: prof + kamMod,
    cap: prof
  };
}

/** Current spell point state read from the pool item. */
export function spellPointState(actor) {
  const item = getSpellPointsItem(actor);
  const max = item?.system.uses?.max ?? 0;
  const spent = item?.system.uses?.spent ?? 0;
  return { item, max, spent, value: Math.max(0, max - spent) };
}

/** Add `@spheres` to actor roll data. */
function addRollData(actor, rollData) {
  try {
    const data = computeSpheres(actor);
    const spheres = {
      kam: data.kamMod,
      kamAbility: data.kam ?? "",
      dc: data.dc,
      attack: data.attack,
      cap: data.cap,
      sp: { max: data.max, bonus: data.traditionBonus, class: data.classSP }
    };
    // Value is read lazily so evaluating the pool's own max formula never recurses into it.
    Object.defineProperty(spheres.sp, "value", {
      enumerable: true,
      get: () => spellPointState(actor).value
    });
    rollData.spheres = spheres;
  } catch(err) {
    console.error(`${MODULE_ID} | Failed to prepare spheres roll data`, err);
  }
  return rollData;
}

/** Wrap Actor#getRollData, through libWrapper when it is active. */
export function patchRollData() {
  const target = "CONFIG.Actor.documentClass.prototype.getRollData";
  if ( game.modules.get("lib-wrapper")?.active && globalThis.libWrapper ) {
    libWrapper.register(MODULE_ID, target, function(wrapped, ...args) {
      return addRollData(this, wrapped(...args));
    }, "WRAPPER");
    return;
  }
  const proto = CONFIG.Actor.documentClass.prototype;
  const original = proto.getRollData;
  proto.getRollData = function(...args) {
    return addRollData(this, original.apply(this, args));
  };
}
