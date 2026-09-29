import { categoryLabel } from "../src/categories.mjs";
import { MODULE_ID, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { SpheresBrowser } from "./browser.mjs";
import { CastDialog } from "./cast.mjs";
import { postItemToChat, postTraditionCard } from "./chat.mjs";
import { FreePicksDialog, hasRemainingPicks } from "./free-picks.mjs";
import { computeSpheres, computeTalents, drawbackWeight, isFeatureType, itemFlags, spellPointState } from "./spell-points.mjs";
import { ensureSpellPointsItem } from "./tradition.mjs";
import { TraditionBuilder } from "./tradition-builder.mjs";

const MAX_PIPS = 40;

/* -------------------------------------------- */
/*  Collapsed / expanded state                  */
/* -------------------------------------------- */

/** Accordion state is stored per user, keyed by actor and row. Groups default to open, rows to closed. */
const uiState = () => game.user.getFlag(MODULE_ID, "accordion") ?? {};
const stateKey = (actor, key) => `${actor.id}_${key}`.replace(/\./g, "_");
const isOpen = (actor, key, fallback) => uiState()[stateKey(actor, key)] ?? fallback;

const saveState = foundry.utils.debounce(changes => game.user.setFlag(MODULE_ID, "accordion", changes), 400);
let pending = null;
function rememberState(actor, key, open) {
  pending = { ...(pending ?? uiState()), [stateKey(actor, key)]: open };
  saveState(pending);
}

/* -------------------------------------------- */
/*  Context                                     */
/* -------------------------------------------- */

/** All paragraphs of a description except the wiki link line. */
function fullText(html) {
  const div = document.createElement("div");
  div.innerHTML = html ?? "";
  return [...div.querySelectorAll("p, li")].map(p => p.textContent.trim())
    .filter(t => t && !t.startsWith("Full rules:"));
}

const bySort = (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name);

/**
 * Data shared by the default sheet and Tidy templates.
 * @param {Actor5e} actor
 * @param {boolean} editable  Whether the sheet is in edit mode (enables edit, remove and reorder).
 */
export function buildSpheresContext(actor, editable) {
  const data = computeSpheres(actor);
  const pool = spellPointState(actor);
  const talentData = computeTalents(actor);
  const tradition = actor.items.find(i => isFeatureType(i, "castingTradition"));
  const pips = pool.max <= MAX_PIPS ? Array.fromRange(pool.max).map(n => ({ spent: n >= pool.value })) : [];
  const sphereOf = item => itemFlags(item).sphere ?? item.system.type?.subtype ?? item.system.identifier;

  const entry = item => {
    const f = itemFlags(item);
    return {
      id: item.id, name: item.name, img: item.img, key: `item.${item.id}`,
      open: isOpen(actor, `item.${item.id}`, false),
      description: fullText(item.system.description?.value),
      count: f.count ?? 1,
      weight: isFeatureType(item, "drawback") ? drawbackWeight(item) : null,
      automated: !!f.automated
    };
  };
  const talentEntry = t => ({
    ...entry(t),
    advanced: !!itemFlags(t).advanced,
    freePick: !!itemFlags(t).freePick && !itemFlags(t).included,
    included: !!(itemFlags(t).included || itemFlags(t).builtIn),
    free: talentData.isFree(t),
    override: !!itemFlags(t).override,
    overrideNote: itemFlags(t).overrideNote ?? "",
    picksLeft: actor.isOwner && hasRemainingPicks(t),
    category: categoryLabel(itemFlags(t).category),
    cost: itemFlags(t).cost
  });
  /** Castable abilities on an item (a sphere's base abilities or a package's geomancy). */
  const abilitiesOf = item => Object.entries(itemFlags(item).abilities ?? {}).filter(([, m]) => !m.hidden)
    .map(([activityId, m]) => ({ activityId, itemId: item.id, name: m.name, cost: m.cost }));
  const byType = type => actor.items.filter(i => isFeatureType(i, type)).sort(bySort).map(entry);

  const talentItems = actor.items.filter(i => isFeatureType(i, "talent"));
  const sphereList = actor.items.filter(i => isFeatureType(i, "sphere")).sort(bySort).map(sphere => {
    const key = sphereOf(sphere);
    const talents = talentItems.filter(t => sphereOf(t) === key).sort(bySort);
    return {
      ...entry(sphere), key,
      abilities: [...abilitiesOf(sphere), ...talents.flatMap(abilitiesOf)],
      override: !!itemFlags(sphere).override,
      overrideNote: itemFlags(sphere).overrideNote ?? "",
      groupKey: `sphere.${sphere.id}`, groupOpen: isOpen(actor, `sphere.${sphere.id}`, true),
      picksLeft: actor.isOwner && hasRemainingPicks(sphere),
      talents: talents.map(talentEntry)
    };
  });
  const ownedKeys = new Set(sphereList.map(s => s.key));
  const orphanTalents = talentItems.filter(t => !ownedKeys.has(sphereOf(t))).map(talentEntry);
  const drawbacks = byType("drawback");
  const boons = byType("boon");

  return {
    ...data,
    editable,
    owner: actor.isOwner,
    kamLabel: data.kam ? CONFIG.DND5E.abilities[data.kam]?.label : null,
    pool: { exists: !!pool.item, id: pool.item?.id, value: pool.value, max: pool.max, spent: pool.spent,
      pct: pool.max ? Math.round((pool.value / pool.max) * 100) : 0 },
    pips,
    tradition: tradition ? entry(tradition) : null,
    groups: {
      drawbacks: { key: "group.drawbacks", open: isOpen(actor, "group.drawbacks", true), items: drawbacks },
      boons: { key: "group.boons", open: isOpen(actor, "group.boons", true), items: boons }
    },
    sphereList,
    orphanTalents,
    talentTracker: talentData,
    hasSpheres: sphereList.length > 0 || orphanTalents.length > 0
  };
}

/* -------------------------------------------- */
/*  Interaction                                 */
/* -------------------------------------------- */

async function adjustPool(actor, delta) {
  const { item, max, spent } = spellPointState(actor);
  if ( !item ) return;
  await item.update({ "system.uses.spent": Math.clamp(spent + delta, 0, max) });
}

async function removeItem(item) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("DND5E-SPHERES.DeleteTitle", { name: item.name }) },
    content: `<p>${game.i18n.format("DND5E-SPHERES.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`
  });
  if ( confirmed ) await item.delete();
}

