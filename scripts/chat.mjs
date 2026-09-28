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

function renderCard(flags, { canResolve }) {
  const { tradition, cast, sp, drawbacks = [], resolved = {}, preview } = flags;
  const parts = [];

  // 1. Casting tradition announcement.
  if ( tradition?.name ) {
    parts.push(`<div class="sc-tradition"><i class="fas fa-atom" inert></i> ${format("DND5E-SPHERES.Chat.Through", {
      tradition: `<strong>${escape(tradition.name)}</strong>`
    })}${tradition.kam ? ` <span class="sc-meta">${escape(tradition.kam)} &middot; ${localize("DND5E-SPHERES.DC")} ${tradition.dc}</span>` : ""}</div>`);
  }

  // 2. The sphere ability.
  if ( cast ) {
    parts.push(`<div class="sc-ability"><div class="sc-title">${escape(cast.sphere ? `${cast.sphere}: ` : "")}<strong>${escape(cast.ability)}</strong>`
      + `${cast.formula ? ` <span class="sc-meta">${escape(cast.formula)}${cast.damageType ? ` ${escape(CONFIG.DND5E.damageTypes[cast.damageType]?.label ?? cast.damageType)}` : ""}</span>` : ""}</div>`
      + `${cast.summary ? `<div class="sc-text">${escape(cast.summary)}</div>` : ""}</div>`);

    // 3. Talents and augments with their full descriptions.
    const talents = (cast.details ?? []).map(t => `<li><strong>${escape(t.name)}</strong>`
      + `${t.category ? ` <span class="sc-meta">${escape(t.category)}</span>` : ""}`
      + `${t.cost ? ` <span class="sc-cost">${t.cost} SP</span>` : ""}`
      + `${t.summary ? `<div class="sc-text">${escape(t.summary)}</div>` : ""}</li>`);
    const augments = (cast.augmentDetails ?? []).map(a => `<li><strong>${escape(a.label)}</strong>`
      + ` <span class="sc-cost">${a.cost} SP</span>${a.summary ? `<div class="sc-text">${escape(a.summary)}</div>` : ""}</li>`);
    if ( talents.length ) parts.push(`<div class="sc-section"><h4>${localize("DND5E-SPHERES.Chat.Talents")}</h4><ul>${talents.join("")}</ul></div>`);
    if ( augments.length ) parts.push(`<div class="sc-section"><h4>${localize("DND5E-SPHERES.Chat.Augments")}</h4><ul>${augments.join("")}</ul></div>`);
  }

  // Spell points.
  if ( sp ) parts.push(`<div class="sc-sp"><i class="fas fa-atom" inert></i> ${format("DND5E-SPHERES.Chat.Spent", sp)}</div>`);
  else if ( cast ) parts.push(`<div class="sc-sp">${format(preview ? "DND5E-SPHERES.Chat.Planned" : "DND5E-SPHERES.Chat.Spent0", { total: cast.total ?? 0 })}</div>`);

  // 4. Drawbacks, one row each with Show and Resolve.
  if ( drawbacks.length ) {
    const rows = drawbacks.map(d => {
      const result = resolved[d.key];
      const details = [d.summary, d.reminder].filter(_ => _).map(t => `<p>${escape(t)}</p>`).join("");
      return `<div class="sc-drawback ${result ? "resolved" : ""}" data-key="${escape(d.key)}">
        <div class="sc-row">
          <span class="sc-name">${result ? '<i class="fas fa-check" inert></i> ' : ""}${escape(d.name)}</span>
          <button type="button" class="sc-button" data-sc-action="show">${localize("DND5E-SPHERES.Chat.Show")}</button>
          ${preview ? "" : `<button type="button" class="sc-button" data-sc-action="resolve" ${result || !canResolve ? "disabled" : ""}>
            ${localize(result ? "DND5E-SPHERES.Chat.Resolved" : "DND5E-SPHERES.Chat.Resolve")}</button>`}
        </div>
        <div class="sc-details">${details}${result ? `<p class="sc-result">${escape(result)}</p>` : ""}</div>
      </div>`;
    });
    parts.push(`<div class="sc-section sc-drawbacks"><h4>${localize("DND5E-SPHERES.Chat.Drawbacks")}</h4>${rows.join("")}</div>`);
  }
  return parts.join("");
}

/** Add the spheres block to a chat message: after the dnd5e card header, or at the top of plain messages. */
function onRenderChatMessage(message, html) {
  const flags = message.flags?.[MODULE_ID];
  if ( !flags || (!flags.cast && !flags.sp && !flags.drawbacks) || html.querySelector(".dnd5e-spheres-card") ) return;
  const actor = flags.actorUuid ? fromUuidSync(flags.actorUuid) : ChatMessage.getSpeakerActor(message.speaker);
  const canResolve = !!actor?.isOwner && message.canUserModify(game.user, "update");
  const block = document.createElement("div");
  block.classList.add("dnd5e-spheres-card");
  block.innerHTML = renderCard(flags, { canResolve });
  const header = html.querySelector(".card-header");
  if ( header ) header.after(block);
  else (html.querySelector(".message-content") ?? html).prepend(block);

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
