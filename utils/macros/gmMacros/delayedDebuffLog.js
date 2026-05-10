// DEBUG Delayed Buffs - stato completo

const FLAG_SCOPE = "pf1e-shadows-over-rome";
const DATA_KEY = "data";

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;

if (!actor) {
  return ui.notifications.warn("Seleziona un token o assegna un character.");
}

console.log("=== DEBUG DELAYED BUFFS ===");
console.log("Actor:", actor.name);
console.log("World time:", game.time.worldTime);
console.log("Module active:", game.modules.get("pf1e-weapon-group-bonuses")?.active);
console.log("Module data:", game.modules.get("pf1e-weapon-group-bonuses"));

for (const item of actor.items) {
  if (item.type !== "buff") continue;

  const targetBuffName = item.getFlag(FLAG_SCOPE, "targetBuffName");
  const delayText = item.getFlag(FLAG_SCOPE, "delayText");
  const deleteTriggerOnActivation = item.getFlag(FLAG_SCOPE, "deleteTriggerOnActivation");
  const data = item.getFlag(FLAG_SCOPE, DATA_KEY);

  console.log("BUFF:", item.name);
  console.log("  targetBuffName:", targetBuffName);
  console.log("  delayText:", delayText);
  console.log("  deleteTriggerOnActivation:", deleteTriggerOnActivation);
  console.log("  data:", data);
}

ui.notifications.info("Debug delayed buffs stampato in console.");