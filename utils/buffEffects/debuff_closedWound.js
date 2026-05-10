const FLAG_SCOPE = "pf1e-shadows-over-rome";
const TEMP_HP_FLAG = "previousTempHp";

const sourceItem = item ?? shared?.item;
const actor = sourceItem?.actor ?? actor;

if (!actor || !sourceItem) return;

const tempHpPath = "system.attributes.hp.temp";
const hpPath = "system.attributes.hp.value";

const currentTempHp = Number(foundry.utils.getProperty(actor, tempHpPath) ?? 0);
const storedTempHp = sourceItem.getFlag(FLAG_SCOPE, TEMP_HP_FLAG);

if (storedTempHp !== undefined && storedTempHp !== null) {
  await actor.update({
    [tempHpPath]: Math.min(currentTempHp, Number(storedTempHp) || 0)
  });

  await sourceItem.unsetFlag(FLAG_SCOPE, TEMP_HP_FLAG).catch(() => {});
  return;
}

await sourceItem.setFlag(FLAG_SCOPE, TEMP_HP_FLAG, currentTempHp);

// Use one charge when applied
const usesPath = "system.uses.value";
const currentUses = Number(foundry.utils.getProperty(sourceItem, usesPath) ?? 0);

if (Number.isFinite(currentUses) && currentUses > 0) {
  await sourceItem.update({
    [usesPath]: currentUses - 1
  });
}

await actor.update({
  [tempHpPath]: Math.max(currentTempHp, 999)
});

const roll = await new Roll("1d3").evaluate({ async: true });
const healAmount = Number(roll.total ?? 0);
const currentHp = Number(foundry.utils.getProperty(actor, hpPath) ?? 0);

await actor.update({
  [hpPath]: currentHp + healAmount
});

await actor.setCondition?.("stable", true).catch(() => {});