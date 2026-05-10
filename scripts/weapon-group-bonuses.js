// PF1e Weapon Group Bonuses - Clean Rewrite v6
// FoundryVTT + Pathfinder 1e
//
// Simple flow:
// 1. Intercept weapon attack/damage roll.
// 2. Check actor features by name.
// 3. Add the math.
// 4. Store the Auto line in the outgoing ChatMessage flags.
// 5. If the roller is GM, inject immediately.
// 6. If the roller is a player, the first active GM injects it after message creation.
//
// This fixes player rolls where the math works but the Auto line only appears
// reliably when the GM is the one rolling.
//
// Supported feature names:
// - Weapon Training (Blades, Heavy +2)
// - Weapon Training (Heavy Blades +2)
// - Weapon Focus (Longsword)
// - Greater Weapon Focus (Longsword)
// - Weapon Specialization (Longsword)
// - Greater Weapon Specialization (Longsword)
// - Advanced Weapon Training (Trained Grace, Blades, Heavy)
//
// Debug:
// Set DEBUG = true if needed.

const WGB = {
  ID: "pf1e-shadows-over-rome",
  DEBUG: false,
  pendingNotes: []
};

const WEAPON_GROUPS = {
  "axes": "axes",
  "blades heavy": "bladesHeavy",
  "heavy blades": "bladesHeavy",
  "blades light": "bladesLight",
  "light blades": "bladesLight",
  "bows": "bows",
  "close": "close",
  "crossbows": "crossbows",
  "double": "double",
  "firearms": "firearms",
  "flails": "flails",
  "hammers": "hammers",
  "monk": "monk",
  "natural": "natural",
  "polearms": "polearms",
  "siege engines": "siegeEngines",
  "spears": "spears",
  "thrown": "thrown",
  "tribal": "tribal"
};

const WEAPON_NAME_FEATURES = [
  {
    label: "Weapon Focus",
    pattern: /^Weapon Focus\s*\((.+?)\)$/i,
    attack: 1,
    damage: 0
  },
  {
    label: "Greater Weapon Focus",
    pattern: /^Greater Weapon Focus\s*\((.+?)\)$/i,
    attack: 1,
    damage: 0
  },
  {
    label: "Weapon Specialization",
    pattern: /^Weapon Specialization\s*\((.+?)\)$/i,
    attack: 0,
    damage: 2
  },
  {
    label: "Greater Weapon Specialization",
    pattern: /^Greater Weapon Specialization\s*\((.+?)\)$/i,
    attack: 0,
    damage: 2
  }
];

Hooks.once("ready", () => {
  patchChatMessageCreate();
  patchWeaponActions();

  Hooks.on("createChatMessage", handleCreatedChatMessage);

  let attempts = 0;
  const retry = setInterval(() => {
    attempts += 1;

    if (patchWeaponActions() || attempts >= 20) {
      clearInterval(retry);
    }
  }, 500);

  window.weaponGroupBonusesDebug = {
    bonusesForSelected,
    pendingNotes: WGB.pendingNotes,
    state: () => console.warn(`${WGB.ID} | state`, {
      pendingNotes: WGB.pendingNotes,
      chatCreatePatched: ChatMessage.__wgbCreateContentPatched,
      debug: WGB.DEBUG,
      isResponsibleGM: isResponsibleGM()
    })
  };
});

function debug(...args) {
  if (WGB.DEBUG) console.warn(`${WGB.ID} DEBUG |`, ...args);
}

