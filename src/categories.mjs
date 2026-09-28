/** Display names for talent categories. Shared by the pack builder (folders) and the module (browser, chat). */
export const CATEGORY_LABELS = {
  aegis: "Aegis", alter: "Alter", alterTime: "Alter Time", base: "Base Companion", blastShape: "Blast Shape",
  blastType: "Blast Type", catch: "Catch", charm: "Charm", consecration: "Consecration", darkness: "Darkness",
  dispel: "Dispel", divine: "Divine", enhancement: "Enhancement", figment: "Figment", form: "Form",
  genotype: "Genotype", geomancy: "Geomancy", ghostStrike: "Ghost Strike", glamer: "Glamer", glow: "Glow",
  gravity: "Gravity", lens: "Lens", levitate: "Levitate", manabond: "Manabond", mantle: "Mantle", meld: "Meld",
  metasphere: "Metasphere", motif: "Motif", nimbus: "Nimbus", package: "Package", projectile: "Projectile",
  reanimate: "Reanimate", sense: "Sense", sensory: "Sensory", shroud: "Shroud", space: "Space", spirit: "Spirit",
  succor: "Succor", teleport: "Teleport", trait: "Trait", undead: "Undead", ward: "Ward", wildMagic: "Wild Magic",
  word: "Word", other: "Other"
};

export const categoryLabel = key => CATEGORY_LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "");
