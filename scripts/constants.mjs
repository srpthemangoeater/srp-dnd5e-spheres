export const MODULE_ID = "dnd5e-spheres";

/** Feature types added to CONFIG.DND5E.featureTypes. */
export const FEATURE_TYPES = {
  castingTradition: "DND5E-SPHERES.FeatureType.castingTradition",
  drawback: "DND5E-SPHERES.FeatureType.drawback",
  boon: "DND5E-SPHERES.FeatureType.boon",
  sphere: "DND5E-SPHERES.FeatureType.sphere",
  talent: "DND5E-SPHERES.FeatureType.talent"
};

/** Abilities a casting tradition may use as its key ability. */
export const KEY_ABILITIES = ["int", "wis", "cha", "con"];

/** Identifier of the ScaleValue advancement spherecaster classes use for spell points. */
export const SP_SCALE_ID = "spell-points";

/** Identifier of the ScaleValue advancement spherecaster classes use for magic talents. */
export const TALENT_SCALE_ID = "magic-talents";

/** Bonus magic talents granted by a casting tradition. */
export const TRADITION_TALENTS = 2;

/** Sentinel consumption target on sphere activities, replaced with the actor's Spell Points item. */
export const SP_TARGET = "spheres-sp";

/** The magic spheres, used as talent subtypes. */
export const SPHERE_NAMES = {
  alteration: "Alteration", conjuration: "Conjuration", creation: "Creation", dark: "Dark", death: "Death",
  destruction: "Destruction", divination: "Divination", enhancement: "Enhancement", fate: "Fate",
  illusion: "Illusion", life: "Life", light: "Light", mind: "Mind", nature: "Nature", protection: "Protection",
  telekinesis: "Telekinesis", time: "Time", universal: "Universal", warp: "Warp", weather: "Weather"
};

export const TEMPLATES = {
  tab: `modules/${MODULE_ID}/templates/spheres-tab.hbs`,
  content: `modules/${MODULE_ID}/templates/spheres-content.hbs`,
  builder: `modules/${MODULE_ID}/templates/tradition-builder.hbs`,
  cast: `modules/${MODULE_ID}/templates/cast-dialog.hbs`,
  browserFilters: `modules/${MODULE_ID}/templates/browser-filters.hbs`,
  browserResults: `modules/${MODULE_ID}/templates/browser-results.hbs`,
  freePicks: `modules/${MODULE_ID}/templates/free-picks.hbs`,
  customTalent: `modules/${MODULE_ID}/templates/custom-talent.hbs`
};

export const PACKS = {
  drawbacks: `${MODULE_ID}.drawbacks`,
  boons: `${MODULE_ID}.boons`,
  traditions: `${MODULE_ID}.traditions`,
  features: `${MODULE_ID}.features`,
  classes: `${MODULE_ID}.classes`,
  spheres: `${MODULE_ID}.spheres`,
  talents: `${MODULE_ID}.talents`
};