function patchWeaponActions() {
  const proto = findWeaponActionPrototype();
  if (!proto) return false;

  if (proto.__wgbActionPatched) return true;
  proto.__wgbActionPatched = true;

  const originalAttack = proto.rollAttack;
  const originalDamage = proto.rollDamage;

  proto.rollAttack = async function (...args) {
    const weapon = getActionWeapon(this);

    if (!weapon?.actor || weapon.type !== "weapon") {
      return originalAttack.call(this, ...args);
    }

    const actor = weapon.actor;
    const bonuses = getBonuses(actor, weapon);

    if (bonuses.attackTotal) {
      args[0] ??= {};
      args[0].bonus = addFormula(args[0].bonus, bonuses.attackTotal);
    }

    const note = makeNote("attack", actor, weapon, bonuses.attackParts, bonuses.damageParts);
    queueNote(note);

    debug("attack intercepted", {
      actor: actor.name,
      weapon: weapon.name,
      bonuses,
      autoLine: note?.text
    });

    return originalAttack.call(this, ...args);
  };

  proto.rollDamage = async function (...args) {
    const weapon = getActionWeapon(this);

    if (!weapon?.actor || weapon.type !== "weapon") {
      return originalDamage.call(this, ...args);
    }

    const actor = weapon.actor;
    const bonuses = getBonuses(actor, weapon);

    if (bonuses.damageTotal) {
      args[0] ??= {};
      args[0].extraParts = Array.isArray(args[0].extraParts) ? args[0].extraParts : [];
      args[0].extraParts.push(String(bonuses.damageTotal));
    }

    const note = makeNote("damage", actor, weapon, bonuses.attackParts, bonuses.damageParts);
    queueNote(note);

    debug("damage intercepted", {
      actor: actor.name,
      weapon: weapon.name,
      bonuses,
      autoLine: note?.text
    });

    return originalDamage.call(this, ...args);
  };

  console.log(`${WGB.ID} | ready`);
  return true;
}

function findWeaponActionPrototype() {
  for (const actor of game.actors ?? []) {
    for (const weapon of actor.items?.filter(i => i.type === "weapon") ?? []) {
      const action = firstAction(weapon);
      const proto = action ? Object.getPrototypeOf(action) : null;

      if (typeof proto?.rollAttack === "function" && typeof proto?.rollDamage === "function") {
        return proto;
      }
    }
  }

  return null;
}

function firstAction(item) {
  return item?.actions?.first?.() ?? Array.from(item?.actions ?? [])[0] ?? null;
}

function getActionWeapon(action) {
  return action?.item ?? action?.parent ?? action?.document ?? null;
}

function queueNote(note) {
  cleanupNotes();

  if (!note?.text || !note?.html) return;

  note.createdAt = Date.now();
  WGB.pendingNotes.push(note);

  console.warn(`${WGB.ID} | AUTO LINE SHOULD BE:`, note.text);
  debug("queued Auto note", {
    note,
    pendingCount: WGB.pendingNotes.length
  });
}

function cleanupNotes() {
  const now = Date.now();

  for (let i = WGB.pendingNotes.length - 1; i >= 0; i--) {
    if (now - WGB.pendingNotes[i].createdAt > 10000) {
      debug("discarding stale Auto note", WGB.pendingNotes[i]);
      WGB.pendingNotes.splice(i, 1);
    }
  }
}

function patchChatMessageCreate() {
  if (ChatMessage.__wgbCreateContentPatched) return;
  ChatMessage.__wgbCreateContentPatched = true;

  const originalCreate = ChatMessage.create;

  ChatMessage.create = async function (data, operation) {
    cleanupNotes();

    const patchedData = Array.isArray(data)
      ? data.map(addAutoLineToChatData)
      : addAutoLineToChatData(data);

    return originalCreate.call(this, patchedData, operation);
  };
}

function addAutoLineToChatData(data) {
  if (!data || typeof data !== "object") return data;
  if (!WGB.pendingNotes.length) return data;

  const note = takeBestNote(data);
  if (!note) {
    debug("no Auto note matched ChatMessage.create data", {
      speaker: data.speaker,
      type: data.type,
      flavor: data.flavor,
      pendingNotes: WGB.pendingNotes
    });
    return data;
  }

  const flags = foundry.utils.deepClone(data.flags ?? {});
  flags[WGB.ID] = {
    autoText: note.text,
    autoHtml: note.html,
    rollerUserId: game.user.id,
    inserted: false
  };

  const content = String(data.content ?? "");

  // GM-created rolls can be finalized immediately.
  // Player-created rolls carry the flag; GM injects after creation.
  const shouldInjectNow = game.user.isGM;

  const newContent = shouldInjectNow && !content.includes("pf1e-wgb-summary")
    ? `${content}${note.html}`
    : content;

  if (shouldInjectNow) {
    flags[WGB.ID].inserted = true;
    console.warn(`${WGB.ID} | AUTO LINE ADDED TO CHAT CONTENT:`, note.text);
  } else {
    console.warn(`${WGB.ID} | AUTO LINE STORED FOR GM INSERTION:`, note.text);
  }

  debug("patched ChatMessage.create data", {
    autoLine: note.text,
    isGM: game.user.isGM,
    speaker: data.speaker,
    type: data.type,
    flavor: data.flavor
  });

  return {
    ...data,
    flags,
    content: newContent
  };
}

