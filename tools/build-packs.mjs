/**
 * Build the compendium packs from src/data.mjs, src/classes.mjs and src/spheres-*.mjs.
 * Usage: npm run build:packs  (Foundry must not have the module's world open while this runs.)
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { BOONS, DRAWBACKS, TRADITIONS, WIKI } from "../src/data.mjs";
import { buildSpherePacks } from "./build-spheres.mjs";

const MODULE_ID = "dnd5e-spheres";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build", "packs");
const SOURCE = { custom: "Spheres 5E wiki", book: "", page: "", license: "OGL-1.0a", rules: "2014", revision: 1 };
const STATS = { coreVersion: "14.368", systemId: "dnd5e", systemVersion: "6.0.5" };

/** Stable 16 character document ID derived from a key. */
const docId = key => createHash("sha1").update(`${MODULE_ID}.${key}`).digest("base64")
  .replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

const escape = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wikiLink = label => `<p><em>Full rules: <a href="${WIKI}">${label}</a> on the Spheres 5E wiki (Open Game Content, OGL 1.0a).</em></p>`;

function feat({ key, name, img, type, description, flags={}, system={}, sort=0 }) {
  const _id = docId(`${type || "feature"}.${key}`);
  return {
    _id, _key: `!items!${_id}`, name, type: "feat", img, sort,
    system: foundry_merge({
      description: { value: description, chat: "" },
      source: SOURCE,
      identifier: key,
      type: { value: type, subtype: "" },
      requirements: "",
      properties: [],
      activities: {},
      uses: { max: "", spent: 0, recovery: [] }
    }, system),
    effects: [],
    folder: null,
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { key, ...flags } },
    _stats: STATS
  };
}

function foundry_merge(target, source) {
  for ( const [k, v] of Object.entries(source) ) {
    if ( v && (typeof v === "object") && !Array.isArray(v) && target[k] && (typeof target[k] === "object") ) {
      foundry_merge(target[k], v);
    }
    else target[k] = v;
  }
  return target;
}

const byKey = list => Object.fromEntries(list.map(e => [e.key, e]));

function buildDrawbacks() {
  return DRAWBACKS.map((d, i) => feat({
    key: d.key, name: d.name, type: "drawback", sort: i * 100,
    img: d.automated ? "icons/svg/downgrade.svg" : "icons/svg/hazard.svg",
    description: `<p>${escape(d.summary)}</p>`
      + (d.weight > 1 ? "<p><strong>Counts as two drawbacks.</strong></p>" : "")
      + (d.repeatable ? "<p><strong>May be taken twice.</strong></p>" : "")
      + wikiLink("Casting Traditions: Drawbacks"),
    flags: {
      weight: d.weight ?? 1, repeatable: !!d.repeatable, automated: !!d.automated,
      ...(d.reminder ? { reminder: d.reminder } : {})
    }
  }));
}

function buildBoons() {
  return BOONS.map((b, i) => feat({
    key: b.key, name: b.name, type: "boon", sort: i * 100, img: "icons/svg/upgrade.svg",
    description: `<p>${escape(b.summary)}</p>${wikiLink("Casting Traditions: Boons")}`
  }));
}

