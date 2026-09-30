import { MODULE_ID } from "./constants.mjs";

const CHANNEL = `module.${MODULE_ID}`;

/**
 * Let players apply effects to documents they do not own (a monster, or its weapon): the active GM creates them.
 * Must be registered once the game is ready.
 */
export function registerSocket() {
  game.socket.on(CHANNEL, async request => {
    if ( request?.action === "effectsCreated" ) {
      if ( request.to !== game.user.id ) return;
      if ( request.count ) ui.notifications.info(game.i18n.format("DND5E-SPHERES.Chat.EffectAppliedByGM", { name: request.name, count: request.count }));
      if ( request.failed ) ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Chat.EffectFailed", { count: request.failed }));
      return;
    }
    if ( (request?.action !== "createEffects") || !game.user.isActiveGM ) return;
    let count = 0;
    let failed = 0;
    for ( const { parent, data } of request.effects ?? [] ) {
      try {
        const doc = await fromUuid(parent);
        if ( !doc ) { failed++; continue; }
        await doc.createEmbeddedDocuments("ActiveEffect", [data], { keepOrigin: true });
        count++;
      } catch(err) {
        console.error(`${MODULE_ID} | Could not apply an effect for ${request.from}`, err);
        failed++;
      }
    }
    game.socket.emit(CHANNEL, { action: "effectsCreated", to: request.from, name: request.name, count, failed });
  });
}

/**
 * Create Active Effects on actors or items: directly on documents the user owns, through the active GM otherwise.
 * @param {{parent: Actor5e|Item5e, data: object}[]} entries
 * @param {string} name  Effect name, for notifications.
 * @returns {{applied: number, sent: number, blocked: number}}
 */
export async function createEffects(entries, name) {
  const own = entries.filter(e => e.parent.isOwner);
  const others = entries.filter(e => !e.parent.isOwner);
  for ( const { parent, data } of own ) await parent.createEmbeddedDocuments("ActiveEffect", [data], { keepOrigin: true });
  if ( !others.length ) return { applied: own.length, sent: 0, blocked: 0 };
  if ( !game.users.activeGM ) {
    ui.notifications.warn(game.i18n.format("DND5E-SPHERES.Chat.NoGM", { names: others.map(e => e.parent.name).join(", ") }));
    return { applied: own.length, sent: 0, blocked: others.length };
  }
  game.socket.emit(CHANNEL, {
    action: "createEffects", from: game.user.id, name,
    effects: others.map(({ parent, data }) => ({ parent: parent.uuid, data }))
  });
  return { applied: own.length, sent: others.length, blocked: 0 };
}
