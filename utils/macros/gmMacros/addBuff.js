// Add Buff Script Call to Open PF1e Item
// v6: duration is taken from the buff item itself; buff field supports dropped item UUIDs.
// v5: script-call name defaults to the open item name; hidden defaults to true.
// v4: does NOT use pf1.components.ItemScriptCall.create.
// It writes directly to system.scriptCalls to avoid the e.map error.
//
// Opens Advanced tab, asks for a buff and script-call placement,
// then adds a PF1e script call to the currently open item.
//
// Default compendium search: "Shadows over Rome - Buffs"
//
// Runtime public message:
// @actor used @item. Its effect has been applied.

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

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
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
  const text = String(value ?? "").trim();
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
      const id = value?.id ?? value?._id ?? key;
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
  const byId = new Map([
    ...collectPlacementsFromRegistry(item).map(p => [p.id, p]),
    ...collectPlacementsFromVisibleSheet(item).map(p => [p.id, p])
  ]);

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

function getFormValues(html) {
  const form = html[0].querySelector("form");
  const data = new FormData(form);
  const extraCompendia = data.get("addExtraCompendia") === "on"
    ? splitCompendia(data.get("extraCompendia"))
    : [];

  return {
    buffQuery: String(data.get("buffQuery") ?? "").trim(),
    placement: String(data.get("placement") ?? "").trim(),
    compendia: [DEFAULT_COMPENDIUM, ...extraCompendia]
  };
}

function getDropData(event) {
  const raw = event.dataTransfer?.getData("text/plain");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getDroppedItemUuid(data) {
  const uuid = data?.uuid ?? data?.documentUuid;
  if (uuid) return uuid;
  if (data?.type !== "Item" || !data?.id) return "";

  const item = await Item.fromDropData(data).catch(() => null);
  return item?.uuid ?? "";
}

function activateBuffDrop(input) {
  input.addEventListener("dragover", event => event.preventDefault());
  input.addEventListener("drop", async event => {
    event.preventDefault();

    const uuid = await getDroppedItemUuid(getDropData(event));
    if (uuid) input.value = uuid;
  });
}

function buildRuntimeScript({ buffQuery, compendia }) {
  return `
(async () => {
  const BUFF_REF = ${JSON.stringify(buffQuery)};
  const COMPENDIA = new Set(${JSON.stringify(compendia.map(norm))});

  const norm = value => String(value ?? "").trim().toLowerCase();
  const html = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  function getSourceItem() {
    if (typeof item !== "undefined" && item) return item;
    if (typeof shared !== "undefined" && shared?.item) return shared.item;
    if (typeof this !== "undefined" && this?.item) return this.item;
    return null;
  }

  function getTargetActor(sourceItem) {
    if (sourceItem?.actor) return sourceItem.actor;
    if (typeof actor !== "undefined" && actor) return actor;
    if (typeof shared !== "undefined" && shared?.actor) return shared.actor;
    return canvas.tokens.controlled[0]?.actor ?? game.user.character ?? null;
  }

  function parseRef(query) {
    const text = String(query ?? "").trim();
    const match = text.match(/@UUID\\[([^\\]]+)\\]/);
    return match?.[1] ?? text;
  }

  function findOwnedBuff(actor, name) {
    const wanted = norm(name);
    if (!wanted) return null;
    return actor.items.find(i => i.type === "buff" && norm(i.name) === wanted) ?? null;
  }

  async function findBuffTemplate(ref) {
    const parsedRef = parseRef(ref);
    const direct = await fromUuid(parsedRef).catch(() => null);

    if (direct?.documentName === "Item" && direct.type === "buff") return direct;

    const wanted = norm(parsedRef);
    if (!wanted) return null;

    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;

      const labels = new Set([
        pack.collection,
        pack.metadata?.label,
        pack.title
      ].map(norm).filter(Boolean));

      if (![...labels].some(label => COMPENDIA.has(label))) continue;

      const index = await pack.getIndex({ fields: ["name", "type"] });
      const hit = index.find(e => norm(e.name) === wanted && (!e.type || e.type === "buff"));

      if (hit) return await pack.getDocument(hit._id);
    }

    return null;
  }

  async function createBuff(actor, template) {
    const data = template.toObject();
    data.system ??= {};
    data.system.active = true;
    data.system.disabled = false;
    return (await actor.createEmbeddedDocuments("Item", [data]))[0] ?? null;
  }

  async function activateBuff(buff) {
    if (typeof buff.setActive === "function") {
      await buff.setActive(true).catch(() => null);
    }

    if (buff.system?.active !== true || buff.system?.disabled !== false) {
      await buff.update({
        "system.active": true,
        "system.disabled": false
      });
    }
  }

  const sourceItem = getSourceItem();
  const targetActor = getTargetActor(sourceItem);

  if (!targetActor) {
    ui.notifications.warn("No actor found for buff application.");
    return;
  }

  let buff = findOwnedBuff(targetActor, parseRef(BUFF_REF));

  if (!buff) {
    const template = await findBuffTemplate(BUFF_REF);

    if (!template) {
      ui.notifications.warn(\`Buff not found: \${BUFF_REF}\`);
      return;
    }

    buff = findOwnedBuff(targetActor, template.name) ?? await createBuff(targetActor, template);
  }

  if (!buff) {
    ui.notifications.warn(\`Could not apply buff: \${BUFF_REF}\`);
    return;
  }

  await activateBuff(buff);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    content: \`<strong>\${html(targetActor.name)}</strong> used \${html(sourceItem?.name ?? "Unknown Item")}. Its effect has been applied.\`
  });
})();
`.trim();
}

async function addScriptCall(item, callData) {
  const current = foundry.utils.deepClone(item.system?.scriptCalls ?? []);

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
        <p style="font-size: 12px; opacity: 0.75;">
          Drag a buff item here to use its UUID, or keep the exact buff name.
        </p>
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
        const { buffQuery, placement, compendia } = getFormValues(html);

        if (!buffQuery) return ui.notifications.warn("Insert the buff name or UUID.");
        if (!placement) return ui.notifications.warn("Select a script-call placement.");

        const script = buildRuntimeScript({
          buffQuery,
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
  default: "add",
  render: html => {
    const input = html[0]?.querySelector?.('input[name="buffQuery"]');
    if (input) activateBuffDrop(input);
  }
}).render(true);
