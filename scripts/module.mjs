import { MODULE_ID, TEMPLATES } from "./constants.mjs";
import { CastDialog, registerCastHooks } from "./cast.mjs";
import { registerConfig } from "./config.mjs";
import { registerConsumptionHooks } from "./consumption.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSheetTab, registerTidy } from "./sheets.mjs";
import { computeSpheres, computeTalents, drawbackBonus, patchRollData, spellPointState } from "./spell-points.mjs";
import { TraditionBuilder } from "./tradition-builder.mjs";
import { applyTradition, ensureSpellPointsItem, readTradition } from "./tradition.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerConfig();
  registerSheetTab();
  registerConsumptionHooks();
  registerCastHooks();
  // Actors are prepared before the setup hook, so roll data must be patched here.
  patchRollData();
  foundry.applications.handlebars.loadTemplates([TEMPLATES.content]);
});

// Tidy fires this once its API is ready; registering at load time guarantees we never miss it.
Hooks.once("tidy5e-sheet.ready", api => registerTidy(api));

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    computeSpheres, computeTalents, drawbackBonus, spellPointState, readTradition, applyTradition, ensureSpellPointsItem,
    openBuilder: actor => new TraditionBuilder(actor).render({ force: true }),
    openCast: activity => new CastDialog(activity).render({ force: true })
  };
});
