// PF1e Neck Item HP Trigger Buffs
// Checks equipped neck items for Dictionary Flags:
//
// onFullHP  = apply_BuffName
// onHalfHP  = apply_BuffName
// onThirdHP = apply_BuffName
// on0HP     = apply_BuffName
// on5HP     = apply_BuffName
// on12HP    = apply_BuffName
//
// Buffs are searched in compendium:
// "Shadows Over Rome - Buffs"

Hooks.once("ready", () => {
  const COMPENDIUM_LABEL = "Shadows Over Rome - Buffs";
  const DEBUG = false;

  const activeHpTriggers = new Map();

  function log(...args) {
    if (DEBUG) console.warn("SOR Neck HP Triggers |", ...args);
  }

  function getHp(actor) {
    return {
      value: Number(actor.system?.attributes?.hp?.value ?? 0),
      max: Number(actor.system?.attributes?.hp?.max ?? 0)
    };
  }

  function getTriggerValue(triggerKey) {
    const match = String(triggerKey ?? "").match(/^on(.+)HP$/i);
    if (!match) return null;

    return match[1].trim().toLowerCase();
  }

  function shouldTriggerAtHp(actor, triggerKey) {
    const hp = getHp(actor);
    const value = getTriggerValue(triggerKey);
    
    if (!value) return false;

    const number = Number(value);

    if (Number.isFinite(number)) {
      return hp.value <= number;
    }

    if (hp.max <= 0 || hp.value <=0) return false;

    if (value === "full") {
      hp.value >= hp.max;
    }

    if (value === "half") {
      hp.value <= Math.floor(hp.max / 2);
    }

    if (value === "third") {
      hp.value <= Math.floor(hp.max / 3);
    }

    return false;
  }

  function isEquippedNeckItem(item) {
    if (!item) return false;
  
    if (!String(item.system?.slot ?? "").toLowerCase().includes("neck")) return false;
    
    if (!item.system?.carried) return false;
    if (!item.system?.equipped) return false;

    return true;
  }

  function getDictionaryFlags(item) {
    return item.system?.flags?.dictionary ?? {};
  }

  function getMatchingNeckTriggers(actor) {
    const matches = [];

    for (const item of actor.items) {
      if (!isEquippedNeckItem(item)) continue;

      const dictionary = getDictionaryFlags(item);

      for (const [key, value] of Object.entries(dictionary)) {
        if (!/^on.+HP$/i.test(key)) continue;
        if (!shouldTriggerAtHp(actor, key)) continue;

        matches.push({
          id: `${item.id}.${key}`,
          item,
          triggerKey: key,
          value
        });
      }
    }

    return matches;
  }

  function parseActions(value) {
    return String(value ?? "")
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  async function findBuffByName(buffName) {
    const wanted = String(buffName ?? "").trim().toLowerCase();
    if (!wanted) return null;

    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;

      const labels = [
        pack.collection,
        pack.metadata?.label,
        pack.title
      ]
        .map(v => String(v ?? "").trim().toLowerCase())
        .filter(Boolean);

      if (!labels.includes(COMPENDIUM_LABEL.toLowerCase())) continue;

      const index = await pack.getIndex({ fields: ["name", "type"] });
      const hit = index.find(entry =>
        String(entry.name ?? "").trim().toLowerCase() === wanted &&
        (!entry.type || entry.type === "buff")
      );

      if (hit) return await pack.getDocument(hit._id);
    }

    return null;
  }

  async function activateBuff(buff) {
    await buff.update({
      "system.active": true,
      "system.disabled": false
    }).catch(() => {});

    if (typeof buff.setActive === "function") {
      await buff.setActive(true).catch(() => {});
    }
  }

  async function applyBuff(actor, buffName) {
    const template = await findBuffByName(buffName);

    if (!template) {
      ui.notifications.warn(`Buff not found in ${COMPENDIUM_LABEL}: ${buffName}`);
      return;
    }

    const existing = actor.items.find(item =>
      item.type === "buff" &&
      item.name.trim().toLowerCase() === template.name.trim().toLowerCase()
    );

    if (existing) {
      await activateBuff(existing);
      return;
    }

    const data = template.toObject();

    data.system ??= {};
    data.system.active = true;
    data.system.disabled = false;

    const created = await actor.createEmbeddedDocuments("Item", [data]);
    if (created[0]) await activateBuff(created[0]);
  }

  async function runAction(actor, action) {
    const match = String(action).match(/^apply_(.+)$/i);
    if (!match) return;

    const buffName = match[1].trim();
    await applyBuff(actor, buffName);
  }
  function getUsesInfo(item) {
    const valueRaw = foundry.utils.getProperty(item, "system.uses.value");
    const maxRaw = foundry.utils.getProperty(item, "system.uses.max");

    const value = Number(valueRaw);
    const max = Number(maxRaw);

    const hasFiniteCharges =
      Number.isFinite(max) && max > 0;

    return {
      hasFiniteCharges,
      value: Number.isFinite(value) ? value : 0
    };
  }

  async function consumeOneChargeIfNeeded(item) {
    const uses = getUsesInfo(item);

    // No charge system / max charges = 0 means infinite uses.
    if (!uses.hasFiniteCharges) return true;

    // Has charges, but none available.
    if (uses.value <= 0) return false;

    await item.update({
      "system.uses.value": uses.value - 1
    });

    return true;
  }

  async function runTrigger(actor, trigger) {
    const actions = parseActions(trigger.value);

    log("Trigger:", {
      actor: actor.name,
      item: trigger.item.name,
      triggerKey: trigger.triggerKey,
      actions
    });

    if (!actions.length) return;

    const canUse = await consumeOneChargeIfNeeded(trigger.item);
    if (!canUse) {
      log("Trigger skipped: item has no charges left.", {
        actor: actor.name,
        item: trigger.item.name,
        triggerKey: trigger.triggerKey
      });
      return;
    }

    for (const action of actions) {
      await runAction(actor, action);
    }
  }

  for (const actor of game.actors) {
    const matching = getMatchingNeckTriggers(actor).map(t => t.id);
    activeHpTriggers.set(actor.id, new Set(matching));
  }

  Hooks.on("updateActor", async actor => {
    if (!actor.hasPlayerOwner) return;

    const oldTriggers = activeHpTriggers.get(actor.id) ?? new Set();
    const matchingTriggers = getMatchingNeckTriggers(actor);

    const newTriggerIds = new Set(matchingTriggers.map(t => t.id));
    activeHpTriggers.set(actor.id, newTriggerIds);

    for (const trigger of matchingTriggers) {
      if (oldTriggers.has(trigger.id)) continue;

      await runTrigger(actor, trigger);
    }
  });
});