async function handleCreatedChatMessage(message) {
  const auto = message.getFlag?.(WGB.ID) ?? message.flags?.[WGB.ID];
  if (!auto?.autoHtml || auto.inserted === true) return;

  if (!isResponsibleGM()) return;

  const content = String(message.content ?? "");
  if (content.includes("pf1e-wgb-summary")) {
    await message.setFlag(WGB.ID, "inserted", true).catch(() => {});
    return;
  }

  try {
    await message.update({
      content: `${content}${auto.autoHtml}`,
      [`flags.${WGB.ID}.inserted`]: true
    });

    console.warn(`${WGB.ID} | GM INSERTED AUTO LINE INTO PLAYER ROLL:`, auto.autoText);
  } catch (err) {
    console.error(`${WGB.ID} | Failed to insert Auto line into player roll`, err, {
      message,
      auto
    });
  }
}

function isResponsibleGM() {
  if (!game.user.isGM) return false;

  const activeGMs = game.users
    .filter(u => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id));

  return activeGMs[0]?.id === game.user.id;
}

function takeBestNote(data) {
  const speakerActor = data?.speaker?.actor ?? null;
  const kind = inferMessageKind(data);

  let index = WGB.pendingNotes.findIndex(note =>
    (!speakerActor || note.actorId === speakerActor) &&
    (!kind || note.kind === kind)
  );

  if (index === -1) {
    index = WGB.pendingNotes.findIndex(note =>
      !speakerActor || note.actorId === speakerActor
    );
  }

  if (index === -1) {
    index = 0;
  }

  const note = WGB.pendingNotes[index];
  if (!note) return null;

  WGB.pendingNotes.splice(index, 1);
  return note;
}

function inferMessageKind(data) {
  const text = normalizeText([
    data?.flavor,
    stripHtml(data?.content),
    data?.type
  ].join(" "));

  if (/\bdamage\b|\bdmg\b|\bdanni\b/.test(text)) return "damage";
  if (/\battack\b|\battacco\b|\bto hit\b/.test(text)) return "attack";

  return null;
}

function getBonuses(actor, weapon) {
  const attackParts = [];
  const damageParts = [];

  const weaponGroups = getWeaponGroups(weapon);

  const training = getBestWeaponTraining(actor, weaponGroups);
  if (training) {
    attackParts.push(training);
    damageParts.push(training);
  }

  const grace = getTrainedGrace(actor, weaponGroups);
  if (grace) {
    damageParts.push(grace);
  }

  for (const feature of actor.items ?? []) {
    const name = String(feature.name ?? "");

    for (const rule of WEAPON_NAME_FEATURES) {
      const match = name.match(rule.pattern);
      if (!match) continue;
      if (!weaponNameMatches(weapon.name, match[1])) continue;

      if (rule.attack) {
        attackParts.push({
          name: rule.label,
          value: rule.attack
        });
      }

      if (rule.damage) {
        damageParts.push({
          name: rule.label,
          value: rule.damage
        });
      }
    }
  }

  const attack = cleanParts(attackParts);
  const damage = cleanParts(damageParts);

  return {
    attackParts: attack,
    damageParts: damage,
    attackTotal: sumParts(attack),
    damageTotal: sumParts(damage)
  };
}

function getBestWeaponTraining(actor, weaponGroups) {
  let best = null;

  for (const feature of actor.items ?? []) {
    const name = String(feature.name ?? "");
    const match = name.match(/^Weapon Training\s*\((.+?)\s*\+(\d+)\)$/i);
    if (!match) continue;

    const group = weaponGroupKey(match[1]);
    const value = Number(match[2]);

    if (!group || !weaponGroups.includes(group)) continue;
    if (!Number.isFinite(value) || value <= 0) continue;

    if (!best || value > best.value) {
      best = {
        name: "Weapon Training",
        value,
        group,
        rawName: name
      };
    }
  }

  return best;
}

