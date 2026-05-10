// Hide blind/private GM roll placeholders from non-GM users.
// Intended for PF1e when Blind GM / Secret rolls still leave visible cards.

Hooks.on("renderChatMessage", (message, html) => {
  if (game.user.isGM) return;

  const isBlind = message.blind === true;
  const isWhisper = Array.isArray(message.whisper) && message.whisper.length > 0;
  const userCanSeeWhisper = message.whisper?.includes(game.user.id);

  // Hide true blind rolls from players.
  if (isBlind) {
    html.remove();
    return;
  }

  // Hide whispers not addressed to this player.
  if (isWhisper && !userCanSeeWhisper) {
    html.remove();
    return;
  }
});