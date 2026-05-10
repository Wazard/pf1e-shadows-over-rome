// Shadows Over Rome — Agitazione Sociale Ritardata
// Versione PLAYER: applica l'effetto direttamente al personaggio assegnato al player.
// Non serve selezionare token.
// Parte dopo 10 minuti in-game.
// Dura 1 ora in-game.
// Modifica direttamente i rank di Bluff e Diplomacy tramite Active Effect.

const EFFECT_NAME = "Agitazione Sociale";
const EFFECT_ICON = "icons/svg/daze.svg";

const START_DELAY_SECONDS = 10 * 60; // 10 minuti in-game
const DURATION_SECONDS = 60 * 60;    // 1 ora in-game
const PENALTY = -2;

const FLAG_SCOPE = "world";
const FLAG_KEY = "sorAgitazioneSocialePlayer_v1";

const actor = game.user.character;

if (!actor) {
  ui.notifications.error("Non hai un personaggio assegnato. Vai su User Configuration e assegna il tuo Character.");
  return;
}

async function removeOldEffect(actor) {
  const oldEffects = actor.effects.filter(e => e.name === EFFECT_NAME);
  for (const effect of oldEffects) {
    await effect.delete();
  }
}

async function applyPenalty(actor, startTime, endTime) {
  await removeOldEffect(actor);

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: EFFECT_NAME,
      img: EFFECT_ICON,
      origin: actor.uuid,
      disabled: false,
      duration: {
        seconds: DURATION_SECONDS,
        startTime
      },
      changes: [
        {
          key: "system.skills.blf.rank",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(PENALTY),
          priority: 20
        },
        {
          key: "system.skills.dip.rank",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(PENALTY),
          priority: 20
        }
      ],
      description: "Agitazione sociale: -2 ai tiri di Bluff e Diplomacy per 1 ora."
    }
  ]);

  await actor.setFlag(FLAG_SCOPE, FLAG_KEY, {
    active: true,
    startTime,
    endTime
  });

  ui.notifications.warn(`${EFFECT_NAME} attiva: -2 a Bluff e Diplomacy per 1 ora.`);
}

async function checkScheduledPenalty() {
  const actor = game.user.character;
  if (!actor) return;

  const data = actor.getFlag(FLAG_SCOPE, FLAG_KEY);
  if (!data) return;

  const now = game.time.worldTime;

  // Se non è ancora attivo e il tempo è arrivato, applica l'effetto.
  if (!data.active && now >= data.startTime) {
    await applyPenalty(actor, data.startTime, data.endTime);
    return;
  }

  // Se è attivo ma scaduto, rimuove effetto e flag.
  if (data.active && now >= data.endTime) {
    await removeOldEffect(actor);
    await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
    ui.notifications.info(`${EFFECT_NAME} terminata.`);
  }
}

// Rimuove eventuale vecchio hook di questa macro sul client del player.
if (globalThis.SOR_AGITAZIONE_SOCIALE_PLAYER_HOOK) {
  Hooks.off("updateWorldTime", globalThis.SOR_AGITAZIONE_SOCIALE_PLAYER_HOOK);
  delete globalThis.SOR_AGITAZIONE_SOCIALE_PLAYER_HOOK;
}

// Installa watcher sul tempo in-game.
globalThis.SOR_AGITAZIONE_SOCIALE_PLAYER_HOOK = Hooks.on("updateWorldTime", async () => {
  await checkScheduledPenalty();
});

console.log("Shadows Over Rome | Agitazione Sociale player watcher attivo.");

// Programma il malus sull'actor del player.
const now = game.time.worldTime;
const startTime = now + START_DELAY_SECONDS;
const endTime = startTime + DURATION_SECONDS;

await removeOldEffect(actor);

await actor.setFlag(FLAG_SCOPE, FLAG_KEY, {
  active: false,
  startTime,
  endTime
});

ui.notifications.info("Agitazione Sociale programmata: partirà tra 10 minuti in-game e durerà 1 ora.");

ChatMessage.create({
  content: `<strong>${actor.name}</strong>: <em>${EFFECT_NAME}</em> partirà tra 10 minuti in-game e durerà 1 ora.`,
  speaker: ChatMessage.getSpeaker({ actor })
});

// Controllo immediato, nel caso il tempo sia già stato avanzato.
await checkScheduledPenalty();