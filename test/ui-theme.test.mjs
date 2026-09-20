import assert from 'node:assert/strict';
import test from 'node:test';
import { getUiTheme, normalizeUiTheme, observeUiTheme, syncUiTheme } from '../src/ui-theme.js';

function createElement() {
  const attributes = new Map();
  const writes = [];
  return {
    writes,
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute(name, value) {
      attributes.set(name, value);
      writes.push([name, value]);
    },
  };
}

test('Home Assistant light and dark preferences take precedence over the system', () => {
  for (const systemDark of [false, true]) {
    assert.equal(getUiTheme({ themes: { darkMode: false } }, systemDark), 'light');
    assert.equal(getUiTheme({ themes: { darkMode: true } }, systemDark), 'dark');
  }
});

test('missing or nonboolean Home Assistant preferences follow the system', () => {
  const configurations = [
    undefined,
    null,
    {},
    { themes: {} },
    ...[undefined, null, 'dark', 'false', 0, 1].map(darkMode => ({ themes: { darkMode } })),
  ];
  for (const hass of configurations) {
    assert.equal(getUiTheme(hass, false), 'light');
    assert.equal(getUiTheme(hass, true), 'dark');
  }
  assert.equal(getUiTheme(), 'light');
});

test('explicit card themes override Home Assistant and system preferences', () => {
  for (const preference of ['light', 'dark']) {
    assert.equal(normalizeUiTheme(preference), preference);
    for (const darkMode of [false, true, undefined]) {
      for (const systemDark of [false, true]) {
        assert.equal(getUiTheme({ themes: { darkMode } }, systemDark, preference), preference);
      }
    }
  }
});

test('unknown card theme values safely retain dashboard inheritance', () => {
  for (const preference of ['auto', undefined, null, '', 'Dark', 'invalid', '__proto__', true, 0, {}, []]) {
    assert.equal(normalizeUiTheme(preference), 'auto');
    assert.equal(getUiTheme({ themes: { darkMode: false } }, true, preference), 'light');
    assert.equal(getUiTheme({ themes: { darkMode: true } }, false, preference), 'dark');
    assert.equal(getUiTheme(undefined, true, preference), 'dark');
  }
});

test('theme synchronization only writes host attributes when their values change', () => {
  const element = createElement();
  syncUiTheme(element, undefined, false);
  syncUiTheme(element, undefined, false);
  syncUiTheme(element, { themes: { darkMode: false } }, true);
  assert.deepEqual(element.writes.toSorted(), [['data-theme', 'light'], ['data-ui-theme', 'auto']]);

  syncUiTheme(element, { themes: { darkMode: true } }, false);
  syncUiTheme(element, undefined, true);
  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.equal(element.writes.length, 3);
  assert.deepEqual(element.writes.at(-1), ['data-theme', 'dark']);

  syncUiTheme(element, undefined, true, 'dark');
  syncUiTheme(element, undefined, true, 'dark');
  assert.equal(element.writes.length, 4);
  assert.deepEqual(element.writes.at(-1), ['data-ui-theme', 'dark']);

  syncUiTheme(element, undefined, true, 'light');
  assert.equal(element.getAttribute('data-theme'), 'light');
  assert.equal(element.getAttribute('data-ui-theme'), 'light');
  assert.equal(element.writes.length, 6);

  syncUiTheme(element, { themes: { darkMode: false } }, true, 'invalid');
  assert.equal(element.getAttribute('data-theme'), 'light');
  assert.equal(element.getAttribute('data-ui-theme'), 'auto');
  assert.equal(element.writes.length, 7);
});

test('system theme observation reads current Home Assistant and card preferences and cleans up its listener', t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  });

  const externalListener = () => {};
  const listeners = new Set([externalListener]);
  const added = [];
  const removed = [];
  const media = {
    matches: false,
    addEventListener(type, listener) {
      added.push([type, listener]);
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      removed.push([type, listener]);
      listeners.delete(listener);
    },
    change(matches) {
      this.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia(query) {
        assert.equal(query, '(prefers-color-scheme: dark)');
        return media;
      },
    },
  });

  const element = createElement();
  let hass;
  let preference = 'auto';
  const stop = observeUiTheme(element, () => hass, () => preference);
  assert.equal(element.getAttribute('data-theme'), 'light');
  assert.equal(element.getAttribute('data-ui-theme'), 'auto');
  assert.equal(added.length, 1);
  assert.equal(added[0][0], 'change');

  media.change(true);
  assert.equal(element.getAttribute('data-theme'), 'dark');

  hass = { themes: { darkMode: false } };
  media.change(false);
  media.change(true);
  assert.equal(element.getAttribute('data-theme'), 'light');

  hass = { themes: { darkMode: true } };
  media.change(false);
  assert.equal(element.getAttribute('data-theme'), 'dark');

  preference = 'light';
  media.change(true);
  assert.equal(element.getAttribute('data-theme'), 'light');
  assert.equal(element.getAttribute('data-ui-theme'), 'light');

  preference = 'dark';
  hass = { themes: { darkMode: false } };
  media.change(false);
  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.equal(element.getAttribute('data-ui-theme'), 'dark');

  preference = 'invalid';
  hass = { themes: { darkMode: 'auto' } };
  media.change(true);
  media.change(false);
  assert.equal(element.getAttribute('data-theme'), 'light');
  assert.equal(element.getAttribute('data-ui-theme'), 'auto');

  stop();
  assert.deepEqual(removed, added, 'cleanup removes the exact registered event and callback');
  assert.deepEqual([...listeners], [externalListener], 'other components retain their listeners');
  const writesAfterCleanup = element.writes.length;
  media.change(true);
  assert.equal(element.writes.length, writesAfterCleanup);
  assert.equal(element.getAttribute('data-theme'), 'light');
});
