// PF1e On-Roll Weapon Effects - DEBUG VERSION
// Reads item Dictionary Flags:
// onRoll1  = deal_1d4_sonic;condition_shaken_1d3
// onRoll20 = heal_1d6_magic

Hooks.once("ready", () => {
  const MODULE_ID = "SOR OnRoll DEBUG";
  const DEBUG = true;

  const activeAttacks = [];
  const conditionTimers = new Map();

  function firstAction(item) {
    return item?.actions?.first?.() ?? Array.from(item?.actions ?? [])[0] ?? null;
  }

function getActionItem(action) {
  const rawItem = action?.item ?? action?.parent ?? action?.document ?? null;

  const actor =
    rawItem?.actor ??
    action?.actor ??
    null;

  if (!rawItem || !actor?.items) return rawItem;

  const rawName = String(rawItem.name ?? "").trim();
  const rawId = rawItem.id ?? rawItem._id;

  const actorItems = Array.from(actor.items ?? []);
  const candidates = actorItems.filter(i =>
    i.type === "weapon" &&
    (
      i.id === rawId ||
      i._id === rawId ||
      String(i.name ?? "").trim() === rawName
    )
  );

  const itemWithDictionaryFlags = candidates.find(i =>
    i.system?.flags?.dictionary &&
    Object.keys(i.system.flags.dictionary).length > 0
  );

  if (itemWithDictionaryFlags) {
    return itemWithDictionaryFlags;
  }

  const fallback = candidates[0] ?? rawItem;

  return fallback;
}

  function findWeaponActionPrototype() {

    for (const actor of game.actors ?? []) {
      for (const item of actor.items?.filter(i => i.type === "weapon") ?? []) {
        const action = firstAction(item);
        const proto = action ? Object.getPrototypeOf(action) : null;

        if (typeof proto?.rollAttack === "function")
          return proto;
      }
    }

    return null;
  }

function getDictionaryFlag(item, key) {
  const dictionary = item.system?.flags?.dictionary ?? {};

  const exact = dictionary[key];

  if (exact !== undefined && exact !== null && exact !== "")
    return exact;

  const wanted = String(key).trim().toLowerCase();

  for (const [flagKey, value] of Object.entries(dictionary)) {
    const normalizedKey = String(flagKey).trim().toLowerCase();

    if (normalizedKey !== wanted) continue;

    return value;
  }

  return undefined;
}

  function normalizeActions(value) {
    if (!value) return [];

    if (typeof value === "string") {
      return value
        .split(/[;,]/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (Array.isArray(value)) {
      return value.flatMap(normalizeActions);
    }

    if (typeof value === "object") {
      if ("value" in value) return normalizeActions(value.value);
      if ("values" in value) return normalizeActions(value.values);
      return Object.values(value).flatMap(normalizeActions);
    }

    return [];
  }

  function getOnRollConfig(item) {
    const config = {
      onRoll1: normalizeActions(getDictionaryFlag(item, "onRoll1")),
      onRoll20: normalizeActions(getDictionaryFlag(item, "onRoll20"))
    };

    return config;
  }

  function hasOnRollConfig(config) {
    return config.onRoll1.length || config.onRoll20.length;
  }

  function patchWeaponActions() {
    const proto = findWeaponActionPrototype();
    if (!proto) return false;

    if (proto.__sorOnRollPatched)
      return true;

    proto.__sorOnRollPatched = true;

    const originalRollAttack = proto.rollAttack;

    proto.rollAttack = async function (...args) {
      const item = getActionItem(this);
      const actor = item?.actor;

      if (!item || !actor || item.type !== "weapon")
        return originalRollAttack.call(this, ...args);

      const config = getOnRollConfig(item);

      if (!hasOnRollConfig(config))
        return originalRollAttack.call(this, ...args);

      const context = {
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        itemUuid: item.uuid,
        itemName: item.name,
        config,
        used: false,
        createdAt: Date.now()
      };

      activeAttacks.push(context);

      setTimeout(() => {
        removeContext(context);
      }, 5000);

      return originalRollAttack.call(this, ...args);
    };

    return true;
  }

  function removeContext(context) {
    const index = activeAttacks.indexOf(context);
    if (index >= 0) activeAttacks.splice(index, 1);
  }

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html ?? "");
    return div.textContent || div.innerText || "";
  }

  function getActorFromSpeaker(speaker) {

    if (!speaker) return null;

    if (speaker.scene && speaker.token) {
      const scene = game.scenes.get(speaker.scene);
      const token = scene?.tokens?.get(speaker.token);

      if (token?.actor) return token.actor;
    }

    if (speaker.actor) {
      const actor = game.actors.get(speaker.actor);
      return actor ?? null;
    }

    return null;
  }

  function findNaturalD20(value, depth = 0) {
    if (!value || depth > 8) return null;

    if (typeof value === "string") {
      try {
        return findNaturalD20(JSON.parse(value), depth + 1);
      } catch {
        return null;
      }
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const result = findNaturalD20(entry, depth + 1);
        if (result !== null) return result;
      }
      return null;
    }

    if (typeof value === "object") {
      if (Number(value.faces) === 20 && Array.isArray(value.results)) {
        const active = value.results.find(r => r.active !== false);
        if (active) return Number(active.result);
      }

      for (const entry of Object.values(value)) {
        const result = findNaturalD20(entry, depth + 1);
        if (result !== null) return result;
      }
    }

    return null;
  }

function getNaturalFromChatData(data) {
  const content = String(data?.content ?? "");
  const text = stripHtml(content);

  const isAttack =
    /\battack\b/i.test(text) ||
    /\battacco\b/i.test(text) ||
    /\(attack\)/i.test(text) ||
    /attack #\d+/i.test(text);

  if (!isAttack) 
    return null;

  const fromData = findNaturalD20(data);
  if (fromData !== null) 
    return fromData;

  const dataNatural = content.match(/data-natural=["'](\d+)["']/i);
  if (dataNatural)
    return Number(dataNatural[1]);

  const htmlDie = content.match(/<li[^>]*class=["'][^"']*\broll\b[^"']*\bdie\b[^"']*\bd20\b[^"']*["'][^>]*>\s*(\d+)\s*<\/li>/i);
  if (htmlDie) 
    return Number(htmlDie[1]);

  return null;
}

  async function changeHp(actor, amount) {
    const path = "system.attributes.hp.value";
    const maxPath = "system.attributes.hp.max";

    const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
    const max = Number(foundry.utils.getProperty(actor, maxPath) ?? current);
    const next = Math.max(0, Math.min(max, current + amount));

    await actor.update({ [path]: next });
  }

  async function runAction(actor, action) {

    const deal = action.match(/^deal_(.+?)_(\w+)$/i);
    if (deal) {
      const formula = deal[1];
      const damageType = deal[2];

      const roll = await new Roll(formula).evaluate({ async: true });

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} suffers ${damageType} backlash`
      });

      await changeHp(actor, -Number(roll.total));
      return;
    }

    const heal = action.match(/^heal_(.+?)_(\w+)$/i);
    if (heal) {
      const formula = heal[1];
      const healType = heal[2];

      const roll = await new Roll(formula).evaluate({ async: true });

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} receives ${healType} healing`
      });

      await changeHp(actor, Number(roll.total));
      return;
    }

    const condition = action.match(/^condition_(\w+)_(.+)$/i);
    if (condition) {
      const conditionName = condition[1];
      const durationFormula = condition[2];

      const roll = await new Roll(durationFormula).evaluate({ async: true });
      const rounds = Number(roll.total);

      await actor.setCondition(conditionName, true);

      const endRound = (game.combat?.round ?? 0) + rounds;
      conditionTimers.set(`${actor.uuid}.${conditionName}`, {
        actorUuid: actor.uuid,
        conditionName,
        endRound
      });

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `${actor.name} is ${conditionName} for ${rounds} round(s).`
      });

      return;
    }

    console.warn(`${MODULE_ID} | UNKNOWN ACTION:`, action);
  }

  async function runActions(actor, actions) {
    for (const action of actions) {
      await runAction(actor, action);
    }
  }

  Hooks.on("preCreateChatMessage", async (_message, data) => {

    const natural = getNaturalFromChatData(data);

    if (![1, 20].includes(natural))
      return;

    const actor = getActorFromSpeaker(data?.speaker);
    if (!actor) 
      return;

    const context = activeAttacks.find(ctx =>
      !ctx.used &&
      ctx.actorId === actor.id
    );

    if (!context) 
      return;

    context.used = true;
    removeContext(context);

    const actions = natural === 1
      ? context.config.onRoll1
      : context.config.onRoll20;

    if (!actions.length)
      return;

    await runActions(actor, actions);
  });

  Hooks.on("updateCombat", async combat => {
    if (!combat?.started) return;

    for (const [key, timer] of conditionTimers.entries()) {
      if (combat.round < timer.endRound) continue;

      const actor = await fromUuid(timer.actorUuid).catch(() => null);
      if (actor)
        await actor.setCondition(timer.conditionName, false);

      conditionTimers.delete(key);
    }
  });

  patchWeaponActions();

  let attempts = 0;
  const retry = setInterval(() => {
    attempts += 1;

    const patched = patchWeaponActions();

    if (patched || attempts >= 20) clearInterval(retry);
  }, 500);

  window.sorOnRollDebug = {
    activeAttacks,
    patchWeaponActions,
    getOnRollConfigForSelectedWeapon: () => {
      const actor = game.user.character ?? canvas.tokens.controlled[0]?.actor;
      const item = actor?.items?.find(i => i.type === "weapon");
      if (!item) return console.warn(`${MODULE_ID} | No weapon found.`);
      return getOnRollConfig(item);
    }
  };
});