// Macro PF1e: Set Unid. Price = Price * 1.25
// Usa l'item attualmente aperto in una Item Sheet.

const MULTIPLIER = 1.25;

const PRICE_PATH = "system.price";
const UNID_PRICE_PATH = "system.unidentified.price";

function parsePrice(value) {
  if (value == null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "object") {
    if (typeof value.value === "number") return value.value;
    if (typeof value.amount === "number") return value.amount;
    return null;
  }

  const text = String(value)
    .trim()
    .toLowerCase()
    .replaceAll(",", "")
    .replace(/\s*gp|\s*mo|\s*gold|\s*gold pieces/g, "");

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function roundPrice(value) {
  return Math.round(value * 100) / 100;
}

const itemSheet = Object.values(ui.windows)
  .reverse()
  .find(app => app.document?.documentName === "Item" || app.object?.documentName === "Item");

const item = itemSheet?.document ?? itemSheet?.object;

if (!item) {
  return ui.notifications.warn("Apri prima la scheda dell'item da modificare.");
}

const rawPrice = foundry.utils.getProperty(item, PRICE_PATH);
const price = parsePrice(rawPrice);

if (price == null || price <= 0) {
  return ui.notifications.warn(`${item.name} non ha un Price valido.`);
}

const unidPrice = roundPrice(price * MULTIPLIER);

await item.update({
  [UNID_PRICE_PATH]: unidPrice
});

ui.notifications.info(`${item.name}: Unid. Price impostato a ${unidPrice} gp.`);
console.log(`Updated ${item.name}: Price ${price} → Unid. Price ${unidPrice}`);