const CONDITION = "nauseated";

function getSourceItem() {
  if (typeof item !== "undefined" && item) return item;
  if (typeof shared !== "undefined" && shared?.item) return shared.item;
  if (typeof this !== "undefined" && this?.item) return this.item;
  return null;
}

function isActiveBuff(buff) {
  return buff?.system?.active === true || buff?.system?.disabled === false;
}

const buff = getSourceItem();
const actor = buff?.actor ?? (typeof actor !== "undefined" ? actor : null);

if (!actor || !buff) return;

if (isActiveBuff(buff)) {
  await actor.setCondition(CONDITION, true);
} else {
  await actor.setCondition(CONDITION, false);
}