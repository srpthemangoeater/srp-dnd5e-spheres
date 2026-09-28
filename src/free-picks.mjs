/**
 * Talents a character chooses for free when first gaining a sphere. Each pick lists the talent
 * categories it may come from. These talents do not cost magic talents.
 */
export const FREE_PICKS = {
  alteration: [{ categories: ["genotype"], count: 1 }],
  conjuration: [{ categories: ["base"], count: 1 }],
  death: [{ categories: ["undead"], count: 1 }],
  destruction: [
    { categories: ["blastType"], count: 1, note: "It does not need to be associated with a sphere you have." },
    { categories: ["blastShape"], count: 1 }
  ],
  divination: [
    { categories: ["divine"], count: 1, note: "It does not need to be associated with a sphere you have." },
    { categories: ["sense"], count: 1 }
  ],
  enhancement: [{ categories: ["enhancement"], count: 1 }],
  fate: [{ categories: ["consecration", "motif", "word"], count: 1 }],
  mind: [{ categories: ["charm"], count: 1 }],
  nature: [{ categories: ["package"], count: 1 }],
  time: [{ categories: ["alterTime"], count: 1 }],
  universal: [{ categories: ["package"], count: 1 }],
  weather: [{ categories: ["mantle", "shroud"], count: 1 }]
};
