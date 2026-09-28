import { MODULE_ID, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { SpheresBrowser } from "./browser.mjs";
import { CastDialog } from "./cast.mjs";
import { postItemToChat, postTraditionCard } from "./chat.mjs";
import { computeSpheres, computeTalents, drawbackWeight, isFeatureType, itemFlags, spellPointState } from "./spell-points.mjs";
import { ensureSpellPointsItem } from "./tradition.mjs";
import { TraditionBuilder } from "./tradition-builder.mjs";

const MAX_PIPS = 40;

const itemEntry = item => ({
  id: item.id, uuid: item.uuid, name: item.name, img: item.img,
  weight: isFeatureType(item, "drawback") ? drawbackWeight(item) : null,
  count: itemFlags(item).count ?? 1,
  automated: !!itemFlags(item).automated
});

const bySort = (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name);

/**
 * Data shared by the default sheet and Tidy templates.
 * @param {Actor5e} actor
 * @param {boolean} editable  Whether the sheet is in edit mode (shows edit, delete and reorder controls).
 */
export function buildSpheresContext(actor, editable) {
  const data = computeSpheres(actor);
  const pool = spellPointState(actor);
  const byType = type => actor.items.filter(i => isFeatureType(i, type))
    .sort((a, b) => a.sort - b.sort).map(itemEntry);
  const tradition = actor.items.find(i => isFeatureType(i, "castingTradition"));
  const pips = pool.max <= MAX_PIPS
    ? Array.fromRange(pool.max).map(n => ({ spent: n >= pool.value })) : [];

  // Spheres with their abilities and the talents that belong to them.
  const talentData = computeTalents(actor);
  const talentItems = actor.items.filter(i => isFeatureType(i, "talent"));
  const sphereOf = item => itemFlags(item).sphere ?? item.system.type?.subtype ?? item.system.identifier;
  const talentEntry = t => ({
    ...itemEntry(t), advanced: !!itemFlags(t).advanced, free: talentData.isFree(t),
    category: itemFlags(t).category, cost: itemFlags(t).cost
  });
  const sphereList = actor.items.filter(i => isFeatureType(i, "sphere")).sort(bySort)
    .map(sphere => {
      const key = sphereOf(sphere);
      const abilities = Object.entries(itemFlags(sphere).abilities ?? {}).filter(([, m]) => !m.hidden)
        .map(([activityId, m]) => ({ activityId, name: m.name, cost: m.cost }));
      return {
        ...itemEntry(sphere), key, abilities,
        talents: talentItems.filter(t => sphereOf(t) === key).sort(bySort).map(talentEntry)
      };
    });
  const ownedKeys = new Set(sphereList.map(s => s.key));
  const orphanTalents = talentItems.filter(t => !ownedKeys.has(sphereOf(t))).map(talentEntry);

  return {
    ...data,
    editable,
    owner: actor.isOwner,
    kamLabel: data.kam ? CONFIG.DND5E.abilities[data.kam]?.label : null,
    pool: { exists: !!pool.item, id: pool.item?.id, value: pool.value, max: pool.max, spent: pool.spent,
      pct: pool.max ? Math.round((pool.value / pool.max) * 100) : 0 },
    pips,
    tradition: tradition ? itemEntry(tradition) : null,
    drawbacks: byType("drawback"),
    boons: byType("boon"),
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

async function deleteItem(item) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("DND5E-SPHERES.DeleteTitle", { name: item.name }) },
    content: `<p>${game.i18n.format("DND5E-SPHERES.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`
  });
  if ( confirmed ) await item.delete();
}

/** Drag-and-drop reordering of items inside one list of the Spheres tab. */
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

/** Wire up buttons inside a rendered Spheres tab or header box. */
export function activateSpheresListeners(actor, element) {
  if ( !element ) return;
  activateSorting(actor, element);
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
        case "browse": return new SpheresBrowser(actor).render({ force: true });
        case "chat": return item && postItemToChat(item);
        case "traditionChat": return postTraditionCard(actor);
        case "edit": return item?.sheet.render({ force: true });
        case "delete": return item && deleteItem(item);
        case "builder": return new TraditionBuilder(actor).render({ force: true });
        case "createPool": return ensureSpellPointsItem(actor);
        case "spend": return adjustPool(actor, 1);
        case "restore": return adjustPool(actor, -1);
        case "usePool": return spellPointState(actor).item?.use({ legacy: false });
        case "openItem": return item?.sheet.render({ force: true });
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
