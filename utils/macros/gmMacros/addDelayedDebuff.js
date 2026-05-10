// Configure Delayed Buff Flags on open item/buff
// File: configure-delayed-buff-macro.js
//
// Uso:
// 1. Apri la scheda del buff iniziale dal compendium, dall'Actor o dalla sidebar Items.
// 2. Lancia questa macro.
// 3. Inserisci nome o UUID del buff finale, ritardo, ed eventuale TS.
//
// Esempio:
// Buff iniziale: Elisir Della Voce Rubata
// Buff finale: Voce Rubata oppure UUID del buff finale
// Ritardo: 1h
// TS opzionale: Will CD 15, successo = nega oppure dimezza durata.

const FLAG_SCOPE = "pf1e-shadows-over-rome";
const DATA_KEY = "data";

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseDelayToSeconds(text) {
  const value = String(text ?? "").trim().toLowerCase();

  const match = value.match(/^(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|secondi|m|min|minute|minutes|minuti|h|hr|hour|hours|ora|ore|d|day|days|giorno|giorni)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (["s", "sec", "second", "seconds", "secondi"].includes(unit)) return amount;
  if (["m", "min", "minute", "minutes", "minuti"].includes(unit)) return amount * 60;
  if (["h", "hr", "hour", "hours", "ora", "ore"].includes(unit)) return amount * 60 * 60;
  if (["d", "day", "days", "giorno", "giorni"].includes(unit)) return amount * 24 * 60 * 60;

  return null;
}

function getTopmostOpenItem() {
  return Object.values(ui.windows)
    .reverse()
    .map(app => app.document ?? app.object)
    .find(document => document?.documentName === "Item") ?? null;
}

const item = getTopmostOpenItem();

if (!item) {
  return ui.notifications.warn("Apri prima la scheda del buff iniziale.");
}

if (item.type !== "buff") {
  ui.notifications.warn(`${item.name} non è un Buff. Puoi salvare i flag, ma delayed-buffs.js controllerà solo item di tipo Buff.`);
}

const currentTargetBuffRef = item.getFlag(FLAG_SCOPE, "targetBuffRef") ?? item.getFlag(FLAG_SCOPE, "targetBuffName") ?? "";
const currentDelayText = item.getFlag(FLAG_SCOPE, "delayText") ?? "1h";

const currentSaveEnabled = item.getFlag(FLAG_SCOPE, "saveEnabled") === true;
const currentSaveType = item.getFlag(FLAG_SCOPE, "saveType") ?? "fort";
const currentSaveDC = item.getFlag(FLAG_SCOPE, "saveDC") ?? "";
const currentSaveSuccessEffect = item.getFlag(FLAG_SCOPE, "saveSuccessEffect") ?? "negates";

new Dialog({
  title: `Delayed Buff: ${item.name}`,
  content: `
    <form>
      <div class="form-group">
        <label>Buff finale da applicare / riattivare</label>
        <input type="text" name="targetBuffRef" value="${escapeAttribute(currentTargetBuffRef)}" placeholder="Nome esatto oppure UUID">
        <p style="font-size: 12px; opacity: 0.75; margin-top: 3px;">
          Puoi usare il nome esatto del buff finale o il suo UUID. Se il buff è già nella tab Buff dell'Actor, verrà riattivato invece di essere creato di nuovo.
        </p>
      </div>

      <div class="form-group">
        <label>Ritardo</label>
        <input type="text" name="delayText" value="${escapeAttribute(currentDelayText)}" placeholder="1h">
        <p style="font-size: 12px; opacity: 0.75; margin-top: 3px;">
          Esempi validi: 30m, 1h, 2h, 1d. Il timer usa il tempo di gioco del mondo.
        </p>
      </div>

      <hr>

      <div class="form-group">
        <label>
          <input type="checkbox" name="saveEnabled" ${currentSaveEnabled ? "checked" : ""}>
          Richiede tiro salvezza silenzioso
        </label>
      </div>

      <div class="form-group">
        <label>Tipo TS</label>
        <select name="saveType">
          <option value="fort" ${currentSaveType === "fort" ? "selected" : ""}>Fortitude</option>
          <option value="ref" ${currentSaveType === "ref" ? "selected" : ""}>Reflex</option>
          <option value="will" ${currentSaveType === "will" ? "selected" : ""}>Will</option>
        </select>
      </div>

      <div class="form-group">
        <label>CD tiro salvezza</label>
        <input type="number" name="saveDC" value="${escapeAttribute(currentSaveDC)}" min="0" step="1">
      </div>

      <div class="form-group">
        <label>Se supera il TS</label>
        <select name="saveSuccessEffect">
          <option value="negates" ${currentSaveSuccessEffect === "negates" ? "selected" : ""}>Nega l'effetto</option>
          <option value="halfDuration" ${currentSaveSuccessEffect === "halfDuration" ? "selected" : ""}>Dimezza la durata dell'effetto</option>
        </select>
      </div>

      <p style="font-size: 12px; opacity: 0.75;">
        Questa macro non crea messaggi chat. Il tiro salvezza viene poi gestito da delayed-buffs.js senza card pubbliche.
      </p>
    </form>
  `,
  buttons: {
    save: {
      icon: '<i class="fas fa-save"></i>',
      label: "Salva",
      callback: async html => {
        const form = html[0].querySelector("form");
        const data = new FormData(form);

        const targetBuffRef = String(data.get("targetBuffRef") ?? "").trim();
        const delayText = String(data.get("delayText") ?? "").trim();

        const saveEnabled = data.get("saveEnabled") === "on";
        const saveType = String(data.get("saveType") ?? "fort").trim();
        const saveDC = Number(data.get("saveDC") ?? 0);
        const saveSuccessEffect = String(data.get("saveSuccessEffect") ?? "negates").trim();

        if (!targetBuffRef) {
          return ui.notifications.warn("Inserisci il nome o UUID del buff finale.");
        }

        if (!delayText) {
          return ui.notifications.warn("Inserisci il ritardo, es. 1h.");
        }

        const delaySeconds = parseDelayToSeconds(delayText);

        if (!delaySeconds) {
          return ui.notifications.warn(`Ritardo non valido: "${delayText}". Usa esempi tipo 30m, 1h, 2h, 1d.`);
        }

        if (saveEnabled && (!Number.isFinite(saveDC) || saveDC <= 0)) {
          return ui.notifications.warn("Hai abilitato il tiro salvezza, ma la CD non è valida.");
        }

        if (!["fort", "ref", "will"].includes(saveType)) {
          return ui.notifications.warn("Tipo TS non valido.");
        }

        if (!["negates", "halfDuration"].includes(saveSuccessEffect)) {
          return ui.notifications.warn("Effetto su successo non valido.");
        }

        await item.setFlag(FLAG_SCOPE, "targetBuffRef", targetBuffRef);

        // Compatibilità con vecchie versioni che leggevano targetBuffName.
        await item.setFlag(FLAG_SCOPE, "targetBuffName", targetBuffRef);

        await item.setFlag(FLAG_SCOPE, "delayText", delayText);
        await item.setFlag(FLAG_SCOPE, "saveEnabled", saveEnabled);
        await item.setFlag(FLAG_SCOPE, "saveType", saveType);
        await item.setFlag(FLAG_SCOPE, "saveDC", Number.isFinite(saveDC) ? saveDC : 0);
        await item.setFlag(FLAG_SCOPE, "saveSuccessEffect", saveSuccessEffect);

        // Rimuove flag vecchi o stati runtime precedenti.
        // Alla prossima attivazione del buff iniziale, delayed-buffs.js ricreerà il timer da zero.
        await item.unsetFlag(FLAG_SCOPE, "deleteTriggerOnActivation");
        await item.unsetFlag(FLAG_SCOPE, DATA_KEY);

        ui.notifications.info(`${item.name}: delayed buff configurato.`);
        console.log("Delayed buff flags salvati su:", item.name, {
          targetBuffRef,
          delayText,
          delaySeconds,
          saveEnabled,
          saveType,
          saveDC,
          saveSuccessEffect,
          itemUuid: item.uuid,
          flags: item.flags
        });
      }
    },

    clear: {
      icon: '<i class="fas fa-trash"></i>',
      label: "Rimuovi flags",
      callback: async () => {
        await item.unsetFlag(FLAG_SCOPE, "targetBuffRef");
        await item.unsetFlag(FLAG_SCOPE, "targetBuffName");
        await item.unsetFlag(FLAG_SCOPE, "delayText");
        await item.unsetFlag(FLAG_SCOPE, "deleteTriggerOnActivation");

        await item.unsetFlag(FLAG_SCOPE, "saveEnabled");
        await item.unsetFlag(FLAG_SCOPE, "saveType");
        await item.unsetFlag(FLAG_SCOPE, "saveDC");
        await item.unsetFlag(FLAG_SCOPE, "saveSuccessEffect");

        await item.unsetFlag(FLAG_SCOPE, DATA_KEY);

        ui.notifications.info(`${item.name}: delayed buff rimosso.`);
      }
    },

    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Annulla"
    }
  },
  default: "save"
}).render(true);