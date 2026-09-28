import { MODULE_ID } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { isFeatureType, itemFlags } from "./spell-points.mjs";

/** Drawbacks with numeric effects that are automated. Everything else only posts a reminder. */
const AUTOMATED = {
  "draining-casting": drainingCasting,
  "painful-magic": painfulMagic,
  "material-casting": materialCasting,
  "wild-magic": wildMagic
};

const drawbacksOf = actor => actor.items.filter(i => isFeatureType(i, "drawback"));
const hasDrawback = (actor, key) => drawbacksOf(actor).some(i => itemFlags(i).key === key);

async function postMessage(actor, content, extra={}) {
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="dnd5e-spheres-drawback">${content}</div>`,
    ...extra
  });
}

/** Take 1 damage and lose 1 maximum hit point per spell point (2 each from 11th level) until a long rest. */
async function drainingCasting(actor, { spent }) {
  const amount = spent * ((actor.system.details?.level ?? 0) >= 11 ? 2 : 1);
  const hp = actor.system.attributes.hp;
  await actor.update({ "system.attributes.hp.tempmax": (actor.system._source.attributes.hp.tempmax ?? 0) - amount });
  await actor.applyDamage(amount);
  await postMessage(actor, game.i18n.format("DND5E-SPHERES.Drawback.Draining", {
    name: actor.name, amount, hp: actor.system.attributes.hp.value, previous: hp.value
  }));
}

/** Constitution save (DC 10 + 2 x spell points) or be poisoned for 1 round. */
async function painfulMagic(actor, { spent }) {
  const dc = 10 + (2 * spent);
  const rolls = await actor.rollSavingThrow({ ability: "con", target: dc }, {}, {
    data: { flavor: game.i18n.format("DND5E-SPHERES.Drawback.PainfulFlavor", { dc }) }
  });
  const roll = rolls?.[0];
  if ( !roll ) return;
  const success = roll.isSuccess ?? (roll.total >= dc);
  if ( success ) return;
  if ( !actor.statuses.has("poisoned") ) await actor.toggleStatusEffect("poisoned", { active: true });
  await postMessage(actor, game.i18n.format("DND5E-SPHERES.Drawback.PainfulFailed", { name: actor.name }));
}

/** Expend 1 gp per spell point spent. */
async function materialCasting(actor, { spent }) {
  const gp = actor.system.currency?.gp ?? 0;
  const paid = Math.min(gp, spent);
  await actor.update({ "system.currency.gp": gp - paid });
  const key = paid < spent ? "DND5E-SPHERES.Drawback.MaterialShort" : "DND5E-SPHERES.Drawback.Material";
  await postMessage(actor, game.i18n.format(key, { name: actor.name, paid, cost: spent }));
}

/** 10% chance of a wild magic surge. */
async function wildMagic(actor) {
  const roll = await new Roll("1d100").evaluate();
  const surge = roll.total <= 10;
  await roll.toMessage({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flavor: game.i18n.localize(surge ? "DND5E-SPHERES.Drawback.WildSurge" : "DND5E-SPHERES.Drawback.WildCalm")
  });
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

/**
 * Apply automated drawbacks and post reminders for the rest after spell points were spent.
 * @param {Actor5e} actor
 * @param {{spent: number}} context
 */
export async function runDrawbacks(actor, context) {
  const drawbacks = drawbacksOf(actor);
  if ( !drawbacks.length ) return;
  const automate = getSetting("automateDrawbacks");
  const reminders = [];
  for ( const item of drawbacks ) {
    const { key, reminder } = itemFlags(item);
    const handler = AUTOMATED[key];
    if ( handler && automate ) {
      try {
        await handler(actor, context);
      } catch(err) {
        console.error(`${MODULE_ID} | Drawback automation failed for ${item.name}`, err);
      }
    }
    else if ( reminder ) reminders.push(`<li><strong>${item.name}:</strong> ${reminder}</li>`);
  }
  if ( reminders.length && getSetting("drawbackReminders") ) {
    await postMessage(actor, `<p>${game.i18n.localize("DND5E-SPHERES.Drawback.Reminders")}</p><ul>${reminders.join("")}</ul>`);
  }
}
