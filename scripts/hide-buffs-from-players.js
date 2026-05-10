// PF1e Hide Buffs From Players
// Nasconde la tab/sezione Buffs ai non-GM.
// I GM continuano a vedere tutto.

const HBF_MODULE_ID = "pf1e-hide-buffs-from-players";

Hooks.once("ready", () => {
  if (game.user.isGM) {
    console.log(`${HBF_MODULE_ID} | GM detected, buffs visible.`);
    return;
  }

  hbfInjectCss();

  Hooks.on("renderActorSheet", (app, html) => {
    hbfHideBuffsInSheet(app, html);
  });

  console.log(`${HBF_MODULE_ID} | Buff UI hidden for player.`);
});

function hbfInjectCss() {
  const style = document.createElement("style");
  style.id = `${HBF_MODULE_ID}-style`;

  style.textContent = `
    /* PF1e actor sheet - hide Buffs tab buttons */
    .app.sheet.actor a[data-tab="buffs"],
    .app.sheet.actor .tabs a[data-tab="buffs"],
    .app.sheet.actor .sheet-navigation a[data-tab="buffs"],
    .app.sheet.actor nav a[data-tab="buffs"],

    /* PF1e actor sheet - hide Buffs tab content */
    .app.sheet.actor .tab[data-tab="buffs"],
    .app.sheet.actor section[data-tab="buffs"],
    .app.sheet.actor div[data-tab="buffs"],

    /* Extra fallbacks for PF1e class names */
    .app.sheet.actor .buffs,
    .app.sheet.actor .tab.buffs {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;

  document.head.appendChild(style);
}

function hbfHideBuffsInSheet(app, html) {
  const root = html?.[0] ?? html;
  if (!root) return;

  const selectors = [
    'a[data-tab="buffs"]',
    '.tabs a[data-tab="buffs"]',
    '.sheet-navigation a[data-tab="buffs"]',
    'nav a[data-tab="buffs"]',
    '.tab[data-tab="buffs"]',
    'section[data-tab="buffs"]',
    'div[data-tab="buffs"]',
    '.tab.buffs',
    '.buffs'
  ];

  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      el.style.display = "none";
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
    }
  }

  // Se per qualche motivo la scheda si apre già sulla tab buffs,
  // prova a spostarla su una tab sicura.
  const activeBuffTab = root.querySelector('.tab[data-tab="buffs"].active, .tab.buffs.active');

  if (activeBuffTab) {
    activeBuffTab.classList.remove("active");

    const fallbackTabs = [
      "attributes",
      "details",
      "inventory",
      "features",
      "combat"
    ];

    for (const tabName of fallbackTabs) {
      const nav = root.querySelector(`a[data-tab="${tabName}"]`);
      const tab = root.querySelector(`.tab[data-tab="${tabName}"]`);

      if (nav && tab) {
        nav.classList.add("active");
        tab.classList.add("active");
        break;
      }
    }
  }
}