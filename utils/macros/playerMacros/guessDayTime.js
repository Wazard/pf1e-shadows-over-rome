// Macro: Stima Ora del Giorno
// Pathfinder 1e / Foundry VTT
// Usa il worldTime interno di Foundry.
// CD 12: se fallisci sai solo il periodo.
// 12-19: stima con errore casuale fino a ±1h30.
// 20+: ora esatta.

const DC = 12;
const EXACT_DC = 20;
const MAX_ERROR_MINUTES = 90;

const SKILLS = [
  {
    label: "Sopravvivenza",
    key: "sur"
  },
  {
    label: "Conoscenze Locali",
    key: "klo"
  },
  {
    label: "Intuizione",
    key: "sen"
  }
];

function getUserActor() {
  const controlled = canvas.tokens.controlled[0]?.actor;
  if (controlled) return controlled;

  if (game.user.character) return game.user.character;

  return null;
}

function getWorldTimeParts() {
  const t = game.time.worldTime;
  const day = Math.floor(t / 86400) + 1;

  const secondsInDay = ((t % 86400) + 86400) % 86400;
  const hour = Math.floor(secondsInDay / 3600);
  const minute = Math.floor((secondsInDay % 3600) / 60);

  return { day, hour, minute };
}

function getDayPeriod(hour) {
  if (hour >= 6 && hour < 12) return "Mattina";
  if (hour >= 12 && hour < 18) return "Pomeriggio";
  if (hour >= 18 && hour < 22) return "Sera";
  return "Notte";
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getSkill(actor, key) {
  const skill = actor.system?.skills?.[key];
  if (!skill) return null;

  const possibleMods = [
    skill.mod,
    skill.total,
    skill.value
  ];

  let mod = 0;

  for (const value of possibleMods) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      mod = n;
      break;
    }
  }

  const ranks = Number(skill.rank ?? skill.ranks ?? 0);

  return {
    mod,
    ranks: Number.isFinite(ranks) ? ranks : 0,
    raw: skill
  };
}

function canUseSkill(actor, skillKey) {
  const skill = getSkill(actor, skillKey);
  if (!skill) return false;

  // Sopravvivenza e Intuizione sempre utilizzabili se presenti sulla scheda.
  if (skillKey === "sur" || skillKey === "sen") return true;

  // Conoscenze Locali richiede almeno 1 rank.
  // Se vuoi permetterla sempre, cambia in: return true;
  if (skillKey === "klo") return skill.ranks > 0;

  return true;
}

function estimateApproximateTime(hour, minute) {
  const realMinutes = hour * 60 + minute;

  const error = Math.floor(Math.random() * (MAX_ERROR_MINUTES * 2 + 1)) - MAX_ERROR_MINUTES;
  const estimatedMinutes = realMinutes + error;

  // Arrotonda ai 15 minuti, così non escono orari brutti tipo 13:47.
  const rounded = Math.round(estimatedMinutes / 15) * 15;

  const normalized = ((rounded % 1440) + 1440) % 1440;

  const estimatedHour = Math.floor(normalized / 60);
  const estimatedMinute = normalized % 60;

  return {
    hour: estimatedHour,
    minute: estimatedMinute,
    period: getDayPeriod(estimatedHour)
  };
}

async function rollForTime(actor, skillData, currentTime) {
  const skill = getSkill(actor, skillData.key);

  if (!skill) {
    ui.notifications.warn(`Skill non trovata: ${skillData.label}`);
    return;
  }

  const roll = await new Roll(`1d20 + ${skill.mod}`).evaluate();

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `Stima dell'ora con ${skillData.label}`
  });

  const total = roll.total;
  const obviousPeriod = getDayPeriod(currentTime.hour);

  let resultText = "";

  if (total < DC) {
    resultText = `
      <p><strong>${actor.name}</strong> non riesce a stimare l'ora con sicurezza.</p>
      <p>Sa solo che è <strong>${obviousPeriod.toLowerCase()}</strong>.</p>
    `;
  } else if (total >= EXACT_DC) {
    resultText = `
      <p><strong>${actor.name}</strong> osserva bene la luce, le ombre e la posizione del sole.</p>
      <p>È sicuro dell'orario: sono le <strong>${formatTime(currentTime.hour, currentTime.minute)}</strong> di <strong>${obviousPeriod.toLowerCase()}</strong>.</p>
    `;
  } else {
    const guessed = estimateApproximateTime(currentTime.hour, currentTime.minute);

    resultText = `
      <p><strong>${actor.name}</strong> riesce a farsi un'idea dell'orario, ma non con precisione assoluta.</p>
      <p>Stima che siano circa le <strong>${formatTime(guessed.hour, guessed.minute)}</strong> di <strong>${guessed.period.toLowerCase()}</strong>.</p>
    `;
  }

  const content = `
    <div>
      <h3>Stima dell'ora</h3>
      <p><strong>Periodo evidente:</strong> ${obviousPeriod}</p>
      <p><strong>Skill usata:</strong> ${skillData.label}</p>
      <p><strong>Risultato:</strong> ${total}</p>
      <hr>
      ${resultText}
    </div>
  `;

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

const actor = getUserActor();

if (!actor) {
  ui.notifications.warn("Seleziona un token o assegna un personaggio al tuo utente.");
  return;
}

const currentTime = getWorldTimeParts();
const obviousPeriod = getDayPeriod(currentTime.hour);

const buttons = {};

for (const skillData of SKILLS) {
  const usable = canUseSkill(actor, skillData.key);

  buttons[skillData.key] = {
    label: skillData.label,
    callback: async () => {
      if (!usable) {
        ui.notifications.warn(`${skillData.label} non è disponibile per ${actor.name}.`);
        return;
      }

      await rollForTime(actor, skillData, currentTime);
    }
  };
}

buttons.close = {
  label: "Chiudi"
};

new Dialog({
  title: "Stimare l'ora",
  buttons,
  default: "sur",
  render: (html) => {
    for (const skillData of SKILLS) {
      if (!canUseSkill(actor, skillData.key)) {
        html.find(`button[data-button="${skillData.key}"]`).prop("disabled", true).css({
          opacity: 0.45,
          cursor: "not-allowed"
        });
      }
    }
  }
}).render(true);