/** Mark an item as taken with an override, or edit / clear its note. */
export async function editOverride(item) {
  const f = itemFlags(item);
  const escape = foundry.utils.escapeHTML;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format("DND5E-SPHERES.Override.Title", { name: item.name }) },
    content: `<p>${game.i18n.localize("DND5E-SPHERES.Override.Hint")}</p>
      <label class="checkbox"><input type="checkbox" name="override" ${f.override ? "checked" : ""}>
        ${game.i18n.localize("DND5E-SPHERES.Override.Label")}</label>
      <input type="text" name="note" value="${escape(f.overrideNote ?? "")}" placeholder="${game.i18n.localize("DND5E-SPHERES.Override.NotePlaceholder")}">`,
    ok: {
      label: "DND5E-SPHERES.Override.Save",
      callback: (event, button) => ({ override: button.form.elements.override.checked, note: button.form.elements.note.value.trim() })
    },
    rejectClose: false
  });
  if ( !result ) return;
  await item.update({ [`flags.${MODULE_ID}.override`]: result.override, [`flags.${MODULE_ID}.overrideNote`]: result.note });
}

/** Cast one of an item's abilities (sphere or package), asking which when it has several. */
async function castFromSphere(sphere) {
  const abilities = Object.entries(itemFlags(sphere).abilities ?? {}).filter(([, m]) => !m.hidden);
  const open = id => {
    const activity = sphere.system.activities.get(id);
    if ( activity ) new CastDialog(activity).render({ force: true });
  };
  if ( abilities.length === 1 ) return open(abilities[0][0]);
  if ( !abilities.length ) return;
  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("DND5E-SPHERES.Context.CastTitle", { sphere: sphere.name }) },
    content: `<p>${game.i18n.localize("DND5E-SPHERES.Context.CastWhich")}</p>`,
    buttons: abilities.map(([id, m], i) => ({ action: id, label: m.name, default: i === 0, callback: () => open(id) })),
    rejectClose: false
  });
}

