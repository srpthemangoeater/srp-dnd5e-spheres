import { MODULE_ID } from "./constants.mjs";
import { drawbackRows, resolveDrawback } from "./drawbacks.mjs";
import { getSetting } from "./settings.mjs";
import { computeSpheres, isFeatureType, itemFlags } from "./spell-points.mjs";

const escape = s => foundry.utils.escapeHTML(String(s ?? ""));
const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/** Short description of the actor's casting tradition for chat cards. */
export function traditionInfo(actor) {
  const data = computeSpheres(actor);
  const tradition = actor.items.find(i => isFeatureType(i, "castingTradition"));
  return {
    name: tradition?.name ?? null,
    kam: data.kam ? CONFIG.DND5E.abilities[data.kam]?.label ?? data.kam : null,
    dc: data.dc,
    attack: data.attack
  };
}

/**
 * Flags describing a sphere effect for its chat card.
 * @param {Actor5e} actor
 * @param {object} [cast]  Cast details from the cast dialog.
 */
export function cardFlags(actor, cast=null) {
  return {
    actorUuid: actor.uuid,
    tradition: traditionInfo(actor),
    drawbacks: getSetting("drawbackReminders") ? drawbackRows(actor) : [],
    ...(cast ? { cast } : {})
  };
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/** Sections the user opened on each message, kept across re-renders (e.g. after resolving a drawback). */
const OPEN_SECTIONS = new Map();

/** A collapsible section: the summary line stays visible, the body opens on click. */
const section = (key, summary, body, { open=false, classes="" }={}) =>
  `<details class="sc-block ${classes}" data-section="${key}" ${open ? "open" : ""}>`
  + `<summary><i class="fas fa-chevron-right sc-chevron" inert></i>${summary}</summary>`
  + `<div class="sc-body">${body}</div></details>`;

/** One talent or augment: name and badges, with its text in a nested collapsible. */
const detailItem = (name, meta, cost, text) => {
  const head = `<strong>${escape(name)}</strong>${meta ? ` <span class="sc-meta">${escape(meta)}</span>` : ""}`
    + `${cost ? ` <span class="sc-cost">${cost} SP</span>` : ""}`;
  return text ? `<details class="sc-item"><summary>${head}</summary><div class="sc-text">${escape(text)}</div></details>`
    : `<div class="sc-item plain">${head}</div>`;
};

function renderCard(flags, { canResolve, openSections }) {
  const { tradition, cast, sp, drawbacks = [], resolved = {}, preview } = flags;
  const parts = [];
  const wasOpen = (key, fallback) => openSections?.has(key) ? openSections.get(key) : fallback;

  // Summary line: tradition on the left, spell points on the right. Always visible.
  const traditionText = tradition?.name ? `<i class="fas fa-atom" inert></i> ${escape(tradition.name)}`
    + `${tradition.kam ? ` <span class="sc-meta">${escape(tradition.kam)} &middot; ${localize("DND5E-SPHERES.DC")} ${tradition.dc}</span>` : ""}` : "";
  let spText = "";
  if ( sp ) spText = format("DND5E-SPHERES.Chat.SpentShort", sp);
  else if ( cast ) spText = format(preview ? "DND5E-SPHERES.Chat.PlannedShort" : "DND5E-SPHERES.Chat.Spent0Short", { total: cast.total ?? 0 });
  if ( traditionText || spText ) {
    parts.push(`<div class="sc-topline"><span class="sc-tradition">${traditionText}</span>${spText ? `<span class="sc-sp">${spText}</span>` : ""}</div>`);
  }

  if ( cast ) {
    // The ability: one line with its result; its rules text folds away.
    const damage = cast.formula ? ` <span class="sc-formula">${escape(cast.formula)}${cast.damageType
      ? ` ${escape(CONFIG.DND5E.damageTypes[cast.damageType]?.label ?? cast.damageType)}` : ""}</span>` : "";
    const title = `<span class="sc-title"><strong>${escape(cast.ability)}</strong>${damage}</span>`;
    parts.push(cast.summary ? section("ability", title, `<div class="sc-text">${escape(cast.summary)}</div>`, { open: wasOpen("ability", false) })
      : `<div class="sc-block static">${title}</div>`);

    // Talents and augments: names in the summary, full text inside.
    const talents = cast.details ?? [];
    if ( talents.length ) {
      parts.push(section("talents",
        `${localize("DND5E-SPHERES.Chat.Talents")} <span class="sc-names">${talents.map(t => escape(t.name)).join(", ")}</span>`,
        talents.map(t => detailItem(t.name, t.category, t.cost, t.summary)).join(""), { open: wasOpen("talents", false) }));
    }
    const augments = cast.augmentDetails ?? [];
    if ( augments.length ) {
      parts.push(section("augments",
        `${localize("DND5E-SPHERES.Chat.Augments")} <span class="sc-names">${augments.map(a => escape(a.label)).join(", ")}</span>`,
        augments.map(a => detailItem(a.label, "", a.cost, a.summary)).join(""), { open: wasOpen("augments", false) }));
    }
  }

  // Drawbacks: the summary counts what still needs resolving; rows inside with Show / Resolve.
  if ( drawbacks.length ) {
    const pending = preview ? 0 : drawbacks.filter(d => !resolved[d.key]).length;
    const pendingAutomated = preview ? 0 : drawbacks.filter(d => d.automated && !resolved[d.key]).length;
    const rows = drawbacks.map(d => {
      const result = resolved[d.key];
      const details = [d.summary, d.reminder].filter(_ => _).map(t => `<p>${escape(t)}</p>`).join("");
      return `<div class="sc-drawback ${result ? "resolved" : ""} ${d.automated ? "automated" : ""}" data-key="${escape(d.key)}">
        <div class="sc-row">
          <span class="sc-name">${result ? '<i class="fas fa-check" inert></i> ' : d.automated ? '<i class="fas fa-bolt" inert></i> ' : ""}${escape(d.name)}</span>
          <button type="button" class="sc-button" data-sc-action="show">${localize("DND5E-SPHERES.Chat.Show")}</button>
          ${preview ? "" : `<button type="button" class="sc-button" data-sc-action="resolve" ${result || !canResolve ? "disabled" : ""}>
            ${localize(result ? "DND5E-SPHERES.Chat.Resolved" : "DND5E-SPHERES.Chat.Resolve")}</button>`}
        </div>
        <div class="sc-details">${details}${result ? `<p class="sc-result">${escape(result)}</p>` : ""}</div>
      </div>`;
    });
    const status = pending
      ? `<span class="sc-pending">${format("DND5E-SPHERES.Chat.ToResolve", { count: pending })}</span>`
      : preview ? "" : `<span class="sc-done"><i class="fas fa-check" inert></i> ${localize("DND5E-SPHERES.Chat.AllResolved")}</span>`;
    // Closed by default; the summary says how many still need resolving (and flags ones with a real effect).
    const effects = pendingAutomated ? ` <span class="sc-pending-auto" data-tooltip="${localize("DND5E-SPHERES.Chat.HasEffects")}">`
      + `<i class="fas fa-bolt" inert></i> ${pendingAutomated}</span>` : "";
    parts.push(section("drawbacks", `${localize("DND5E-SPHERES.Chat.Drawbacks")} <span class="sc-count">${drawbacks.length}</span>${effects} ${status}`,
      rows.join(""), { open: wasOpen("drawbacks", false), classes: "sc-drawbacks" }));
  }
  return parts.join("");
}

/** Add the spheres block to a chat message: after the dnd5e card header, or at the top of plain messages. */
function onRenderChatMessage(message, html) {
  const flags = message.flags?.[MODULE_ID];
  if ( !flags || (!flags.cast && !flags.sp && !flags.drawbacks) || html.querySelector(".dnd5e-spheres-card") ) return;
  const actor = flags.actorUuid ? fromUuidSync(flags.actorUuid) : ChatMessage.getSpeakerActor(message.speaker);
  const canResolve = !!actor?.isOwner && message.canUserModify(game.user, "update");
  const openSections = OPEN_SECTIONS.get(message.id);
  const block = document.createElement("div");
  block.classList.add("dnd5e-spheres-card");
  block.innerHTML = renderCard(flags, { canResolve, openSections });
  const header = html.querySelector(".card-header");
  if ( header ) header.after(block);
  else (html.querySelector(".message-content") ?? html).prepend(block);

  // The sphere's own description repeats every ability; keep it folded on sphere cards.
  if ( flags.cast ) {
    html.querySelectorAll(".card-description.collapsible, .description.collapsible").forEach(el => el.classList.add("collapsed"));
  }

  block.addEventListener("toggle", event => {
    const details = event.target.closest?.("details[data-section]");
    if ( !details || (details !== event.target) ) return;
    if ( !OPEN_SECTIONS.has(message.id) ) OPEN_SECTIONS.set(message.id, new Map());
    OPEN_SECTIONS.get(message.id).set(details.dataset.section, details.open);
  }, true);

  block.addEventListener("click", async event => {
    const button = event.target.closest("[data-sc-action]");
    if ( !button ) return;
    event.preventDefault();
    event.stopPropagation();
    const row = button.closest(".sc-drawback");
    if ( button.dataset.scAction === "show" ) return row.classList.toggle("expanded");
    if ( button.dataset.scAction === "resolve" ) {
      button.disabled = true;
      await resolveRow(message, row.dataset.key);
    }
  });
}

/** Resolve one drawback row of a message and record the result on the message. */
export async function resolveRow(message, key) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const row = flags.drawbacks?.find(d => d.key === key);
  const actor = flags.actorUuid ? await fromUuid(flags.actorUuid) : ChatMessage.getSpeakerActor(message.speaker);
  if ( !row || !actor || flags.resolved?.[key] ) return;
  const spent = flags.sp?.spent ?? 0;
  const result = await resolveDrawback(actor, row, spent);
  if ( result === null ) return;
  await message.setFlag(MODULE_ID, `resolved.${key}`, result);
}

