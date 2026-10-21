/**
 * Just enough of Foundry and the system to load a module under plain `node`.
 *
 * These tests only cover pure logic - functions that take values and return values. Anything that touches a
 * Document, a sheet or a hook needs a real Foundry and belongs in a test world, not here.
 */

const dig = (object, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), object);

/**
 * @param {object} options
 * @param {object} options.homebrew   The `homebrew` setting, i.e. which toggles are on
 * @param {object} options.world      Other `game.settings` values, keyed by setting name
 * @param {object} options.config     Additions to `game.wfrp4e.config`
 * @param {object} options.lang       Translations for localize(), for code that matches on translated text
 */
export function install({ homebrew = {}, world = {}, config = {}, lang = {} } = {}) {
  globalThis.game = {
    settings: { get: (_namespace, key) => (key === "homebrew" ? homebrew : world[key]) },
    // Unknown keys echo back, so assertions can name the string a function chose without depending on its English
    i18n: { localize: key => lang[key] ?? key, format: key => key, translations: lang },
    wfrp4e: { config, utility: { logHomebrew: () => {} } }
  };

  globalThis.foundry = {
    utils: {
      deepClone: value => structuredClone(value),
      duplicate: value => structuredClone(value),
      hasProperty: (object, path) => dig(object, path) !== undefined,
      getProperty: (object, path) => dig(object, path),
      setProperty: (object, path, value) => {
        const keys = path.split(".");
        const last = keys.pop();
        let cursor = object;
        for (const key of keys) cursor = (cursor[key] ??= {});
        cursor[last] = value;
        return true;
      }
    }
  };

  // Foundry adds this to Math; the system uses it
  globalThis.Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
}

/** Minimal assertion harness. Call `report()` last; it exits non-zero if anything failed. */
export function suite(title) {
  let failures = 0;
  let count = 0;

  const check = (label, got, want) => {
    count++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    const detail = ok ? "" : `  want ${JSON.stringify(want)}`;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${JSON.stringify(got)}${detail}`);
  };

  const report = () => {
    console.log(`\n${title}: ${count - failures}/${count} passed`);
    process.exit(failures ? 1 : 0);
  };

  return { check, report };
}