/** Right-click menu on rows of the Spheres tab. */
function activateContextMenu(actor, element) {
  if ( element.dataset.spheresMenu ) return;
  element.dataset.spheresMenu = "true";
  const itemOf = target => actor.items.get(target.dataset.spheresItemId);
  const editing = () => element.querySelector(".dnd5e-spheres-content")?.classList.contains("editing") ?? false;
  const isSphere = target => target.dataset.contextType === "sphere";
  const isTradition = target => target.dataset.contextType === "tradition";
  const hasAbilities = t => Object.values(itemFlags(itemOf(t)).abilities ?? {}).some(m => !m.hidden);
  const isTalentOrSphere = t => ["sphere", "talent"].includes(t.dataset.contextType);
  new foundry.applications.ux.ContextMenu(element, "[data-spheres-context]", [
    { label: "DND5E-SPHERES.Context.Cast", icon: "fa-solid fa-wand-magic-sparkles",
      visible: t => !!itemOf(t) && actor.isOwner && hasAbilities(t), onClick: (e, t) => castFromSphere(itemOf(t)) },
    { label: "DND5E-SPHERES.Context.FreePicks", icon: "fa-solid fa-gift",
      visible: t => !!itemOf(t) && actor.isOwner && hasRemainingPicks(itemOf(t)),
      onClick: (e, t) => new FreePicksDialog(itemOf(t)).render({ force: true }) },
    { label: "DND5E-SPHERES.Override.Menu", icon: "fa-solid fa-unlock",
      visible: t => isTalentOrSphere(t) && !!itemOf(t) && actor.isOwner && (editing() || !!itemFlags(itemOf(t)).override),
      onClick: (e, t) => editOverride(itemOf(t)) },
    { label: "DND5E-SPHERES.PostToChat", icon: "fa-solid fa-comment",
      onClick: (e, t) => isTradition(t) ? postTraditionCard(actor) : postItemToChat(itemOf(t)) },
    { label: "DND5E-SPHERES.EditTradition", icon: "fa-solid fa-pen-ruler",
      visible: t => isTradition(t) && actor.isOwner, onClick: () => new TraditionBuilder(actor).render({ force: true }) },
    { label: "DND5E-SPHERES.Context.View", icon: "fa-solid fa-eye",
      visible: t => !editing() && !!itemOf(t), onClick: (e, t) => itemOf(t)?.sheet.render({ force: true }) },
    { label: "DND5E-SPHERES.EditItem", icon: "fa-solid fa-pen",
      visible: t => editing() && actor.isOwner && !!itemOf(t), onClick: (e, t) => itemOf(t)?.sheet.render({ force: true }) },
    { label: "DND5E-SPHERES.Context.Remove", icon: "fa-solid fa-trash",
      visible: t => editing() && actor.isOwner && !!itemOf(t) && !isTradition(t), onClick: (e, t) => removeItem(itemOf(t)) }
  ], { jQuery: false, fixed: true });
}

/** Expand and collapse accordion rows and groups. */
function activateAccordion(actor, element) {
  for ( const toggle of element.querySelectorAll("[data-spheres-toggle]") ) {
    if ( toggle.dataset.toggleBound ) continue;
    toggle.dataset.toggleBound = "true";
    toggle.addEventListener("click", event => {
      if ( event.target.closest("button, [data-spheres-action]") ) return;
      event.preventDefault();
      const node = toggle.closest("[data-collapse-key]");
      const open = !node.classList.contains("open");
      node.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      rememberState(actor, node.dataset.collapseKey, open);
    });
  }
}

/** Drag-and-drop reordering of items inside one list of the Spheres tab (edit mode only). */
function activateSorting(actor, element) {
  for ( const row of element.querySelectorAll("[data-sort-id]") ) {
    if ( row.dataset.sortBound ) continue;
    row.dataset.sortBound = "true";
    row.addEventListener("dragstart", event => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", JSON.stringify({ spheresSort: row.dataset.sortId }));
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", event => {
      event.preventDefault();
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", async event => {
      row.classList.remove("drop-target");
      let data;
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
      if ( !data?.spheresSort ) return;
      // Our own reorder drop: keep the sheet from also handling it.
      event.preventDefault();
      event.stopPropagation();
      const group = row.closest("[data-sort-group]");
      const siblingIds = [...group.querySelectorAll(":scope [data-sort-id]")]
        .filter(el => el.closest("[data-sort-group]") === group).map(el => el.dataset.sortId);
      if ( !siblingIds.includes(data.spheresSort) ) return;
      const source = actor.items.get(data.spheresSort);
      const target = actor.items.get(row.dataset.sortId);
      if ( !source || !target || (source === target) ) return;
      const siblings = siblingIds.map(id => actor.items.get(id)).filter(i => i && (i !== source));
      const updates = foundry.utils.performIntegerSort(source, { target, siblings });
      await actor.updateEmbeddedDocuments("Item", updates.map(u => ({ _id: u.target.id, sort: u.update.sort })));
    });
  }
}

