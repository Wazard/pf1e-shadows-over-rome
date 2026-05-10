// PF1e Buff Auto Remover
// Versione: v0.2-aggressive-cleanup
//
// Responsabilità:
// - cancellare ogni buff inattivo;
// - non applica buff;
// - non gestisce delayed effects;
// - non modifica buff attivi.
//
// Se vuoi proteggere un buff:
// flags.pf1e-shadows-over-rome.noAutoRemove = true

const BAR_MODULE_ID = "pf1e-buff-auto-remover";
const BAR_VERSION = "v0.2-aggressive-cleanup";

const BAR_FLAG_SCOPE = "pf1e-shadows-over-rome";
const BAR_NO_AUTO_REMOVE_FLAG = "noAutoRemove";

const BAR_DELETE_INACTIVE_ON_READY = false;
const BAR_INTERVAL_MS = 2000;

const BAR_DELETE_LOCKS = new Set();

Hooks.once("ready", () => {
  console.log(`${BAR_MODULE_ID} | Ready | ${BAR_VERSION}`);

  if (BAR_DELETE_INACTIVE_ON_READY) {
    barCleanupAllInactiveBuffs();
  }

  setInterval(() => {
    barCleanupAllInactiveBuffs();
  }, BAR_INTERVAL_MS);
});

async function barCleanupAllInactiveBuffs() {
  for (const actor of game.actors ?? []) {
    await barCleanupInactiveBuffsOnActor(actor);
  }
}

async function barCleanupInactiveBuffsOnActor(actor) {
  if (!actor) return;

  const idsToDelete = [];

  for (const item of Array.from(actor.items ?? [])) {
    if (!barIsRemovableBuff(item)) continue;
    if (!barIsBuffInactive(item)) continue;

    idsToDelete.push(item.id);
  }

  if (!idsToDelete.length) return;

  const uniqueIds = [...new Set(idsToDelete)].filter(id => actor.items.get(id));

  if (!uniqueIds.length) return;

  const lockKey = `${actor.id}.${uniqueIds.sort().join(".")}`;

  if (BAR_DELETE_LOCKS.has(lockKey)) return;

  BAR_DELETE_LOCKS.add(lockKey);

  try {
    const stillExistingIds = uniqueIds.filter(id => {
      const item = actor.items.get(id);
      return item && barIsRemovableBuff(item) && barIsBuffInactive(item);
    });

    if (!stillExistingIds.length) return;

    console.log(
      `${BAR_MODULE_ID} | Deleting inactive buffs | ${actor.name}`,
      stillExistingIds.map(id => actor.items.get(id)?.name)
    );

    await actor.deleteEmbeddedDocuments("Item", stillExistingIds);
  } catch (err) {
    console.error(`${BAR_MODULE_ID} | Errore cancellando buff inattivi su ${actor.name}`, err);
  } finally {
    BAR_DELETE_LOCKS.delete(lockKey);
  }
}

function barIsRemovableBuff(item) {
  if (!item) return false;
  if (item.type !== "buff") return false;
  if (!item.actor) return false;
  if (!item.id) return false;

  if (item.getFlag(BAR_FLAG_SCOPE, BAR_NO_AUTO_REMOVE_FLAG) === true) {
    return false;
  }

  return true;
}

function barIsBuffInactive(buff) {
  const active = foundry.utils.getProperty(buff, "system.active");
  if (active !== undefined) return active === false;

  const disabled = foundry.utils.getProperty(buff, "system.disabled");
  if (disabled !== undefined) return disabled === true;

  const enabled = foundry.utils.getProperty(buff, "system.enabled");
  if (enabled !== undefined) return enabled === false;

  return false;
}