function buildTraditions() {
  const drawbacks = byKey(DRAWBACKS);
  const boons = byKey(BOONS);
  const abilityNames = { int: "Intelligence", wis: "Wisdom", cha: "Charisma", con: "Constitution" };
  // One folder per tradition family (a tradition and its subtraditions).
  const folders = {};
  const folderFor = root => {
    if ( !folders[root] ) {
      const _id = docId(`folder.traditions.${root}`);
      folders[root] = { _id, _key: `!folders!${_id}`, name: root, type: "Item", folder: null, sorting: "a", sort: 0,
        color: null, description: "", flags: {}, _stats: STATS };
    }
    return folders[root]._id;
  };
  const docs = TRADITIONS.map((t, i) => {
    const entries = t.drawbacks.map(d => Array.isArray(d) ? { key: d[0], count: d[1] } : { key: d, count: 1 });
    for ( const { key } of entries ) if ( !drawbacks[key] ) throw new Error(`${t.name}: unknown drawback ${key}`);
    for ( const key of t.boons ) if ( !boons[key] ) throw new Error(`${t.name}: unknown boon ${key}`);
    const kam = t.kam.map(k => abilityNames[k]).join(" or ") + (t.kam.length > 1 ? " (whichever is higher)" : "");
    const list = items => items.length ? items.join(", ") : "None";
    const drawbackNames = entries.map(({ key, count }) => drawbacks[key].name + (count > 1 ? " (x2)" : ""));
    const key = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const doc = feat({
      key, name: t.name, type: "castingTradition", sort: i * 100, img: "icons/svg/book.svg",
      description: `<p>${escape(t.flavor)}</p>`
        + (t.parent ? `<p><strong>Subtradition of:</strong> ${escape(t.parent)}</p>` : "")
        + `<p><strong>Key ability:</strong> ${kam}</p>`
        + `<p><strong>Drawbacks:</strong> ${escape(list(drawbackNames))}</p>`
        + `<p><strong>Boons:</strong> ${escape(list(t.boons.map(b => boons[b].name)))}</p>`
        + `<p><strong>Bonus spheres or talents:</strong> ${escape(t.bonus)}</p>`
        + (t.note ? `<p>${escape(t.note)}</p>` : "")
        + wikiLink("Casting Traditions: Sample Traditions"),
      flags: { kam: t.kam, drawbacks: entries, boons: t.boons, bonus: t.bonus, ...(t.parent ? { parent: t.parent } : {}) }
    });
    doc.folder = folderFor(t.parent ?? t.name);
    return doc;
  });
  return [...Object.values(folders), ...docs];
}

function buildFeatures() {
  return [feat({
    key: "spell-points", name: "Spell Points", type: "", img: "icons/svg/aura.svg",
    description: "<p>Your pool of spell points. Its maximum is the spell points from your spherecaster classes, "
      + "plus your casting tradition's key ability modifier (counted once), plus bonus spell points from unspent drawbacks. "
      + "It is restored when you finish a long rest.</p>"
      + "<p>You cannot spend more spell points on a single sphere effect, including augments, than your proficiency bonus.</p>"
      + "<p>Use the <em>Spend Spell Points</em> activity to spend points on an effect that is not automated yet.</p>",
    flags: { spellPoints: true },
    system: {
      uses: { max: "@spheres.sp.max", spent: 0, recovery: [{ period: "lr", type: "recoverAll", formula: "" }] },
      activities: {
        dnd5eSpheresSpnd: {
          _id: "dnd5eSpheresSpnd",
          type: "utility",
          name: "Spend Spell Points",
          sort: 0,
          activation: { type: "special", value: null, override: false },
          consumption: {
            targets: [{ type: "itemUses", target: "", value: "1", scaling: { mode: "amount", formula: "" } }],
            scaling: { allowed: true, max: "@prof - 1" },
            spellSlot: false
          },
          description: { chatFlavor: "" },
          duration: { units: "inst", concentration: false, override: false },
          range: { override: false },
          target: { prompt: false, override: false },
          uses: { spent: 0, recovery: [], max: "" },
          roll: { formula: "", name: "", prompt: false, visible: false }
        }
      }
    }
  })];
}

const PACKS = {
  features: buildFeatures(),
  traditions: buildTraditions(),
  drawbacks: buildDrawbacks(),
  boons: buildBoons(),
  ...buildSpherePacks({ feat, docId, escape, SOURCE, STATS })
};

for ( const [name, docs] of Object.entries(PACKS) ) {
  const ids = new Set(docs.map(d => d._id));
  if ( ids.size !== docs.length ) throw new Error(`${name}: duplicate document IDs`);
}

for ( const [name, docs] of Object.entries(PACKS) ) {
  const src = path.join(BUILD, name);
  const dest = path.join(ROOT, "packs", name);
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
  await mkdir(src, { recursive: true });
  for ( const doc of docs ) {
    await writeFile(path.join(src, `${doc.name.replace(/[^A-Za-z0-9]+/g, "_")}_${doc._id}.json`), JSON.stringify(doc, null, 2));
  }
  await compilePack(src, dest, { log: false });
  const folders = docs.filter(d => d._key.startsWith("!folders!")).length;
  console.log(`${name}: ${docs.length - folders} items${folders ? `, ${folders} folders` : ""}`);
}
