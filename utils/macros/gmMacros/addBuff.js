// Add Buff Script Call to Open PF1e Item
// v5: script-call name defaults to the open item name; hidden defaults to true.
// v4: does NOT use pf1.components.ItemScriptCall.create.
// It writes directly to system.scriptCalls to avoid the e.map error.
//
// Opens Advanced tab, asks for a buff, duration, unit, and script-call placement,
// then adds a PF1e script call to the currently open item.
//
// Default compendium search: "Shadows over Rome - Buffs"
//
// Runtime public message:
// @actor used @item. Its effect has been applied for @duration

const DEFAULT_COMPENDIUM = "Shadows over Rome - Buffs";

const FALLBACK_PLACEMENTS = [
  { id: "use", label: "Use", itemTypes: ["attack", "buff", "feat", "loot", "equipment", "implant", "consumable", "spell", "weapon"] },
  { id: "postUse", label: "Post-Use", itemTypes: ["attack", "buff", "feat", "loot", "equipment", "implant", "consumable", "spell", "weapon"] },
  { id: "equip", label: "Equip", itemTypes: ["weapon", "equipment", "loot"] },
  { id: "implant", label: "Implant", itemTypes: ["implant"] },
  { id: "toggle", label: "Toggle", itemTypes: ["buff", "feat"] },
  { id: "changeQuantity", label: "Change Quantity", itemTypes: ["loot", "equipment", "weapon", "implant", "consumable", "container"] },
  { id: "changeLevel", label: "Change Level", itemTypes: ["buff", "class"] }
];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getOpenItemSheet() {
  return Object.values(ui.windows)
    .reverse()
    .find(app => {
      const doc = app.document ?? app.object;
      return doc?.documentName === "Item";
    });
}

function getOpenItem() {
  const sheet = getOpenItemSheet();
  return sheet?.document ?? sheet?.object ?? null;
}

function openAdvancedTab(sheet) {
  const root = sheet?.element?.[0] ?? sheet?.element;
  if (!root) return;

  for (const selector of ['[data-tab="advanced"]', 'a[href="#advanced"]', '.tabs [data-tab="advanced"]']) {
    const node = root.querySelector?.(selector);
    if (node) {
      node.click();
      return;
    }
  }
}

function localized(value) {
  const text = String(value ?? "");
  if (!text) return "";
  return game.i18n.localize(text) || text;
}

function collectPlacementsFromRegistry(item) {
  const registry = globalThis.pf1?.registry?.scriptCalls;
  const raw = registry?.toObject?.(false) ?? registry?.contents ?? registry?.entries ?? null;
  if (!raw) return [];

  const entries = raw instanceof Map
    ? Array.from(raw.entries())
    : Object.entries(raw);

  return entries
    .map(([key, value]) => {
      const id = value?._id ?? value?.id ?? key;
      const itemTypes = Array.from(value?.itemTypes ?? []);
      const label = localized(value?.name) || id;
      return { id, label, itemTypes };
    })
    .filter(p => p.id && (!p.itemTypes.length || p.itemTypes.includes(item.type)));
}

