// PF1e - Recharge Every Item on Selected Token
// Sets item.system.uses.value = item.system.uses.max for every item with limited uses.

const token = canvas.tokens.controlled[0];

if (!token) {
  ui.notifications.warn("Select a token first.");
  return;
}

const actor = token.actor;

if (!actor) {
  ui.notifications.warn("Selected token has no actor.");
  return;
}

const updates = [];

for (const item of actor.items) {
  const uses = item.system?.uses;
  if (!uses) continue;

  const current = Number(uses.value ?? 0);
  const maxRaw = uses.max;

  if (maxRaw === null || maxRaw === undefined || maxRaw === "") continue;

  let max = Number(maxRaw);

  // If max is a formula, try to evaluate it.
  if (Number.isNaN(max)) {
    try {
      const rollData = item.getRollData ? item.getRollData() : actor.getRollData();
      const roll = await new Roll(String(maxRaw), rollData).evaluate({ async: true });
      max = Number(roll.total);
    } catch (err) {
      console.warn(`Could not evaluate max uses for ${item.name}:`, maxRaw, err);
      continue;
    }
  }

  if (!Number.isFinite(max)) continue;
  if (current >= max) continue;

  updates.push({
    _id: item.id,
    "system.uses.value": max
  });
}

if (!updates.length) {
  ui.notifications.info(`${actor.name}: no items needed recharging.`);
  return;
}

await actor.updateEmbeddedDocuments("Item", updates);

ui.notifications.info(`${actor.name}: recharged ${updates.length} item(s).`);