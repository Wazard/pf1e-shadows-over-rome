// PF1e Modular Consume-On-Next-Roll Buffs
// Clean version for PF1e Boolean Flags.
//
// Add Boolean Flags manually to a buff in Advanced > Boolean Flags.
// If the buff has multiple consume flags, the FIRST matching rolled check consumes the buff.
// Example: a buff with consumeOnStrength + consumeOnClimb is deactivated as soon as either
// a Strength check or Climb check is rolled.
//
// The buff is deactivated AFTER the roll message is created,
// so the buff still applies to that roll.

Hooks.once("ready", () => {
  const RULES = [
    ["consumeOnWill", "will"],
    ["consumeOnDiplomacy", "dip"],
    ["consumeOnSenseMotive", "sen"],
    ["consumeOnPerception", "per"],
    ["consumeOnSurvival", "sur"],
    ["consumeOnStealth", "ste"],
    ["consumeOnBluff", "blf"],
    ["consumeOnIntimidate", "int"],
    ["consumeOnSleightOfHand", "slt"],
    ["consumeOnDisableDevices", "dev"],

    ["consumeOnStrength", "str"],
    ["consumeOnClimb", "clm"],
    ["consumeOnSwim", "swm"],
    ["consumeOnAcrobatics", "acr"],
    ["consumeOnCMB", "cmb"]
  ];

  const DEACTIVATE_DELAY_MS = 100;

  const ALIASES = {
    fortitude: "fort",
    fort: "fort",
    for: "fort",

    reflex: "ref",
    ref: "ref",

    will: "will",
    wil: "will",

    diplomacy: "dip",
    dip: "dip",

    sense_motive: "sen",
    "sense motive": "sen",
    sensemotive: "sen",
    sen: "sen",

    perception: "per",
    per: "per",

    survival: "sur",
    sur: "sur",

    stealth: "ste",
    ste: "ste",

    bluff: "blf",
    blf: "blf",

    intimidate: "int",
    int: "int",

    strength: "str",
    str: "str",

    climb: "clm",
    clm: "clm",

    swim: "swm",
    swm: "swm",

    acrobatics: "acr",
    acr: "acr",

    cmb: "cmb",
    "combat maneuver": "cmb",
    combat_maneuver: "cmb",
    "combat maneuver check": "cmb",
    combat_maneuver_check: "cmb",
    
    sleight_of_hand: "slt",
    "sleight of hand": "slt",
    sleightofhand: "slt",
    slt: "slt",

    disable_device: "dev",
    "disable device": "dev",
    disabledevice: "dev",
    disable_devices: "dev",
    "disable devices": "dev",
    disabledevices: "dev",
    dev: "dev"
  };

  const TEXT_TO_KEY = [
    [/fortitude\s+saving\s+throw/i, "fort"],
    [/reflex\s+saving\s+throw/i, "ref"],
    [/will\s+saving\s+throw/i, "will"],

    [/diplomacy/i, "dip"],
    [/sense\s+motive/i, "sen"],
    [/perception/i, "per"],
    [/survival/i, "sur"],
    [/stealth/i, "ste"],
    [/bluff/i, "blf"],
    [/intimidate/i, "int"],

    [/strength/i, "str"],
    [/climb/i, "clm"],
    [/swim/i, "swm"],
    [/acrobatics/i, "acr"],
    [/\bcmb\b|combat\s+maneuver/i, "cmb"],
    [/sleight\s+of\s+hand/i, "slt"],
    [/disable\s+devices?/i, "dev"]
  ];

  function normalize(value) {
    const key = String(value ?? "")
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll("_", " ");

    return ALIASES[key] ?? ALIASES[key.replaceAll(" ", "_")] ?? key;
  }

  const rules = RULES.map(([flag, rollKey]) => ({
    flag: String(flag ?? "").trim(),
    rollKey: normalize(rollKey)
  })).filter(r => r.flag && r.rollKey);

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html ?? "");
    return div.textContent || div.innerText || "";
  }

  function getRollKey(data) {
    const text = [
      data?.flavor,
      stripHtml(data?.content)
    ].join("\n");

    for (const [regex, key] of TEXT_TO_KEY) {
      if (regex.test(text)) return key;
    }

    return null;
  }

  function getActor(speaker) {
    if (!speaker) return null;

    if (speaker.scene && speaker.token) {
      const scene = game.scenes.get(speaker.scene);
      const token = scene?.tokens?.get(speaker.token);
      if (token?.actor) return token.actor;
    }

    if (speaker.actor) {
      return game.actors.get(speaker.actor) ?? null;
    }

    return null;
  }

  function isActiveBuff(item) {
    if (item?.type !== "buff") return false;
    if (item.isActive === true) return true;
    return item.system?.active === true || item.system?.disabled === false;
  }

  function hasBooleanFlag(item, flagName) {
    if (typeof item.hasItemBooleanFlag === "function") {
      return item.hasItemBooleanFlag(flagName) === true;
    }

    const flags = item.system?.flags?.boolean ?? item.system?.booleanFlags ?? [];
    if (Array.isArray(flags)) return flags.includes(flagName);
    if (flags && typeof flags === "object") return flags[flagName] === true;

    return false;
  }

  function getBuffsToConsume(actor, rolledKey) {
    const key = normalize(rolledKey);
    const out = [];

    for (const buff of actor.items) {
      if (!isActiveBuff(buff)) continue;

      const matched = rules.some(rule =>
        rule.rollKey === key &&
        hasBooleanFlag(buff, rule.flag)
      );

      if (matched) out.push(buff);
    }

    return out;
  }

  async function deactivateBuff(buff) {
    if (typeof buff.setActive === "function") {
      await buff.setActive(false).catch(() => {});
    }

    await buff.update({
      "system.active": false,
      "system.disabled": true
    }).catch(() => {});
  }

  Hooks.on("preCreateChatMessage", (message, data) => {
    const rolledKey = getRollKey(data);
    if (!rolledKey) return;

    const actor = getActor(data?.speaker);
    if (!actor) return;

    const buffs = getBuffsToConsume(actor, rolledKey);
    if (!buffs.length) return;

    setTimeout(async () => {
      for (const buff of buffs) {
        await deactivateBuff(buff);
      }
    }, DEACTIVATE_DELAY_MS);
  });
});
