const MODULE_ID = "pf1e-shadows-over-rome";
const MODULE_PATH = `modules/${MODULE_ID}`;

const MACRO_FILES = Object.freeze({
  addBuff: "utils/macros/gmMacros/addBuff.js",
  addDelayedDebuff: "utils/macros/gmMacros/addDelayedDebuff.js",
  delayedDebuffLog: "utils/macros/gmMacros/delayedDebuffLog.js",
  rechargeActorItems: "utils/macros/gmMacros/rechargeActorItems.js",
  setCurseInfo: "utils/macros/gmMacros/setCurseInfo.js",
  unidPriceSetter: "utils/macros/gmMacros/unidPriceSetter.js",
  guessDayTime: "utils/macros/playerMacros/guessDayTime.js",
  identifyObjects: "utils/macros/playerMacros/identifyObjecs.js",
  showTime: "utils/macros/timeMacros/showTime.js",
  timeManager: "utils/macros/timeMacros/timeManager.js"
});

const MACRO_ALIASES = Object.freeze({
  configureDelayedBuff: "addDelayedDebuff",
  identifyObjecs: "identifyObjects",
  manageTime: "timeManager",
  rechargeWeeklyItems: "rechargeActorItems",
  setUnidentifiedPrice: "unidPriceSetter"
});

const macroCache = new Map();

function getMacroUrl(path) {
  return `${MODULE_PATH}/${path}`;
}

async function loadMacro(name) {
  const path = MACRO_FILES[name];

  if (!path) {
    throw new Error(`${MODULE_ID} | Unknown macro: ${name}`);
  }

  if (macroCache.has(name)) return macroCache.get(name);

  const url = getMacroUrl(path);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${MODULE_ID} | Failed to load macro ${name} from ${url}: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();
  const execute = Object.getPrototypeOf(async function () {}).constructor(
    "scope",
    `with (scope) {\n${source}\n}\n//# sourceURL=${url}`
  );

  macroCache.set(name, execute);
  return execute;
}

async function runMacro(name, context = {}) {
  const execute = await loadMacro(name);
  const token = context.token ?? globalThis.canvas?.tokens?.controlled?.[0] ?? null;
  const actor = context.actor ?? token?.actor ?? globalThis.game?.user?.character ?? null;
  const item = context.item ?? null;
  const speaker = context.speaker ?? (actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker());
  const args = context.args ?? [];
  const scope = context.scope ?? context;

  return execute.call(scope, { ...context, actor, item, token, speaker, args, scope });
}

function createMacroRunner(name) {
  return async function runSorMacro(context) {
    return runMacro(name, context);
  };
}

function registerMacros() {
  const root = globalThis.window ?? globalThis;
  const namespace = root.SOR ?? {};
  const macros = namespace.macros ?? {};

  for (const name of Object.keys(MACRO_FILES)) {
    macros[name] = createMacroRunner(name);
  }

  for (const [alias, target] of Object.entries(MACRO_ALIASES)) {
    macros[alias] = createMacroRunner(target);
  }

  macros.run = runMacro;
  macros.files = MACRO_FILES;

  namespace.macros = macros;
  root.SOR = namespace;
  globalThis.SOR = namespace;

  console.log(`${MODULE_ID} | Registered ${Object.keys(MACRO_FILES).length} module-backed macros on window.SOR.macros.`);
}

Hooks.once("init", registerMacros);
