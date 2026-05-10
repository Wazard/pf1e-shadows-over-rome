const FLAG_SCOPE = "world";

const SKILLS = {
  spl: "Spellcraft",
  kar: "Knowledge Arcana"
};

const actor =
  game.user.character ??
  canvas.tokens.controlled[0]?.actor;

if (!actor) {
  return ui.notifications.warn("Non hai un personaggio assegnato o un token selezionato.");
}

function getSkillMod(actor, skillKey) {
  const skill = actor.system?.skills?.[skillKey];
  if (!skill) return null;

  const value =
    skill.mod ??
    skill.total ??
    skill.value ??
    skill.rank ??
    0;

  return Number(value) || 0;
}

function getItemCL(item) {
  const possibleValues = [
    item.system?.cl,
    item.system?.casterLevel,
    item.system?.properties?.cl,
    item.system?.aura?.cl
  ];

  for (const value of possibleValues) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }

  return 1;
}

function isIdentifiable(item) {
  if (!item) return false;
  if (!["weapon", "equipment", "consumable", "loot"].includes(item.type)) return false;

  // Mostra solo oggetti non identificati.
  if (item.system?.identified === true) return false;

  return true;
}

function getUnidentifiedItems(actor) {
  return actor.items.filter(isIdentifiable);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getIdentifiedPropertiesPath(item) {
  // Path più probabili per "Identified Properties" in PF1e.
  // Usa il primo path che esiste.
  const candidates = [
    "system.description.identified",
    "system.description.identified.value",
    "system.identified.description",
    "system.identified.description.value",
    "system.description.value"
  ];

  for (const path of candidates) {
    const value = foundry.utils.getProperty(item, path);

    if (value !== undefined) {
      return path;
    }
  }

  // Fallback: crea il campo più probabile.
  return "system.description.identified";
}

function getIdentifiedPropertiesValue(item) {
  const path = getIdentifiedPropertiesPath(item);
  const value = foundry.utils.getProperty(item, path);

  if (typeof value === "string") return value;
  if (value && typeof value.value === "string") return value.value;

  return "";
}

function descriptionAlreadyHasCurse(description) {
  const text = String(description ?? "").toLowerCase();
  return text.includes("<h3>maledizione") || text.includes("maledizione:");
}

async function appendCurseToIdentifiedProperties(item, curseDescription) {
  if (!curseDescription) return;

  const path = getIdentifiedPropertiesPath(item);
  const currentDescription = getIdentifiedPropertiesValue(item);

  if (descriptionAlreadyHasCurse(currentDescription)) {
    return;
  }

  const curseBlock = `
<h3>Maledizione:</h3>
<p>${escapeHtml(curseDescription)}</p>`;

  const newDescription = `${currentDescription || ""}${curseBlock}`;

  await item.update({
    [path]: newDescription
  });
}

async function identifyItem(item, curseRevealed, curseDescription) {
  await item.update({
    "system.identified": true
  });

  if (curseRevealed) {
    await appendCurseToIdentifiedProperties(item, curseDescription);
  }
}

const items = getUnidentifiedItems(actor);

if (!items.length) {
  return ui.notifications.info(`${actor.name} non ha oggetti non identificati.`);
}

const itemOptions = items
  .map(item => `<option value="${item.id}">${item.name}</option>`)
  .join("");

const skillOptions = Object.entries(SKILLS)
  .map(([key, label]) => `<option value="${key}">${label}</option>`)
  .join("");

new Dialog({
  title: "Identificare oggetto",
  content: `
    <form>
      <div class="form-group">
        <label>Oggetto</label>
        <select name="itemId">${itemOptions}</select>
      </div>

      <div class="form-group">
        <label>Skill</label>
        <select name="skillKey">${skillOptions}</select>
      </div>

      <p style="font-size: 12px; opacity: 0.8;">
        Provi a studiare l'oggetto per comprenderne natura e proprietà.
      </p>
    </form>
  `,
  buttons: {
    roll: {
      icon: '<i class="fas fa-dice-d20"></i>',
      label: "Tira",
      callback: async html => {
        const form = html[0].querySelector("form");
        const data = new FormData(form);

        const itemId = data.get("itemId");
        const skillKey = data.get("skillKey");

        const item = actor.items.get(itemId);
        if (!item) return ui.notifications.warn("Oggetto non trovato.");

        const skillMod = getSkillMod(actor, skillKey);
        if (skillMod == null) {
          return ui.notifications.warn(`Skill ${SKILLS[skillKey]} non trovata sulla scheda.`);
        }

        const cl = getItemCL(item);
        const identifyDC = 15 + cl;

        const cursed = item.getFlag(FLAG_SCOPE, "isCursed") === true;
        const curseDcBonus = Number(item.getFlag(FLAG_SCOPE, "curseDcBonus") ?? 10);
        const curseDC = identifyDC + curseDcBonus;
        const curseDescription = item.getFlag(FLAG_SCOPE, "curseDescription") ?? "";

        const roll = await new Roll(`1d20 + ${skillMod}`).evaluate();

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${actor.name} prova a identificare ${item.name} con ${SKILLS[skillKey]}`
        });

        const total = roll.total;
        const identified = total >= identifyDC;
        const curseRevealed = cursed && total >= curseDC;

        if (identified) {
          await identifyItem(item, curseRevealed, curseDescription);

          let content = `
            <p><strong>${actor.name}</strong> identifica <strong>${item.name}</strong>.</p>
          `;

          if (curseRevealed) {
            content += `
              <p><strong>Durante l'identificazione, emerge qualcosa di sinistro nell'oggetto.</strong></p>
            `;
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });
        } else {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <p><strong>${actor.name}</strong> non riesce a identificare <strong>${item.name}</strong>.</p>
            `
          });
        }
      }
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Annulla"
    }
  },
  default: "roll"
}).render(true);