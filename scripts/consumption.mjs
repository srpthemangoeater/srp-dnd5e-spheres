import { MODULE_ID } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { computeSpheres, getSpellPointsItem } from "./spell-points.mjs";
import { canPayDrawbacks, runDrawbacks } from "./drawbacks.mjs";

/**
 * Spell points an activity is about to spend, read from the calculated usage updates.
 * @returns {{item: Item5e, spent: number, newSpent: number}|null}
 */
function spellPointsSpent(actor, updates) {
  const item = getSpellPointsItem(actor);
  if ( !item ) return null;
  const update = updates.item?.find(u => u._id === item.id);
  if ( !update ) return null;
  const newSpent = update["system.uses.spent"] ?? foundry.utils.getProperty(update, "system.uses.spent");
  if ( newSpent === undefined ) return null;
  const spent = newSpent - (item.system.uses.spent ?? 0);
  return spent > 0 ? { item, spent, newSpent } : null;
}

/** Enforce the per-effect cap and remember what was spent for the chat card and drawbacks. */
function onActivityConsumption(activity, usageConfig, messageConfig, updates) {
  const actor = activity.actor;
  if ( !actor ) return;
  const result = spellPointsSpent(actor, updates);
  if ( !result ) return;

  const { cap } = computeSpheres(actor);
  if ( getSetting("enforceCap") && (result.spent > cap) ) {
    ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Warning.OverCap", { spent: result.spent, cap }));
    return false;
  }
  if ( !canPayDrawbacks(actor, result.spent) ) return false;

  const max = result.item.system.uses.max ?? 0;
  const sp = { spent: result.spent, remaining: Math.max(0, max - result.newSpent), max };
  foundry.utils.setProperty(messageConfig, `data.flags.${MODULE_ID}.sp`, sp);
  usageConfig[MODULE_ID] = sp;
}

/** Run drawback automation once the activity has been used. */
function onPostUseActivity(activity, usageConfig, results) {
  const sp = usageConfig[MODULE_ID];
  if ( !sp || !activity.actor ) return;
  runDrawbacks(activity.actor, { spent: sp.spent, activity, message: results.message });
}

/** Show spell points spent and remaining on the usage chat card. */
function onRenderChatMessage(message, html) {
  const sp = message.flags?.[MODULE_ID]?.sp;
  if ( !sp || html.querySelector(".dnd5e-spheres-sp")) return;
  const badge = document.createElement("div");
  badge.classList.add("dnd5e-spheres-sp");
  badge.innerHTML = `<i class="fas fa-atom" inert></i> ${game.i18n.format("DND5E-SPHERES.Chat.Spent", sp)}`;
  const anchor = html.querySelector(".card-header") ?? html.querySelector(".chat-card") ?? html.querySelector(".message-content");
  if ( anchor?.classList.contains("card-header") ) anchor.after(badge);
  else anchor?.prepend(badge);
}

export function registerConsumptionHooks() {
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
}
