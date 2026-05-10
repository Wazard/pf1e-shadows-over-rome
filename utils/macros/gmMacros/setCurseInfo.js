// PF1e - Set Curse Info on Open Item
// Apri la scheda item, poi lancia questa macro.
// Salva informazioni di maledizione nei flags custom.

const FLAG_SCOPE = "world";

const itemSheet = Object.values(ui.windows)
  .reverse()
  .find(app => app.document?.documentName === "Item" || app.object?.documentName === "Item");

const item = itemSheet?.document ?? itemSheet?.object;

if (!item) {
  return ui.notifications.warn("Apri prima la scheda dell'item.");
}

const currentIsCursed = item.getFlag(FLAG_SCOPE, "isCursed") === true;
const currentCurseDescription = item.getFlag(FLAG_SCOPE, "curseDescription") ?? "";
const currentCurseDcBonus = item.getFlag(FLAG_SCOPE, "curseDcBonus") ?? 10;

new Dialog({
  title: `Maledizione: ${item.name}`,
  content: `
    <form>
      <div class="form-group">
        <label>
          <input type="checkbox" name="isCursed" ${currentIsCursed ? "checked" : ""}>
          Oggetto maledetto
        </label>
      </div>

      <div class="form-group">
        <label>Bonus CD maledizione</label>
        <input type="number" name="curseDcBonus" value="${currentCurseDcBonus}">
      </div>

      <div class="form-group">
        <label>Descrizione maledizione</label>
        <textarea name="curseDescription" rows="6">${currentCurseDescription}</textarea>
      </div>
    </form>
  `,
  buttons: {
    save: {
      icon: '<i class="fas fa-save"></i>',
      label: "Salva",
      callback: async html => {
        const form = html[0].querySelector("form");
        const data = new FormData(form);

        const isCursed = data.get("isCursed") === "on";
        const curseDcBonus = Number(data.get("curseDcBonus") ?? 10);
        const curseDescription = String(data.get("curseDescription") ?? "").trim();

        await item.setFlag(FLAG_SCOPE, "isCursed", isCursed);
        await item.setFlag(FLAG_SCOPE, "curseDcBonus", Number.isFinite(curseDcBonus) ? curseDcBonus : 10);
        await item.setFlag(FLAG_SCOPE, "curseDescription", curseDescription);

        ui.notifications.info(`${item.name}: dati maledizione salvati.`);
      }
    },
    clear: {
      icon: '<i class="fas fa-trash"></i>',
      label: "Rimuovi maledizione",
      callback: async () => {
        await item.unsetFlag(FLAG_SCOPE, "isCursed");
        await item.unsetFlag(FLAG_SCOPE, "curseDcBonus");
        await item.unsetFlag(FLAG_SCOPE, "curseDescription");

        ui.notifications.info(`${item.name}: dati maledizione rimossi.`);
      }
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Annulla"
    }
  },
  default: "save"
}).render(true);