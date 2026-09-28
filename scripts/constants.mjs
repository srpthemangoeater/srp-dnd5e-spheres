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

export const TEMPLATES = {
  tab: `modules/${MODULE_ID}/templates/spheres-tab.hbs`,
  content: `modules/${MODULE_ID}/templates/spheres-content.hbs`,
  builder: `modules/${MODULE_ID}/templates/tradition-builder.hbs`
};

export const PACKS = {
  drawbacks: `${MODULE_ID}.drawbacks`,
  boons: `${MODULE_ID}.boons`,
  traditions: `${MODULE_ID}.traditions`,
  features: `${MODULE_ID}.features`
};