/** Resolve the automated drawbacks right away when the world setting asks for it. */
export async function autoResolve(message) {
  if ( !message || !getSetting("autoResolveDrawbacks") ) return;
  for ( const row of message.flags?.[MODULE_ID]?.drawbacks ?? [] ) {
    if ( row.automated ) await resolveRow(message, row.key);
  }
}

/* -------------------------------------------- */
/*  Posting to chat                             */
/* -------------------------------------------- */

/** Post an item's card (sphere, talent, drawback, boon) to chat. */
export async function postItemToChat(item) {
  if ( isFeatureType(item, "castingTradition") ) return postTraditionCard(item.actor);
  return item.displayCard();
}

/** Post a summary of the actor's casting tradition. */
export async function postTraditionCard(actor) {
  const info = traditionInfo(actor);
  const data = computeSpheres(actor);
  const list = type => actor.items.filter(i => isFeatureType(i, type))
    .map(i => `${escape(i.name)}${(itemFlags(i).count ?? 1) > 1 ? " (x2)" : ""}`).join(", ") || "&mdash;";
  const content = `<div class="dnd5e-spheres-tradition-card">
    <h3><i class="fas fa-atom" inert></i> ${escape(info.name ?? localize("DND5E-SPHERES.NoTradition"))}</h3>
    <p><strong>${localize("DND5E-SPHERES.KeyAbility")}:</strong> ${escape(info.kam ?? "&mdash;")}
      &middot; ${localize("DND5E-SPHERES.SphereDC")} ${info.dc} &middot; ${localize("DND5E-SPHERES.Attack")} +${info.attack}</p>
    <p><strong>${localize("DND5E-SPHERES.FeatureType.drawback")}:</strong> ${list("drawback")}</p>
    <p><strong>${localize("DND5E-SPHERES.FeatureType.boon")}:</strong> ${list("boon")}</p>
    <p><strong>${localize("DND5E-SPHERES.SpellPoints")}:</strong> ${data.max}
      (${format("DND5E-SPHERES.Breakdown", { class: data.classSP, kam: data.kamMod, tradition: data.traditionBonus, manual: data.manual })})</p>
  </div>`;
  return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content });
}

/** Post the cast dialog's current choices without casting. */
export async function postCastPreview(actor, cast) {
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: '<div class="dnd5e-spheres-preview"></div>',
    flags: { [MODULE_ID]: { ...cardFlags(actor, cast), preview: true } }
  });
}

export function registerChatHooks() {
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
}
