import { getSetting } from "./settings.mjs";
import { casterLevel, isFeatureType, itemFlags } from "./spell-points.mjs";

/** Drawbacks with numeric effects that Resolve applies. Everything else is acknowledged. */
const AUTOMATED = {
  "draining-casting": drainingCasting,
  "painful-magic": painfulMagic,
  "material-casting": materialCasting,
  "wild-magic": wildMagic
};

/** Drawbacks whose effect depends on spell points being spent. */
const NEEDS_SPELL_POINTS = new Set(["draining-casting", "painful-magic", "material-casting"]);

const drawbacksOf = actor => actor.items.filter(i => isFeatureType(i, "drawback"));
const hasDrawback = (actor, key) => drawbacksOf(actor).some(i => itemFlags(i).key === key);

const plainText = html => {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  return div.querySelector("p")?.textContent ?? div.textContent ?? "";
};

/**
 * The drawback rows shown on a sphere chat card.
 * @param {Actor5e} actor
 * @returns {object[]}
 */
export function drawbackRows(actor) {
  return drawbacksOf(actor).sort((a, b) => a.sort - b.sort).map(item => {
    const { key, reminder, count = 1 } = itemFlags(item);
    return {
      key: key ?? item.id, id: item.id, name: count > 1 ? `${item.name} (x${count})` : item.name,
      summary: plainText(item.system.description?.value), reminder: reminder ?? "",
      automated: !!AUTOMATED[key], needsSpellPoints: NEEDS_SPELL_POINTS.has(key)
    };
  });
}

/** Take 1 damage and lose 1 maximum hit point per spell point (2 each from 11th level) until a long rest. */
async function drainingCasting(actor, { spent }) {
  const amount = spent * (casterLevel(actor) >= 11 ? 2 : 1);
  const previous = actor.system.attributes.hp.value;
  await actor.update({ "system.attributes.hp.tempmax": (actor.system._source.attributes.hp.tempmax ?? 0) - amount });
  await actor.applyDamage(amount);
  return game.i18n.format("DND5E-SPHERES.Drawback.Draining", {
    name: actor.name, amount, hp: actor.system.attributes.hp.value, previous
  });
}

/** Constitution save (DC 10 + 2 x spell points) or be poisoned for 1 round. The save is a normal roll, so 3D dice show. */
async function painfulMagic(actor, { spent }) {
  const dc = 10 + (2 * spent);
  const rolls = await actor.rollSavingThrow({ ability: "con", target: dc }, {}, {
    data: { flavor: game.i18n.format("DND5E-SPHERES.Drawback.PainfulFlavor", { dc }) }
  });
  const roll = rolls?.[0];
  if ( !roll ) return null;
  const success = roll.isSuccess ?? (roll.total >= dc);
  if ( success ) return game.i18n.format("DND5E-SPHERES.Drawback.PainfulPassed", { name: actor.name, total: roll.total, dc });
  if ( !actor.statuses.has("poisoned") ) await actor.toggleStatusEffect("poisoned", { active: true });
  return game.i18n.format("DND5E-SPHERES.Drawback.PainfulFailed", { name: actor.name, total: roll.total, dc });
}

/** Expend 1 gp per spell point spent. */
async function materialCasting(actor, { spent }) {
  const gp = actor.system.currency?.gp ?? 0;
  const paid = Math.min(gp, spent);
  await actor.update({ "system.currency.gp": gp - paid });
  const key = paid < spent ? "DND5E-SPHERES.Drawback.MaterialShort" : "DND5E-SPHERES.Drawback.Material";
  return game.i18n.format(key, { name: actor.name, paid, cost: spent });
}

/** 10% chance of a wild magic surge, rolled as a chat roll so Dice So Nice shows it. */
async function wildMagic(actor) {
  const roll = await new Roll("1d100").evaluate();
  const surge = roll.total <= 10;
  const text = game.i18n.format(surge ? "DND5E-SPHERES.Drawback.WildSurge" : "DND5E-SPHERES.Drawback.WildCalm",
    { total: roll.total });
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: text });
  return text;
}

/**
 * Resolve one drawback row: apply its effect when automated, otherwise just acknowledge it.
 * @param {Actor5e} actor
 * @param {object} row      A row from drawbackRows.
 * @param {number} spent    Spell points spent on the effect.
 * @returns {Promise<string|null>}  Result text, or null if the resolution was cancelled.
 */
export async function resolveDrawback(actor, row, spent) {
  const handler = AUTOMATED[row.key];
  if ( !handler || !getSetting("automateDrawbacks") ) return game.i18n.localize("DND5E-SPHERES.Drawback.Acknowledged");
  if ( row.needsSpellPoints && !spent ) return game.i18n.localize("DND5E-SPHERES.Drawback.NoSpellPoints");
  return handler(actor, { spent });
}

/**
 * Check drawbacks that must be satisfied before spell points can be spent.
 * @returns {boolean}  False to block the spending.
 */
export function canPayDrawbacks(actor, spent) {
  if ( !getSetting("automateDrawbacks") || !hasDrawback(actor, "material-casting") ) return true;
  const gp = actor.system.currency?.gp ?? 0;
  if ( gp >= spent ) return true;
  ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Warning.MaterialGold", { cost: spent, gp }));
  return false;
}
