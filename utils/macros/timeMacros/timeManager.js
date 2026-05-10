const SECONDS = {
  minute: 60,
  hour: 60 * 60,
  day: 24 * 60 * 60
};

function formatWorldTime(seconds) {
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return `Giorno ${days + 1}, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function advanceTime(seconds, label) {
  await game.time.advance(seconds);

  const now = game.time.worldTime;
  const pretty = formatWorldTime(now);

  ui.notifications.info(`Tempo avanzato di ${label}. Ora: ${pretty}`);

  ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<p><strong>Tempo avanzato:</strong> ${label}</p><p><strong>Ora attuale:</strong> ${pretty}</p>`
  });
}

new Dialog({
  title: "Avanza Tempo",
  content: `
    <form>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button type="button" data-action="1h">+1 ora</button>
        <button type="button" data-action="4h">+4 ore</button>
        <button type="button" data-action="8h">+8 ore</button>
        <button type="button" data-action="1d">+1 giorno</button>
      </div>

      <hr>

      <div class="form-group">
        <label>Ore personalizzate</label>
        <input type="number" name="hours" value="0" min="0">
      </div>

      <div class="form-group">
        <label>Minuti personalizzati</label>
        <input type="number" name="minutes" value="0" min="0">
      </div>
    </form>
  `,
  buttons: {
    custom: {
      label: "Avanza di X ore/minuti",
      callback: async (html) => {
        const hours = Number(html.find('[name="hours"]').val()) || 0;
        const minutes = Number(html.find('[name="minutes"]').val()) || 0;

        const seconds = (hours * SECONDS.hour) + (minutes * SECONDS.minute);

        await advanceTime(seconds, `+${hours}h ${minutes}m`);
      }
    },
    close: {
      label: "Chiudi"
    }
  },
  render: (html) => {
    html.find('[data-action="1h"]').click(() => advanceTime(1 * SECONDS.hour, "+1 ora"));
    html.find('[data-action="4h"]').click(() => advanceTime(4 * SECONDS.hour, "+4 ore"));
    html.find('[data-action="8h"]').click(() => advanceTime(8 * SECONDS.hour, "+8 ore"));
    html.find('[data-action="1d"]').click(() => advanceTime(1 * SECONDS.day, "+1 giorno"));
  },
  default: "custom"
}).render(true);