const MODULE_ID = "pf1e-shadows-over-rome";
const MODULE_PATH = `modules/${MODULE_ID}`;

const ITEM_FILES = Object.freeze({
  potionCourageSerum: "utils/items/potion_courageSerum.js"
});

const BUFF_EFFECT_FILES = Object.freeze({
  closedWound: "utils/buffEffects/debuff_closedWound.js",
  necroticScar: "utils/buffEffects/debuff_necroticScar.js",
  tunnelNausea: "utils/buffEffects/debuff_tunnelNausea.js"
});

const itemAliases = Object.freeze({
  courageSerum: "potionCourageSerum"
});

const buffEffectAliases = Object.freeze({
  debuffClosedWound: "closedWound",
  debuffNecroticScar: "necroticScar",
  debuffTunnelNausea: "tunnelNausea"
});

const cache = new Map();

function getUrl(path) {
  return `${MODULE_PATH}/${path}`;
}

async function loadScript(kind, files, name) {
  const path = files[name];

  if (!path) {
    throw new Error(`${MODULE_ID} | Unknown ${kind}: ${name}`);
  }

  const cacheKey = `${kind}:${name}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = getUrl(path);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${MODULE_ID} | Failed to load ${kind} ${name} from ${url}: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();
  const execute = Object.getPrototypeOf(async function () {}).constructor(
    "scope",
    `with (scope) {\n${source}\n}\n//# sourceURL=${url}`
  );

  cache.set(cacheKey, execute);
  return execute;
}

function getDefaultContext(context = {}) {
  const token = context.token ?? globalThis.canvas?.tokens?.controlled?.[0] ?? null;
  const item = context.item ?? context.shared?.item ?? null;
  const actor = context.actor ?? item?.actor ?? context.shared?.actor ?? token?.actor ?? globalThis.game?.user?.character ?? null;
  const speaker = context.speaker ?? (actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker());
  const shared = context.shared ?? {};

  return { ...context, actor, item, speaker, shared, token };
}

async function run(files, kind, name, context = {}) {
  const execute = await loadScript(kind, files, name);
  const scope = getDefaultContext(context);
  return execute.call(scope, scope);
}

function createRunner(files, kind, name) {
  return async function runSorUtil(context) {
    return run(files, kind, name, context);
  };
}

function addRunners(target, files, kind, aliases = {}) {
  for (const name of Object.keys(files)) {
    target[name] = createRunner(files, kind, name);
  }

  for (const [alias, targetName] of Object.entries(aliases)) {
    target[alias] = createRunner(files, kind, targetName);
  }

  target.run = (name, context) => run(files, kind, name, context);
  target.files = files;
}

function registerUtils() {
  const root = globalThis.window ?? globalThis;
  const namespace = root.SOR ?? {};

  namespace.items ??= {};
  namespace.buffEffects ??= {};

  addRunners(namespace.items, ITEM_FILES, "item", itemAliases);
  addRunners(namespace.buffEffects, BUFF_EFFECT_FILES, "buff effect", buffEffectAliases);

  root.SOR = namespace;
  globalThis.SOR = namespace;

  console.log(`${MODULE_ID} | Registered item and buff-effect utilities on window.SOR.`);
}

Hooks.once("init", registerUtils);