/** Wire up a rendered Spheres tab. */
export function activateSpheresListeners(actor, element) {
  if ( !element ) return;
  activateSorting(actor, element);
  activateAccordion(actor, element);
  activateContextMenu(actor, element);
  for ( const el of element.querySelectorAll("[data-spheres-action]") ) {
    if ( el.dataset.spheresBound ) continue;
    el.dataset.spheresBound = "true";
    el.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const { spheresAction, spheresItemId: itemId, activityId } = el.dataset;
      const item = actor.items.get(itemId);
      switch ( spheresAction ) {
        case "cast": {
          const activity = item?.system.activities.get(activityId);
          return activity && new CastDialog(activity).render({ force: true });
        }
        case "freePicks": return item && new FreePicksDialog(item).render({ force: true });
        case "browse": return new SpheresBrowser(actor).render({ force: true });
        case "builder": return new TraditionBuilder(actor).render({ force: true });
        case "createPool": return ensureSpellPointsItem(actor);
        case "spend": return adjustPool(actor, 1);
        case "restore": return adjustPool(actor, -1);
        case "usePool": return spellPointState(actor).item?.use({ legacy: false });
      }
    });
  }
}

/* -------------------------------------------- */
/*  Default dnd5e character sheet               */
/* -------------------------------------------- */

/** Add a Spheres tab to the dnd5e character sheet. Must run during init, after the system registered its sheets. */
export function registerSheetTab() {
  const Sheet = dnd5e.applications.actor.CharacterActorSheet;
  if ( !Sheet.TABS.some(t => t.tab === "spheres") ) {
    const index = Sheet.TABS.findIndex(t => t.tab === "effects");
    Sheet.TABS.splice(index === -1 ? Sheet.TABS.length : index, 0,
      { tab: "spheres", label: "DND5E-SPHERES.Tab", icon: "fas fa-atom" });
  }

  // Insert the part next to the other tab bodies so it shares their container.
  const parts = {};
  for ( const [key, part] of Object.entries(Sheet.PARTS) ) {
    if ( key === "abilityScores" ) parts.spheres = {
      container: { classes: ["tab-body"], id: "tabs" },
      template: TEMPLATES.tab,
      templates: [TEMPLATES.content],
      scrollable: [""]
    };
    parts[key] = part;
  }
  parts.spheres ??= { container: { classes: ["tab-body"], id: "tabs" }, template: TEMPLATES.tab, scrollable: [""] };
  Sheet.PARTS = parts;

  Hooks.on("dnd5e.prepareSheetContext", (sheet, partId, context) => {
    if ( partId !== "spheres" ) return;
    context.spheres = buildSpheresContext(sheet.actor, sheet.isEditable && sheet.isEditMode);
  });

  Hooks.on("renderCharacterActorSheet", (sheet, element) => {
    const actor = sheet.actor;
    renderHeaderBox(actor, element.querySelector(".sheet-header .left"));
    activateSpheresListeners(actor, element.querySelector('.tab[data-tab="spheres"]'));
  });
}

/** Spell point summary under the class line in the sheet header. */
function renderHeaderBox(actor, anchor) {
  if ( !anchor ) return;
  anchor.querySelector(".dnd5e-spheres-header")?.remove();
  if ( !getSetting("headerBox") ) return;
  const data = computeSpheres(actor);
  const pool = spellPointState(actor);
  if ( !data.isCaster && !pool.item ) return;
  const box = document.createElement("div");
  box.classList.add("dnd5e-spheres-header");
  box.innerHTML = `
    <span class="sp" data-tooltip="${game.i18n.localize("DND5E-SPHERES.SpellPoints")}">
      <i class="fas fa-atom" inert></i> ${pool.value} / ${pool.item ? pool.max : data.max}
      <span class="label">${game.i18n.localize("DND5E-SPHERES.SP")}</span>
    </span>
    <span class="dc" data-tooltip="${game.i18n.localize("DND5E-SPHERES.SphereDC")}">
      ${game.i18n.localize("DND5E-SPHERES.DC")} ${data.dc}
    </span>`;
  anchor.append(box);
}

/* -------------------------------------------- */
/*  Tidy 5e Sheets                              */
/* -------------------------------------------- */

/** Register the Spheres tab with Tidy 5e Sheets, reusing the same content template. */
export function registerTidy(api) {
  const actorOf = context => context?.actor ?? context?.document;
  api.registerCharacterTab(new api.models.HandlebarsTab({
    title: () => game.i18n.localize("DND5E-SPHERES.Tab"),
    tabId: `${MODULE_ID}-spheres`,
    iconClass: "fa-solid fa-atom",
    path: TEMPLATES.content,
    tabContentsClasses: ["dnd5e-spheres-tidy"],
    getData: context => {
      const actor = actorOf(context);
      // Tidy's lock toggle: unlocked means edit mode.
      const unlocked = context.unlocked ?? context.editable ?? false;
      return { spheres: buildSpheresContext(actor, actor.isOwner && (unlocked === true)) };
    },
    onRender: params => activateSpheresListeners(actorOf(params.data) ?? params.app.actor, params.tabContentsElement)
  }));
}
