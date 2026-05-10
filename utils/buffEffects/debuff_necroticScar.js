const FLAG_SCOPE = "pf1e-shadows-over-rome";
const ACTIVE_FLAG = "chargeBuffActive";

const SAVE_TYPE = "fort"; // "fort", "ref", or "will"

const sourceItem =
  typeof item !== "undefined" ? item :
  typeof shared !== "undefined" ? shared?.item :
  null;

const sourceActor =
  sourceItem?.actor ??
  (typeof actor !== "undefined" ? actor : null);

if (!sourceActor || !sourceItem) return;

function gmUserIds() {
  return game.users.filter(user => user.isGM).map(user => user.id);
}

function ownerUserIds(actor) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;

  const users = Object.entries(actor.ownership ?? {})
    .filter(([userId, level]) => userId !== "default" && Number(level) >= OWNER)
    .map(([userId]) => userId);

  return users.length ? users : gmUserIds();
}

function saveBonus(actor, saveType) {
  const saves = actor.system?.attributes?.savingThrows ?? {};

  return Number(
    saves?.[saveType]?.total ??
    saves?.[saveType]?.mod ??
    0
  );
}

function painMessage(charges) {
  if (charges >= 20) {
    return "Your scars split open in a silent pattern of light. For one terrible instant, you understand that there is nothing left to pay with.";
  }

  if (charges >= 18) {
    return "Your scars twist inward, deeper than flesh. The pain is no longer warning you. It is claiming something from you.";
  }

  if (charges >= 15) {
    return "Your scars burn cold beneath your skin. The pain passes, but something vital goes with it.";
  }

  if (charges >= 14) {
    return "Your pain becomes unbearable. You cannot keep doing this. Somewhere beneath the agony, you feel a simple truth: the next time may kill you.";
  }

  if (charges >= 10) {
    return "Your scars twist and contract violently, sending excruciating pain through your body.";
  }

  if (charges >= 6) {
    return "Your scars tighten beneath your skin, causing a deep, moderate pain that lingers after the magic fades.";
  }

  return "Your scars twist and contract beneath your skin, causing you mild pain.";
}

function scaledDamage(actor, charges) {
  const maxHp = Math.max(1, Number(actor.system?.attributes?.hp?.max ?? 1));

  const START_CHARGE = 3;
  const MAX_CHARGE = 15;
  const CURVE = 0.23;

  const progress = Math.max(0, charges - START_CHARGE + 1);
  const maxProgress = MAX_CHARGE - START_CHARGE + 1;

  const ratio =
    (Math.exp(CURVE * progress) - 1) /
    (Math.exp(CURVE * maxProgress) - 1);

  return Math.min(maxHp, Math.max(1, Math.ceil(maxHp * ratio)));
}

async function addNonlethalDamage(actor, amount) {
  const path = "system.attributes.hp.nonlethal";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);

  await actor.update({
    [path]: current + amount
  });
}

async function addNegativeLevels(actor, amount) {
  const path = "system.attributes.energyDrain";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);

  await actor.update({
    [path]: current + amount
  });
}

async function killActor(actor) {
  await actor.setCondition?.("dead", true).catch(() => {});

  await actor.update({
    "system.attributes.hp.value": 0
  }).catch(() => {});
}

async function whisperOwner(actor, content) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: ownerUserIds(actor),
    content
  });
}

const alreadyActive = sourceItem.getFlag(FLAG_SCOPE, ACTIVE_FLAG) === true;

if (alreadyActive) {
  await sourceItem.unsetFlag(FLAG_SCOPE, ACTIVE_FLAG).catch(() => {});
  return;
}

// Activation
await sourceItem.setFlag(FLAG_SCOPE, ACTIVE_FLAG, true);

// Store charges visibly in Limited Uses value
const usesPath = "system.uses.value";
const currentCharges = Number(foundry.utils.getProperty(sourceItem, usesPath) ?? 0) || 0;
const charges = currentCharges + 1;

await sourceItem.update({
  [usesPath]: charges
});

if (charges < 3) return;

const dc = 10 + charges;
const roll = await new Roll(`1d20 + ${saveBonus(sourceActor, SAVE_TYPE)}`).evaluate({ async: true });
const success = Number(roll.total) >= dc;

// GM-only save roll
await roll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
  flavor: `${sourceActor.name}: ${SAVE_TYPE.toUpperCase()} save vs DC ${dc}`,
  whisper: gmUserIds()
});

if (success) return;

await whisperOwner(sourceActor, painMessage(charges));

if (charges >= 20) {
  await killActor(sourceActor);
  return;
}

if (charges >= 18) {
  await addNegativeLevels(sourceActor, 2);
  return;
}

if (charges >= 15) {
  await addNegativeLevels(sourceActor, 1);
  return;
}

const damage = scaledDamage(sourceActor, charges);
await addNonlethalDamage(sourceActor, damage);