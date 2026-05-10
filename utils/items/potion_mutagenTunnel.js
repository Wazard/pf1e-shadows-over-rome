(async () => {
  const BUFF_QUERY = "Mutageno del Tunnel";
  const DURATION_FORMULA = "1";
  const DURATION_UNIT = "perm";
  const COMPENDIA = ["Shadows over Rome - Buffs"];

  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function getSourceItem() {
    if (typeof item !== "undefined" && item) return item;
    if (typeof shared !== "undefined" && shared?.item) return shared.item;
    if (typeof this !== "undefined" && this?.item) return this.item;
    return null;
  }

  function getTargetActor(sourceItem) {
    // Preferred behavior: use the player's assigned character first.
    if (game.user.character) return game.user.character;

    // Then fall back to the actor owning the item.
    if (sourceItem?.actor) return sourceItem.actor;

    if (typeof actor !== "undefined" && actor) return actor;
    if (typeof shared !== "undefined" && shared?.actor) return shared.actor;

    return canvas.tokens.controlled[0]?.actor ?? null;
  }

  async function findBuff(query) {
    const direct = await fromUuid(query).catch(() => null);
    if (direct) return direct;

    const wanted = String(query ?? "").trim().toLowerCase();

    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;

      const labels = [
        pack.collection,
        pack.metadata?.label,
        pack.title
      ].map(v => String(v ?? "").trim()).filter(Boolean);

      const matchesCompendium = labels.some(label =>
        COMPENDIA.some(c => label.toLowerCase() === c.toLowerCase())
      );

      if (!matchesCompendium) continue;

      const index = await pack.getIndex({ fields: ["name", "type"] });

      const hit = index.find(e =>
        String(e.name ?? "").trim().toLowerCase() === wanted &&
        (!e.type || e.type === "buff")
      );

      if (hit) return await pack.getDocument(hit._id);
    }

    return null;
  }

  async function rollDuration(actor, sourceItem) {
    const formula = String(DURATION_FORMULA || "1").trim();

    if (/^\d+$/.test(formula)) {
      return Math.max(0, Math.floor(Number(formula) || 0));
    }

    const rollData = actor?.getRollData?.() ?? {};
    rollData.item = sourceItem?.getRollData?.() ?? sourceItem?.system ?? {};

    const roll = await new Roll(formula, rollData).evaluate({ async: true });
    return Math.max(0, Math.floor(Number(roll.total) || 0));
  }

  async function activateBuff(buff, durationValue) {
    // IMPORTANT:
    // PF1e expects duration.value to be a roll formula/string.
    // Do NOT save it as a number, or ItemBuffPF will crash during prepareData.
    const durationString = String(durationValue ?? 0);

    const updateData = {
      "system.duration.value": durationString,
      "system.duration.units": DURATION_UNIT,
      "system.active": true,
      "system.disabled": false
    };

    await buff.update(updateData).catch(async err => {
      console.warn("Buff duration update failed, trying activation-only update.", err);

      await buff.update({
        "system.active": true,
        "system.disabled": false
      });
    });

    if (typeof buff.setActive === "function") {
      await buff.setActive(true).catch(err => {
        console.warn("buff.setActive(true) failed.", err);
      });
    }
  }

  const sourceItem = getSourceItem();
  const targetActor = getTargetActor(sourceItem);

  if (!targetActor) {
    ui.notifications.warn("No actor found for buff application.");
    return;
  }

  const sourceItemName = sourceItem?.name ?? "Unknown Item";
  const buffTemplate = await findBuff(BUFF_QUERY);

  if (!buffTemplate) {
    ui.notifications.warn(`Buff not found: ${BUFF_QUERY}`);
    return;
  }

  const durationValue = await rollDuration(targetActor, sourceItem);
  const durationString = String(durationValue ?? 0);

  const wantedName = buffTemplate.name.trim().toLowerCase();

  let appliedBuff = targetActor.items.find(i =>
    i.type === "buff" &&
    i.name.trim().toLowerCase() === wantedName
  );

  if (!appliedBuff) {
    const data = buffTemplate.toObject();

    data.system ??= {};
    data.system.duration ??= {};

    // IMPORTANT: string, not number.
    data.system.duration.value = durationString;
    data.system.duration.units = DURATION_UNIT;
    data.system.active = true;
    data.system.disabled = false;

    const created = await targetActor.createEmbeddedDocuments("Item", [data]);
    appliedBuff = created[0];
  }

  await activateBuff(appliedBuff, durationString);

  const durationText = `${durationString} ${DURATION_UNIT}`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    content: `<strong>${html(targetActor.name)}</strong> used ${html(sourceItemName)}. Its effect has been applied for ${html(durationText)}.`
  });
})();