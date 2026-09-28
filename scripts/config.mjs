import { FEATURE_TYPES } from "./constants.mjs";

/** Register the spheres feature types so they appear in item sheets and the Features tab filters. */
export function registerConfig() {
  for ( const [key, label] of Object.entries(FEATURE_TYPES) ) {
    CONFIG.DND5E.featureTypes[key] ??= { label };
  }
}
