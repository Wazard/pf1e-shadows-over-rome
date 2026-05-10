const t = game.time.worldTime;

const days = Math.floor(t / 86400);
const hours = Math.floor((t % 86400) / 3600);
const minutes = Math.floor((t % 3600) / 60);

const pretty = `Giorno ${days + 1}, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

ui.notifications.info(`Tempo attuale: ${pretty}`);

ChatMessage.create({
  whisper: ChatMessage.getWhisperRecipients("GM"),
  content: `<p><strong>Tempo attuale:</strong> ${pretty}</p><p><strong>Secondi worldTime:</strong> ${t}</p>`
});