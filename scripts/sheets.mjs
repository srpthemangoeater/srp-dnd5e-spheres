import { MODULE_ID, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { computeSpheres, drawbackWeight, isFeatureType, itemFlags, spellPointState } from "./spell-points.mjs";
import { ensureSpellPointsItem } from "./tradition.mjs";
import { TraditionBuilder } from "./tradition-builder.mjs";

const MAX_PIPS = 40;

const itemEntry = item => ({
  id: item.id, uuid: item.uuid, name: item.name, img: item.img,
  weight: isFeatureType(item, "drawback") ? drawbackWeight(item) : null,
  count: itemFlags(item).count ?? 1,
  automated: !!itemFlags(item).automated
});

/**
 * Data shared by the default sheet and Tidy templates.
 * @param {Actor5e} actor
 * @param {boolean} editable
 */
export function buildSpheresContext(actor, editable) {
  const data = computeSpheres(actor);
  const pool = spellPointState(actor);
  const byType = type => actor.items.filter(i => isFeatureType(i, type))
    .sort((a, b) => a.sort - b.sort).map(itemEntry);
  const tradition = actor.items.find(i => isFeatureType(i, "castingTradition"));
  const pips = pool.max <= MAX_PIPS
    ? Array.fromRange(pool.max).map(n => ({ spent: n >= pool.value })) : [];
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
    spheres: byType("sphere"),
    talents: byType("talent")
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

/** Wire up buttons inside a rendered Spheres tab or header box. */
export function activateSpheresListeners(actor, element) {
  if ( !element ) return;
  for ( const el of element.querySelectorAll("[data-spheres-action]") ) {
    if ( el.dataset.spheresBound ) continue;
    el.dataset.spheresBound = "true";
    el.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const { spheresAction, itemId } = el.dataset;
      switch ( spheresAction ) {
        case "builder": return new TraditionBuilder(actor).render({ force: true });
        case "createPool": return ensureSpellPointsItem(actor);
        case "spend": return adjustPool(actor, 1);
        case "restore": return adjustPool(actor, -1);
        case "usePool": return spellPointState(actor).item?.use({ legacy: false });
        case "openItem": return actor.items.get(itemId)?.sheet.render({ force: true });
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
    context.spheres = buildSpheresContext(sheet.actor, sheet.isEditable);
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
      return { spheres: buildSpheresContext(actor, !!context.editable || actor.isOwner) };
    },
    onRender: params => activateSpheresListeners(actorOf(params.data) ?? params.app.actor, params.tabContentsElement)
  }));
}
