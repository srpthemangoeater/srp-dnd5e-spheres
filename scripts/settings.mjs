import { MODULE_ID } from "./constants.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, "enforceCap", {
    name: "DND5E-SPHERES.Settings.EnforceCap.Name",
    hint: "DND5E-SPHERES.Settings.EnforceCap.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "automateDrawbacks", {
    name: "DND5E-SPHERES.Settings.AutomateDrawbacks.Name",
    hint: "DND5E-SPHERES.Settings.AutomateDrawbacks.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "drawbackReminders", {
    name: "DND5E-SPHERES.Settings.DrawbackReminders.Name",
    hint: "DND5E-SPHERES.Settings.DrawbackReminders.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoResolveDrawbacks", {
    name: "DND5E-SPHERES.Settings.AutoResolve.Name",
    hint: "DND5E-SPHERES.Settings.AutoResolve.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "headerBox", {
    name: "DND5E-SPHERES.Settings.HeaderBox.Name",
    hint: "DND5E-SPHERES.Settings.HeaderBox.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

export const getSetting = key => game.settings.get(MODULE_ID, key);
