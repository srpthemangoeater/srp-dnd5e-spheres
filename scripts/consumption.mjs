import { MODULE_ID } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { computeSpheres, getSpellPointsItem } from "./spell-points.mjs";
import { canPayDrawbacks } from "./drawbacks.mjs";
import { autoResolve, cardFlags } from "./chat.mjs";

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

/** Enforce the per-effect cap and record what was spent for the chat card and its drawback rows. */
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
  // Spending outside the cast dialog (e.g. the Spell Points item) still gets tradition and drawback rows.
  if ( !foundry.utils.getProperty(messageConfig, `data.flags.${MODULE_ID}.drawbacks`) ) {
    foundry.utils.mergeObject(messageConfig, { data: { flags: { [MODULE_ID]: cardFlags(actor) } } });
  }
  foundry.utils.setProperty(messageConfig, `data.flags.${MODULE_ID}.sp`, sp);
  usageConfig[MODULE_ID] = sp;
}

/** Resolve automated drawbacks straight away if the world setting asks for it. */
function onPostUseActivity(activity, usageConfig, results) {
  if ( results.message?.flags?.[MODULE_ID]?.drawbacks ) autoResolve(results.message);
}

export function registerConsumptionHooks() {
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
}
