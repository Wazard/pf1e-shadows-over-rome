// PF1e Delayed Buffs
// File: delayed-buffs.js
// Version: v6.0-slim
// No chat cards. Deactivation never unarms. Only firing disarms.

(() => {
  "use strict";

  const MODULE = "pf1e-delayed-buffs";
  const SCOPE = "pf1e-shadows-over-rome";
  const DATA = "data";
  const DURATION_BACKUP = "delayedBuffOriginalDuration";
  const POLL_MS = 5000;

  const u = foundry?.utils ?? {};
  const get = (o, p) => u.getProperty?.(o, p) ?? globalThis.getProperty?.(o, p) ?? p.split(".").reduce((v, k) => v?.[k], o);
  const set = (o, p, v) => {
    if (u.setProperty) return u.setProperty(o, p, v);
    if (globalThis.setProperty) return globalThis.setProperty(o, p, v);
    const parts = p.split(".");
    let t = o;
    while (parts.length > 1) {
      const k = parts.shift();
      if (!t[k] || typeof t[k] !== "object") t[k] = {};
      t = t[k];
    }
    t[parts[0]] = v;
    return o;
  };
  const clone = v => u.duplicate?.(v) ?? globalThis.duplicate?.(v) ?? JSON.parse(JSON.stringify(v));
  const log = (...a) => console.log(`[${MODULE}]`, ...a);
  const warn = (...a) => console.warn(`[${MODULE}]`, ...a);
  const worldTime = () => Number(game.time?.worldTime ?? 0) || 0;
  const norm = s => String(s ?? "").trim().toLowerCase();

  function firstActiveGM() {
    if (!game.user?.isGM) return false;
    const gm = game.users.filter(x => x.active && x.isGM).sort((a, b) => a.id.localeCompare(b.id))[0];
    return gm?.id === game.user.id;
  }

  function isBuff(item) {
    return item?.documentName === "Item" && item.type === "buff";
  }

  function activePath(itemOrData) {
    for (const p of ["system.active", "data.active", "data.data.active"]) {
      if (get(itemOrData, p) !== undefined) return p;
    }
    return "system.active";
  }

  function isActive(item) {
    return get(item, activePath(item)) === true;
  }

  function activeUpdate(item, value) {
    const p = activePath(item);
    if (p.startsWith("data.data.")) return { [p.replace(/^data\.data\./, "data.")]: value };
    return { [p]: value };
  }

  function setActiveInData(data, value) {
    set(data, activePath(data), value);
  }

  function parseDelay(text) {
    const m = String(text ?? "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secondi|m|min|minuti|h|hr|ora|ore|d|day|giorni)$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (["s", "sec", "secondi"].includes(m[2])) return n;
    if (["m", "min", "minuti"].includes(m[2])) return n * 60;
    if (["h", "hr", "ora", "ore"].includes(m[2])) return n * 3600;
    return n * 86400;
  }

  function config(item) {
    const target = String(item.getFlag(SCOPE, "targetBuffRef") ?? item.getFlag(SCOPE, "targetBuffName") ?? "").trim();
    const delayText = String(item.getFlag(SCOPE, "delayText") ?? "").trim();
    const delay = parseDelay(delayText);
    const saveEnabled = item.getFlag(SCOPE, "saveEnabled") === true;
    const saveType = ["fort", "ref", "will"].includes(norm(item.getFlag(SCOPE, "saveType"))) ? norm(item.getFlag(SCOPE, "saveType")) : "fort";
    const saveDC = Number(item.getFlag(SCOPE, "saveDC") ?? 0);
    const onSave = item.getFlag(SCOPE, "saveSuccessEffect") === "halfDuration" ? "halfDuration" : "negates";
    return { target, delayText, delay, saveEnabled, saveType, saveDC, onSave, valid: !!target && !!delay && (!saveEnabled || saveDC > 0) };
  }

  function configured(item) {
    return isBuff(item) && !!String(item.getFlag(SCOPE, "targetBuffRef") ?? item.getFlag(SCOPE, "targetBuffName") ?? "").trim();
  }

  function state(item) {
    const v = item.getFlag(SCOPE, DATA);
    return v && typeof v === "object" ? v : {};
  }

  async function saveState(item, patch, replace = false) {
    await item.setFlag(SCOPE, DATA, replace ? patch : { ...state(item), ...patch });
    return item.parent?.items?.get(item.id) ?? item;
  }

  async function arm(item, cfg, reason) {
    const now = worldTime();
    return saveState(item, {
      armed: true,
      fired: false,
      firing: false,
      dueTime: now + cfg.delay,
      armedAt: now,
      targetBuffRef: cfg.target,
      delayText: cfg.delayText,
      delaySeconds: cfg.delay,
      saveEnabled: cfg.saveEnabled,
      saveType: cfg.saveType,
      saveDC: cfg.saveDC,
      saveSuccessEffect: cfg.onSave,
      reason
    }, true);
  }

  async function fired(item, details) {
    return saveState(item, {
      armed: false,
      fired: true,
      firing: false,
      dueTime: null,
      firedAt: worldTime(),
      lastFireDetails: details
    });
  }

  function actorOf(item) {
    return item?.parent?.documentName === "Actor" ? item.parent : item?.actor ?? null;
  }

  function actorsToScan() {
    const out = new Map();
    for (const a of game.actors?.contents ?? []) out.set(a.uuid ?? a.id, a);
    for (const t of canvas?.tokens?.placeables ?? []) if (t.actor) out.set(t.actor.uuid ?? `${t.scene?.id}.${t.id}`, t.actor);
    return [...out.values()];
  }

  function activationIn(changes) {
    return ["system.active", "data.active", "data.data.active"].some(p => get(changes, p) === true);
  }

  async function process(item, reason = "check", forcedActivation = false) {
    if (!firstActiveGM() || !configured(item)) return;

    const actor = actorOf(item);
    const cfg = config(item);
    if (!actor || !cfg.valid) return;

    const st = state(item);
    const due = Number(st.dueTime);

    if (st.firing) return;

    if (st.armed === true && Number.isFinite(due) && worldTime() >= due) {
      await fire(item, cfg, st, reason);
      return;
    }

    // Explicit activation can start a new cycle after a previous firing.
    if (forcedActivation && st.armed !== true) {
      await arm(item, cfg, reason);
      return;
    }

    if (!isActive(item)) return; // Do not touch flags on deactivation.

    // Avoid active + unarmed before firing. After firing, wait for a real activation event.
    if (st.armed !== true && st.fired !== true) await arm(item, cfg, reason);
  }

  async function checkAll() {
    if (!firstActiveGM() || globalThis.PF1eDelayedBuffs?._busy) return;
    globalThis.PF1eDelayedBuffs._busy = true;
    try {
      for (const actor of actorsToScan()) for (const item of actor.items ?? []) await process(item, "poll");
    } catch (e) {
      console.error(`[${MODULE}]`, e);
    } finally {
      globalThis.PF1eDelayedBuffs._busy = false;
    }
  }

  function saveBonus(actor, type) {
    const paths = [
      `system.attributes.savingThrows.${type}.total`,
      `system.attributes.savingThrows.${type}.mod`,
      `system.attributes.saves.${type}.total`,
      `system.attributes.saves.${type}.mod`,
      `data.data.attributes.savingThrows.${type}.total`,
      `data.data.attributes.savingThrows.${type}.mod`,
      `data.data.attributes.saves.${type}.total`,
      `data.data.attributes.saves.${type}.mod`
    ];
    for (const p of paths) {
      const n = Number(get(actor, p));
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function gmWhisperIds() {
    return game.users.filter(u => u.isGM).map(u => u.id);
  }

  async function saveMessages(actor, success) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `${actor.name} is feeling unwell`
    });

    if (success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: gmWhisperIds(),
        content: `${actor.name} passed roll`
      });
    }
  }

  async function rollSave(actor, cfg) {
    if (!cfg.saveEnabled) return { attempted: false, success: false };

    const formula = `1d20 + ${saveBonus(actor, cfg.saveType)}`;
    const roll = await new Roll(formula).evaluate({ async: true });

    const total = Number(roll.total);
    const dc = Number(cfg.saveDC);
    const success = total >= dc;

    console.warn(`[${MODULE}] DC SAVE ROLL`, {
      actor: actor.name,
      saveType: cfg.saveType,
      formula,
      total,
      dc,
      success,
      roll
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: game.users.filter(user => user.isGM).map(user => user.id),
      flavor: `${actor.name}: ${String(cfg.saveType).toUpperCase()} save vs DC ${dc}`,
      content: `${actor.name} rolled ${total} vs DC ${dc}`,
      rolls: [roll]
    });

    if (!success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `${actor.name} is feeling unwell`
      });
    }

    return {
      attempted: true,
      success,
      total,
      dc,
      saveType: cfg.saveType,
      effectOnSuccess: cfg.onSave
    };
  }

  async function fire(item, cfg, st, reason) {
    const due = Number(st.dueTime);
    if (!Number.isFinite(due) || worldTime() < due) return;

    let trigger = await saveState(item, { firing: true, lastFiringReason: reason });
    const actor = actorOf(trigger);
    if (!actor) return;

    try {
      const save = await rollSave(actor, cfg);
      if (save.success && cfg.onSave === "negates") {
        await fired(trigger, { outcome: "negated", save });
        return;
      }

      const half = save.success && cfg.onSave === "halfDuration";
      const target = await applyTarget(actor, cfg.target, half);
      await fired(trigger, {
        outcome: target ? "applied" : "target-not-found",
        targetItemId: target?.id ?? null,
        targetItemName: target?.name ?? null,
        halfDuration: half,
        save
      });
    } catch (e) {
      await saveState(trigger, { firing: false, lastError: String(e?.message ?? e) });
      throw e;
    }
  }

  function actorBuffs(actor, name) {
    const wanted = norm(name);
    return [...(actor.items ?? [])].filter(i => i.type === "buff" && norm(i.name) === wanted);
  }

  async function uuidItem(ref) {
    if (!String(ref).includes(".")) return null;
    try {
      const doc = await fromUuid(String(ref).trim());
      return doc?.documentName === "Item" ? doc : null;
    } catch {
      return null;
    }
  }

  async function libraryItem(name) {
    const wanted = norm(name);
    const world = game.items?.find(i => i.type === "buff" && norm(i.name) === wanted);
    if (world) return world;

    for (const pack of game.packs ?? []) {
      if (pack.documentName !== "Item") continue;
      try {
        if (!pack.index?.size) await pack.getIndex({ fields: ["name", "type"] });
        const hit = pack.index.find(i => norm(i.name) === wanted && (!i.type || i.type === "buff"));
        if (hit) return await pack.getDocument(hit._id);
      } catch (e) {
        warn(`Cannot search compendium ${pack.collection}`, e);
      }
    }
    return null;
  }

  async function resolveTarget(actor, ref) {
    const byUuid = await uuidItem(ref);
    const name = byUuid?.name ?? ref;
    const existing = actorBuffs(actor, name)[0];
    if (existing) return { existing, source: byUuid ?? existing, name: existing.name };
    return { existing: null, source: byUuid ?? await libraryItem(ref), name };
  }

  const durationPaths = [
    "system.duration.value", "system.duration", "system.time.value", "system.time.duration",
    "data.duration.value", "data.duration", "data.time.value", "data.time.duration",
    "data.data.duration.value", "data.data.duration", "data.data.time.value", "data.data.time.duration"
  ];

  function foundDurations(obj) {
    return durationPaths
      .map(p => [p, Number(get(obj, p))])
      .filter(([, n]) => Number.isFinite(n) && n > 0);
  }

  function updatePath(p) {
    return p.startsWith("data.data.") ? p.replace(/^data\.data\./, "data.") : p;
  }

  function halveDurationsOnData(data) {
    let changed = false;
    for (const [p, n] of foundDurations(data)) {
      set(data, p, Math.max(1, Math.ceil(n / 2)));
      changed = true;
    }
    return changed;
  }

  async function prepareDuration(item, half) {
    const backup = item.getFlag(SCOPE, DURATION_BACKUP);

    if (half) {
      if (!backup) await item.setFlag(SCOPE, DURATION_BACKUP, Object.fromEntries(foundDurations(item)));
      const update = Object.fromEntries(foundDurations(item).map(([p, n]) => [updatePath(p), Math.max(1, Math.ceil(n / 2))]));
      if (Object.keys(update).length) await item.update(update);
      return item.parent?.items?.get(item.id) ?? item;
    }

    if (backup && typeof backup === "object") {
      await item.update(Object.fromEntries(Object.entries(backup).map(([p, n]) => [updatePath(p), n])));
      const fresh = item.parent?.items?.get(item.id) ?? item;
      await fresh.unsetFlag(SCOPE, DURATION_BACKUP);
      return fresh.parent?.items?.get(fresh.id) ?? fresh;
    }

    return item;
  }

  async function activateItem(item) {
    if (!isActive(item)) await item.update(activeUpdate(item, true));
    return item.parent?.items?.get(item.id) ?? item;
  }

  async function deleteActiveDuplicates(actor, name, keepId) {
    const active = actorBuffs(actor, name).filter(isActive);
    if (active.length <= 1) return;
    const keep = active.find(i => i.id === keepId) ?? active[0];
    await actor.deleteEmbeddedDocuments("Item", active.filter(i => i.id !== keep.id).map(i => i.id));
  }

  async function applyTarget(actor, ref, half) {
    const resolved = await resolveTarget(actor, ref);
    if (!resolved?.source) return null;

    let item = resolved.existing;
    if (item) {
      item = await prepareDuration(item, half);
      item = await activateItem(item);
      await deleteActiveDuplicates(actor, item.name, item.id);
      return actor.items.get(item.id) ?? item;
    }

    const data = resolved.source.toObject ? resolved.source.toObject() : clone(resolved.source);
    delete data._id;
    setActiveInData(data, true);
    if (half) halveDurationsOnData(data);

    item = (await actor.createEmbeddedDocuments("Item", [data]))?.[0] ?? null;
    if (item) await deleteActiveDuplicates(actor, item.name, item.id);
    return item;
  }

  Hooks.once("ready", async () => {
    if (globalThis.PF1eDelayedBuffs?.loaded) return warn("Already loaded; skipping duplicate hooks.");

    globalThis.PF1eDelayedBuffs = { loaded: true, version: "v6.0-slim", checkAll, process, _busy: false };

    Hooks.on("createItem", item => process(item, "createItem", isActive(item)));
    Hooks.on("updateItem", (item, changes) => process(item, "updateItem", activationIn(changes)));
    Hooks.on("updateWorldTime", checkAll);

    setInterval(checkAll, POLL_MS);
    await checkAll();
    log("Ready.");
  });
})();