function getTrainedGrace(actor, weaponGroups) {
  let best = null;

  for (const feature of actor.items ?? []) {
    const name = String(feature.name ?? "");
    const match = name.match(/^Advanced Weapon Training\s*\((.+?),\s*(.+?)\)$/i);
    if (!match) continue;
    if (normalizeText(match[1]) !== "trained grace") continue;

    const group = weaponGroupKey(match[2]);
    if (!group || !weaponGroups.includes(group)) continue;

    const value = getWeaponTrainingValue(actor, group);
    if (!value) continue;

    if (!best || value > best.value) {
      best = {
        name: "Trained Grace",
        value,
        group,
        rawName: name
      };
    }
  }

  return best;
}

function getWeaponTrainingValue(actor, group) {
  let best = 0;

  for (const feature of actor.items ?? []) {
    const name = String(feature.name ?? "");
    const match = name.match(/^Weapon Training\s*\((.+?)\s*\+(\d+)\)$/i);
    if (!match) continue;

    if (weaponGroupKey(match[1]) !== group) continue;

    const value = Number(match[2]);
    if (Number.isFinite(value)) best = Math.max(best, value);
  }

  return best;
}

function getWeaponGroups(weapon) {
  const groups = weapon?.system?.weaponGroups?.base ?? [];

  if (Array.isArray(groups)) return groups.filter(Boolean);

  if (groups && typeof groups === "object") {
    return Object.values(groups).filter(Boolean);
  }

  return [];
}

function weaponGroupKey(text) {
  return WEAPON_GROUPS[normalizeText(text)] ?? null;
}

function weaponNameMatches(weaponName, wantedName) {
  const weapon = normalizeText(weaponName);
  const wanted = normalizeText(wantedName);

  if (!weapon || !wanted) return false;

  return weapon === wanted || weapon.includes(wanted);
}

function cleanParts(parts) {
  const map = new Map();

  for (const part of parts ?? []) {
    const name = safeName(part?.name);
    const value = Number(part?.value ?? 0);

    if (!name || !Number.isFinite(value) || value === 0) continue;

    map.set(name, (map.get(name) ?? 0) + value);
  }

  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function sumParts(parts) {
  return cleanParts(parts).reduce((sum, part) => sum + part.value, 0);
}

function addFormula(base, bonus) {
  const cleanBase = String(base ?? "").trim();
  const cleanBonus = Number(bonus ?? 0);

  if (!cleanBonus) return cleanBase;
  if (!cleanBase) return String(cleanBonus);

  return `${cleanBase} + ${cleanBonus}`;
}

function makeNote(kind, actor, weapon, attackParts, damageParts) {
  const attack = cleanParts(attackParts);
  const damage = cleanParts(damageParts);

  const attackTotal = sumParts(attack);
  const damageTotal = sumParts(damage);

  if (!attackTotal && !damageTotal) return null;

  const lines = [];

  if (attackTotal) {
    lines.push(`roll (${formatParts(attack)}) +${attackTotal}`);
  }

  if (damageTotal) {
    lines.push(`damage (${formatParts(damage)}) +${damageTotal}`);
  }

  const text = `Auto: ${lines.join(" · ")}`;

  return {
    kind,
    actorId: actor.id,
    actorName: actor.name,
    weaponId: weapon.id,
    weaponName: weapon.name,
    text,
    html: `
<div class="pf1e-wgb-summary" style="margin-top:4px;padding-top:3px;border-top:1px solid rgba(0,0,0,.18);font-size:11px;line-height:1.25;opacity:.9;">
  <strong>${escapeHtml(text)}</strong>
</div>`
  };
}

function formatParts(parts) {
  return cleanParts(parts)
    .map(p => `${safeName(p.name)} +${p.value}`)
    .join(", ");
}

function safeName(value) {
  const text = String(value ?? "").trim();

  if (!text || text.toLowerCase() === "undefined" || text.toLowerCase() === "bonus") {
    return "Automatic bonus";
  }

  return text;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[,_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return div.textContent || div.innerText || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bonusesForSelected() {
  const actor = game.user.character ?? canvas.tokens.controlled[0]?.actor;

  if (!actor) {
    console.warn(`${WGB.ID} | No assigned character and no selected token.`);
    return null;
  }

  const result = actor.items
    .filter(i => i.type === "weapon")
    .map(weapon => ({
      weapon: weapon.name,
      groups: getWeaponGroups(weapon),
      bonuses: getBonuses(actor, weapon)
    }));

  console.warn(`${WGB.ID} | Bonuses for ${actor.name}:`, result);
  return result;
}