function collectPlacementsFromVisibleSheet(item) {
  const sheet = getOpenItemSheet();
  const root = sheet?.element?.[0] ?? sheet?.element;
  if (!root) return [];

  const text = root.innerText ?? "";
  const found = [];

  for (const p of FALLBACK_PLACEMENTS) {
    if (!p.itemTypes.includes(item.type)) continue;
    const escapedLabel = p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escapedLabel}\\b`, "i").test(text)) found.push(p);
  }

  return found;
}

function getScriptCallPlacements(item) {
  const byId = new Map();

  for (const p of collectPlacementsFromRegistry(item)) byId.set(p.id, p);
  for (const p of collectPlacementsFromVisibleSheet(item)) byId.set(p.id, p);

  if (!byId.size) {
    for (const p of FALLBACK_PLACEMENTS) {
      if (p.itemTypes.includes(item.type)) byId.set(p.id, p);
    }
  }

  return Array.from(byId.values());
}

function splitCompendia(text) {
  return String(text ?? "")
    .split(/[;\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function buildRuntimeScript({ buffQuery, durationFormula, durationUnit, compendia }) {
  return `
(async () => {
  const BUFF_QUERY = ${JSON.stringify(buffQuery)};
  const DURATION_FORMULA = ${JSON.stringify(durationFormula)};
  const DURATION_UNIT = ${JSON.stringify(durationUnit)};
  const COMPENDIA = ${JSON.stringify(compendia)};

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

    if (/^\\d+$/.test(formula)) {
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
    ui.notifications.warn(\`Buff not found: \${BUFF_QUERY}\`);
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

  const durationText = \`\${durationString} \${DURATION_UNIT}\`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    content: \`<strong>\${html(targetActor.name)}</strong> used \${html(sourceItemName)}. Its effect has been applied for \${html(durationText)}.\`
  });
})();
`.trim();
}

async function addScriptCall(item, callData) {
  const source = item.toObject();
  const current = foundry.utils.deepClone(source.system?.scriptCalls ?? []);

  current.push({
    _id: foundry.utils.randomID(16),
    name: callData.name,
    type: callData.type,
    category: callData.category,
    value: callData.value,
    img: callData.img,
    hidden: callData.hidden
  });

  return await item.update({ "system.scriptCalls": current });
}

const item = getOpenItem();
const sheet = getOpenItemSheet();

if (!item) {
  return ui.notifications.warn("Open the item sheet first.");
}

openAdvancedTab(sheet);

const placements = getScriptCallPlacements(item);

if (!placements.length) {
  return ui.notifications.warn(`No script-call placements found for item type "${item.type}".`);
}

const placementOptions = placements
  .map(p => `<option value="${esc(p.id)}">${esc(p.label)} (${esc(p.id)})</option>`)
  .join("");

new Dialog({
  title: `Add Buff Script Call: ${item.name}`,
  content: `
    <form>
      <div class="form-group">
        <label>Buff name or UUID</label>
        <input type="text" name="buffQuery" value="${esc(item.name)}" required>
      </div>

      <div class="form-group">
        <label>Duration formula</label>
        <input type="text" name="durationFormula" value="1" required>
      </div>

      <div class="form-group">
        <label>Duration unit</label>
        <select name="durationUnit">
          <option value="round">round</option>
          <option value="minute">minute</option>
          <option value="hour">hour</option>
          <option value="day">day</option>
          <option value="perm">perm</option>
        </select>
      </div>

      <div class="form-group">
        <label>Script call placement</label>
        <select name="placement">
          ${placementOptions}
        </select>
      </div>

      <hr>

      <div class="form-group">
        <label>
          <input type="checkbox" name="addExtraCompendia">
          Add more compendia
        </label>
      </div>

      <div class="form-group">
        <label>Extra compendia</label>
        <textarea name="extraCompendia" rows="3" placeholder="One per line, or separated by ; / ,"></textarea>
        <p style="font-size: 12px; opacity: 0.75;">
          Default search always includes: ${esc(DEFAULT_COMPENDIUM)}
        </p>
      </div>
    </form>
  `,
  buttons: {
    add: {
      icon: '<i class="fas fa-save"></i>',
      label: "Add Script Call",
      callback: async html => {
        const form = html[0].querySelector("form");
        const data = new FormData(form);

        const buffQuery = String(data.get("buffQuery") ?? "").trim();
        const durationFormula = String(data.get("durationFormula") ?? "1").trim();
        const durationUnit = String(data.get("durationUnit") ?? "round").trim();
        const placement = String(data.get("placement") ?? "").trim();

        const addExtra = data.get("addExtraCompendia") === "on";
        const extraCompendia = addExtra ? splitCompendia(data.get("extraCompendia")) : [];
        const compendia = [DEFAULT_COMPENDIUM, ...extraCompendia];

        if (!buffQuery) return ui.notifications.warn("Insert the buff name or UUID.");
        if (!durationFormula) return ui.notifications.warn("Insert a duration formula.");
        if (!placement) return ui.notifications.warn("Select a script-call placement.");

        const script = buildRuntimeScript({
          buffQuery,
          durationFormula,
          durationUnit,
          compendia
        });

        await addScriptCall(item, {
          name: item.name,
          type: "script",
          category: placement,
          value: script,
          img: "icons/svg/aura.svg",
          hidden: true
        });

        ui.notifications.info(`${item.name}: buff script call added to ${placement}.`);
        item.sheet?.render?.(true);
      }
    },

    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Cancel"
    }
  },
  default: "add"
}).render(true);