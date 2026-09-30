/**
 * Builders for the spherecaster class and magic sphere compendiums.
 * Shared helpers are passed in from build-packs.mjs.
 */
import { categoryLabel } from "../src/categories.mjs";
import { CLASSES } from "../src/classes.mjs";
import { FREE_PICKS } from "../src/free-picks.mjs";
import { SPHERES_A } from "../src/spheres-a.mjs";
import { SPHERES_B } from "../src/spheres-b.mjs";

const MODULE_ID = "dnd5e-spheres";
const WIKI = "https://spheres5e.wikidot.com";
export const SPHERES = [...SPHERES_A, ...SPHERES_B];

/** Sentinel consumption target, replaced with the actor's Spell Points item when used. */
export const SP_TARGET = "spheres-sp";

const SPHERE_ICONS = {
  alteration: "icons/svg/pawprint.svg", conjuration: "icons/svg/portal.svg", creation: "icons/svg/clockwork.svg",
  dark: "icons/svg/light-off.svg", death: "icons/svg/skull.svg", destruction: "icons/svg/explosion.svg",
  divination: "icons/svg/eye.svg", enhancement: "icons/svg/upgrade.svg", fate: "icons/svg/card-joker.svg",
  illusion: "icons/svg/invisible.svg", life: "icons/svg/heal.svg", light: "icons/svg/sun.svg",
  mind: "icons/svg/daze.svg", nature: "icons/svg/oak.svg", protection: "icons/svg/holy-shield.svg",
  telekinesis: "icons/svg/levels.svg", time: "icons/svg/clockwork.svg", universal: "icons/svg/aura.svg",
  warp: "icons/svg/teleport.svg", weather: "icons/svg/lightning.svg"
};

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildSpherePacks({ feat, docId, escape, SOURCE, STATS }) {
  const wikiLink = (page, label) =>
    `<p><em>Full rules: <a href="${WIKI}/${page}">${label}</a> on the Spheres 5E wiki (Open Game Content, OGL 1.0a).</em></p>`;
  const advId = (...parts) => docId(parts.join("."));

  /** Compendium folder document. */
  const folderDoc = (key, name, parent=null, sort=0) => {
    const _id = docId(`folder.${key}`);
    return { _id, _key: `!folders!${_id}`, name, type: "Item", folder: parent, sorting: "a", sort, color: null,
      description: "", flags: {}, _stats: STATS };
  };

  /* -------------------------------------------- */
  /*  Classes                                     */
  /* -------------------------------------------- */

  const featureDocs = [];
  const subclassDocs = [];
  const classDocs = [];
  const featureFolders = [];
  const subclassFolders = [];
  const folderIds = {};
  const featureFolder = (cls, sub) => {
    const classKey = `features.${cls.key}`;
    if ( !folderIds[classKey] ) {
      const f = folderDoc(classKey, cls.name);
      featureFolders.push(f);
      folderIds[classKey] = f._id;
    }
    if ( !sub ) {
      const coreKey = `${classKey}.core`;
      if ( !folderIds[coreKey] ) {
        const f = folderDoc(coreKey, `${cls.name} Features`, folderIds[classKey], -1);
        featureFolders.push(f);
        folderIds[coreKey] = f._id;
      }
      return folderIds[coreKey];
    }
    const subKey = `${classKey}.${slug(sub.name)}`;
    if ( !folderIds[subKey] ) {
      const f = folderDoc(subKey, sub.name, folderIds[classKey]);
      featureFolders.push(f);
      folderIds[subKey] = f._id;
    }
    return folderIds[subKey];
  };

  const featureDoc = (cls, [level, name, summary], sub=null) => {
    const key = `${cls.key}.${sub ? slug(sub.name) + "." : ""}${slug(name)}`;
    const doc = feat({
      key, name, type: "class", img: "icons/svg/book.svg", sort: level * 100,
      description: `<p>${escape(summary)}</p>${wikiLink(cls.page, cls.name)}`,
      system: { requirements: sub ? `${cls.name} (${sub.name}) ${level}` : `${cls.name} ${level}` },
      flags: { class: cls.key, ...(sub ? { subclass: slug(sub.name) } : {}), level }
    });
    doc.system.identifier = slug(name);
    doc.folder = featureFolder(cls, sub);
    featureDocs.push(doc);
    return doc;
  };

  const itemGrants = (owner, features, levelOf) => {
    const byLevel = {};
    for ( const doc of features ) (byLevel[levelOf(doc)] ??= []).push(doc);
    return Object.entries(byLevel).map(([level, docs]) => ({
      _id: advId(owner, "grant", level), type: "ItemGrant", level: Number(level), title: "Features", name: "Features",
      configuration: {
        items: docs.map(d => ({ uuid: `Compendium.${MODULE_ID}.class-features.Item.${d._id}`, optional: false, sort: 0 })),
        optional: false, spell: { ability: [], uses: { max: "", per: "", requireSlot: false }, prepared: 0 }, sorting: "m"
      },
      value: {}, flags: {}, hint: ""
    }));
  };

  const scaleFrom = values => {
    const scale = {};
    values.forEach((v, i) => { if ( i === 0 || v !== values[i - 1] ) scale[i + 1] = { value: v }; });
    return scale;
  };

  const trait = (owner, name, grants, choices) => ({
    _id: advId(owner, "trait", name), type: "Trait", level: 1, title: name, name, classRestriction: "primary",
    configuration: { mode: "default", allowReplacements: false, grants, choices }, value: {}, flags: {}, hint: ""
  });

  for ( const [ci, cls] of CLASSES.entries() ) {
    const features = cls.features.map(f => featureDoc(cls, f));
    const advancement = [
      { _id: advId(cls.key, "hp"), type: "HitPoints", title: "Hit Points", name: "Hit Points", configuration: {}, value: {}, flags: {}, hint: "" },
      trait(cls.key, "Armor and Weapon Proficiencies", [...cls.armor, ...cls.weapons], []),
      trait(cls.key, "Saving Throw Proficiencies", cls.saves.grants, cls.saves.choices),
      trait(cls.key, "Skill Proficiencies", [], [cls.skills]),
      trait(cls.key, "Tool Proficiencies", [], [cls.tools]),
      { _id: advId(cls.key, "scale", "spell-points"), type: "ScaleValue", title: "Spell Points", name: "Spell Points",
        configuration: { identifier: "spell-points", type: "number", distance: { units: "" }, scale: scaleFrom(cls.spellPoints) },
        value: {}, flags: {}, hint: "" },
      { _id: advId(cls.key, "scale", "magic-talents"), type: "ScaleValue", title: "Magic Talents", name: "Magic Talents",
        configuration: { identifier: "magic-talents", type: "number", distance: { units: "" }, scale: scaleFrom(cls.talents) },
        value: {}, flags: {}, hint: "" },
      ...(cls.extraScales ?? []).map(s => ({
        _id: advId(cls.key, "scale", s.identifier), type: "ScaleValue", title: s.name, name: s.name,
        configuration: {
          identifier: s.identifier, type: s.type, distance: { units: "" },
          scale: Object.fromEntries(Object.entries(s.scale).map(([lvl, v]) => [lvl, s.type === "dice"
            ? { number: v[0], faces: v[1], modifiers: [] } : { value: v }]))
        },
        value: {}, flags: {}, hint: ""
      })),
      ...itemGrants(cls.key, features, d => d.flags[MODULE_ID].level),
      ...cls.asi.map(level => ({
        _id: advId(cls.key, "asi", level), type: "AbilityScoreImprovement", level, title: "Ability Score Improvement",
        name: "Ability Score Improvement",
        configuration: { points: 2, fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, cap: 2, locked: [], recommendation: null },
        value: {}, flags: {}, hint: ""
      })),
      { _id: advId(cls.key, "subclass"), type: "Subclass", level: cls.subclassLevel, title: cls.subclassTitle,
        name: cls.subclassTitle, configuration: {}, value: { document: null, uuid: null }, flags: {}, hint: "" }
    ];

    const table = cls.talents.map((t, i) => `<tr><td>${i + 1}</td><td>${cls.spellPoints[i]}</td><td>${t}</td></tr>`).join("");
    const featureList = cls.features.map(([l, n]) => `<li>${l}: ${escape(n)}</li>`).join("");
    const clsId = docId(`class.${cls.key}`);
    classDocs.push({
      _id: clsId, _key: `!items!${clsId}`, name: cls.name, type: "class", img: "icons/svg/mystery-man.svg", sort: ci * 100,
      system: {
        description: {
          value: `<p>${escape(cls.summary)}</p>`
            + `<table><thead><tr><th>Level</th><th>Spell Points</th><th>Magic Talents</th></tr></thead><tbody>${table}</tbody></table>`
            + `<p><strong>Features:</strong></p><ul>${featureList}</ul>`
            + `<p>Spell points come from the <code>spell-points</code> scale value and magic talents from <code>magic-talents</code>.</p>`
            + wikiLink(cls.page, cls.name),
          chat: ""
        },
        source: SOURCE, identifier: cls.key, levels: 1,
        advancement: Object.fromEntries(advancement.map(a => [a._id, a])),
        spellcasting: { progression: "none", ability: "", preparation: {} },
        startingEquipment: [], wealth: "",
        primaryAbility: { value: [], all: true },
        hd: { denomination: cls.hd, spent: 0, additional: "" },
        properties: []
      },
      effects: [], folder: null, ownership: { default: 0 },
      flags: { [MODULE_ID]: { key: cls.key, spherecaster: true } },
      _stats: STATS
    });

    const subFolder = folderDoc(`subclasses.${cls.key}`, cls.name, null, ci);
    subclassFolders.push(subFolder);
    for ( const [si, sub] of cls.subclasses.entries() ) {
      const subFeatures = sub.features.map(f => featureDoc(cls, f, sub));
      const subKey = slug(sub.name);
      const subId = docId(`subclass.${cls.key}.${subKey}`);
      subclassDocs.push({
        _id: subId, _key: `!items!${subId}`, name: sub.name, type: "subclass", img: "icons/svg/book.svg", sort: (ci * 20 + si) * 100,
        system: {
          description: {
            value: `<p>${escape(sub.summary)}</p><ul>${sub.features.map(([l, n]) => `<li>${l}: ${escape(n)}</li>`).join("")}</ul>`
              + wikiLink(cls.page, `${cls.name}: ${sub.name}`),
            chat: ""
          },
          source: SOURCE, identifier: subKey, classIdentifier: cls.key,
          advancement: Object.fromEntries(itemGrants(`${cls.key}.${subKey}`, subFeatures, d => d.flags[MODULE_ID].level)
            .map(a => [a._id, a])),
          spellcasting: { progression: "none", ability: "", preparation: {} }
        },
        effects: [], folder: subFolder._id, ownership: { default: 0 },
        flags: { [MODULE_ID]: { key: subKey, class: cls.key } },
        _stats: STATS
      });
    }
  }

  /* -------------------------------------------- */
  /*  Spheres                                     */
  /* -------------------------------------------- */

  const RANGE = r => ["touch", "self", "any"].includes(r) ? { units: r, value: null } : { units: "ft", value: String(r) };

  /** Template data from [type, size, width, height]. */
  const TEMPLATE = ([type, size, width, height]) => ({ count: "", contiguous: false, type, size: String(size),
    ...(width ? { width: String(width) } : {}), ...(height ? { height: String(height) } : {}), units: "ft" });
  const areaText = ([type, size, width, height]) => type === "radius" ? `${size} ft radius around you`
    : type === "line" || type === "wall" ? `${size} ft ${type}${width ? ` (${width} ft wide)` : ""}${height ? `, ${height} ft high` : ""}`
    : `${size} ft ${type}${height ? `, ${height} ft high` : ""}`;

  const activityFor = (ownerKey, ability, index) => {
    const _id = docId(`activity.${ownerKey}.${ability.key}`);
    const [dValue, dUnits, concentration] = ability.duration ?? [0, "inst", false];
    const base = {
      _id, type: ability.type, name: ability.name, sort: index * 100,
      activation: { type: ability.activation, value: ability.activationValue ?? null, condition: "", override: false },
      consumption: {
        targets: [{ type: "itemUses", target: SP_TARGET, value: "0", scaling: { mode: "amount", formula: "1" } }],
        scaling: { allowed: true, max: "20" },
        spellSlot: false
      },
      description: { chatFlavor: "" },
      duration: { value: dValue ? String(dValue) : "", units: dUnits, concentration, override: false },
      range: { ...RANGE(ability.range), special: "", override: false },
      target: {
        template: ability.template ? TEMPLATE(ability.template)
          : { count: "", contiguous: false, type: "", size: "", units: "ft" },
        affects: { count: "", type: "", choice: false, special: "" },
        prompt: !!ability.template, override: false
      },
      uses: { spent: 0, recovery: [], max: "" },
      effects: []
    };
    const damagePart = key => ({
      number: null, denomination: null, bonus: "", types: ability.damage.types,
      custom: { enabled: true, formula: `@spheres.fx.${key}` }, scaling: { mode: "", number: null, formula: "" }
    });
    if ( ability.type === "save" ) {
      base.save = { ability: [ability.save], dc: { calculation: "", formula: "@spheres.dc" } };
      base.damage = { onSave: ability.damage ? "half" : "none", parts: ability.damage ? [damagePart(ability.damage.key)] : [] };
    }
    else if ( ability.type === "attack" ) {
      // Flat bonus: sphere attacks use proficiency + key ability modifier, which @spheres.attack already holds.
      base.attack = { ability: "none", bonus: "@spheres.attack", critical: { threshold: null }, flat: true,
        type: { value: "ranged", classification: "spell" } };
      base.damage = { critical: { allow: true, bonus: "" }, includeBase: false,
        parts: ability.damage ? [damagePart(ability.damage.key)] : [] };
    }
    else if ( ability.type === "heal" ) {
      base.healing = { number: null, denomination: null, bonus: "", types: [ability.heal.type],
        custom: { enabled: true, formula: `@spheres.fx.${ability.heal.key}` }, scaling: { mode: "", number: null, formula: "" } };
    }
    return base;
  };

  /** Activities, cast metadata and description HTML for a list of sphere abilities on one item. */
  const buildAbilities = (ownerKey, list=[]) => {
    const abilities = {};
    const activities = {};
    list.forEach((ability, i) => {
      const act = activityFor(ownerKey, ability, i);
      activities[act._id] = act;
      abilities[act._id] = {
        key: ability.key, name: ability.name, cost: ability.cost ?? 0, hidden: !!ability.hidden,
        groups: ability.groups ?? {}, multi: ability.multi ?? [], augments: ability.augments ?? [],
        fx: ability.damage?.key ?? ability.heal?.key ?? null,
        // A package root: "package" lists the actor's packages and their own abilities (Geomancy, Universal),
        // "spirit" lists packages and the spirit abilities the actor's (spirit) talents grant for each (Spirit).
        ...(ability.packages ? { packages: ability.packages } : {}),
        // The Nature package a spirit ability needs.
        ...(ability.package ? { package: ability.package } : {})
      };
    });
    const html = list.filter(a => !a.hidden).map(a => `<h3>${escape(a.name)}</h3><p>${escape(a.summary)}</p>`
      + (a.package ? `<p><em>Requires the ${escape(a.package)}.</em></p>` : "")
      + (a.cost ? `<p><strong>Cost:</strong> ${a.cost} spell point${a.cost > 1 ? "s" : ""}.</p>` : "")
      + (a.augments?.length ? `<p><strong>Augments:</strong> ${a.augments.map(x => `${escape(x.label)} (${x.cost} SP)`).join("; ")}.</p>` : "")).join("");
    return { abilities, activities, html };
  };

  /** Description of free picks and automatic grants. */
  const picksText = (freePicks=[], grants=[], what="this sphere") => {
    const parts = [];
    if ( grants.length ) parts.push(`<p><strong>Included:</strong> ${grants.map(escape).join(", ")} (added automatically, free).</p>`);
    if ( freePicks.length ) parts.push(`<p><strong>When you first gain ${what}</strong> you also choose ${freePicks.map(p =>
      `${p.count} ${p.categories.map(categoryLabel).join(" or ")} talent${p.count > 1 ? "s" : ""}`).join(" and ")}`
      + ` for free.${freePicks.some(p => p.note) ? ` ${escape(freePicks.find(p => p.note).note)}` : ""}</p>`);
    return parts.join("");
  };

  const sphereDocs = [];
  const talentDocs = [];
  const talentFolders = [];
  for ( const [si, sphere] of SPHERES.entries() ) {
    const sphereFolder = folderDoc(`talents.${sphere.key}`, sphere.name);
    talentFolders.push(sphereFolder);
    const categoryFolders = {};
    const categoryFolder = category => {
      if ( !categoryFolders[category] ) {
        // "Other" sorts last; everything else alphabetically.
        const f = folderDoc(`talents.${sphere.key}.${category}`, categoryLabel(category), sphereFolder._id,
          category === "other" ? 1 : 0);
        talentFolders.push(f);
        categoryFolders[category] = f._id;
      }
      return categoryFolders[category];
    };
    const { abilities, activities, html: abilityHtml } = buildAbilities(sphere.key, sphere.abilities);
    const freePicks = FREE_PICKS[sphere.key] ?? [];
    const grants = sphere.grants ?? [];
    for ( const g of grants ) {
      if ( !sphere.talents.some(t => t[0] === g) ) throw new Error(`${sphere.name}: granted talent ${g} is missing`);
    }
    const doc = feat({
      key: sphere.key, name: sphere.name, type: "sphere", img: SPHERE_ICONS[sphere.key], sort: si * 100,
      description: `<p>${escape(sphere.summary)}</p>${picksText(freePicks, grants)}${abilityHtml}${wikiLink(sphere.key, sphere.name)}`,
      flags: { sphere: sphere.key, abilities, freePicks, grants },
      system: { activities }
    });
    sphereDocs.push(doc);

    for ( const [ti, [name, category, advanced, summary, extraIn={}]] of sphere.talents.entries() ) {
      const key = `${sphere.key}.${slug(name)}`;
      // Talents can carry their own abilities (e.g. Nature packages) and free picks (e.g. Universal packages).
      const { abilities: talentAbilities, freePicks: talentPicks, ...extra } = extraIn;
      const built = buildAbilities(key, talentAbilities);
      const costText = extra.cost ? `<p><strong>Augment:</strong> ${extra.cost > 0 ? "+" : ""}${extra.cost} spell point${Math.abs(extra.cost) > 1 ? "s" : ""}.</p>` : "";
      const t = feat({
        key, name, type: "talent", img: advanced ? "icons/svg/upgrade.svg" : SPHERE_ICONS[sphere.key], sort: ti * 10,
        description: `<p>${escape(summary)}</p>${costText}`
          + (extra.free ? `<p><em>Free blast type if you have the ${extra.free} sphere.</em></p>` : "")
          + (extra.builtIn ? `<p><em>Included with the ${sphere.name} sphere.</em></p>` : "")
          + (advanced ? "<p><strong>Advanced talent.</strong></p>" : "")
          + (extra.packages ? `<p><strong>Package:</strong> ${extra.packages.map(escape).join(" or ")}.</p>` : "")
          + (extra.template ? `<p><strong>Area:</strong> ${areaText(extra.template)}${extra.shapeOptions?.length
            ? `; ${extra.shapeOptions.map(o => `${escape(o.label.toLowerCase())} (${o.cost} SP)`).join(", ")}` : ""}.</p>` : "")
          + (extra.options?.length ? extra.options.map(o => `<p><strong>${escape(o.name)}</strong> (${o.mode}${o.cost ? `, ${o.cost} SP` : ""}): ${escape(o.summary)}`
            + (o.augments?.length ? ` <em>Augments: ${o.augments.map(x => `${escape(x.label)} (${x.cost} SP)`).join("; ")}.</em>` : "") + "</p>").join("") : "")
          + (extra.options?.some(o => o.changes || o.statuses || o.itemChanges) ? "<p><em>Options with effects can be applied to targets from the chat card.</em></p>" : "")
          + picksText(talentPicks, [], extra.repeatable ? "this talent" : "this package")
          + built.html
          + wikiLink(sphere.key, `${sphere.name} sphere`),
        flags: { sphere: sphere.key, category, advanced: !!advanced, ...extra,
          ...(talentAbilities?.length ? { abilities: built.abilities } : {}),
          ...(talentPicks?.length ? { freePicks: talentPicks } : {}) },
        system: { requirements: `${sphere.name}${advanced ? " (advanced)" : ""}`, activities: built.activities }
      });
      t.system.type.subtype = sphere.key;
      t.folder = categoryFolder(category);
      talentDocs.push(t);
    }
  }

  return {
    classes: classDocs,
    subclasses: [...subclassFolders, ...subclassDocs],
    "class-features": [...featureFolders, ...featureDocs],
    spheres: sphereDocs,
    talents: [...talentFolders, ...talentDocs]
  };
}
