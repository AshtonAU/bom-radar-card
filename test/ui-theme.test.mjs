import assert from 'node:assert/strict';
import test from 'node:test';
import { getUiTheme, observeUiTheme, syncUiTheme } from '../src/ui-theme.js';

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

test('theme synchronization only writes the host attribute when its value changes', () => {
  const element = createElement();
  syncUiTheme(element, undefined, false);
  syncUiTheme(element, undefined, false);
  syncUiTheme(element, { themes: { darkMode: false } }, true);
  assert.deepEqual(element.writes, [['data-theme', 'light']]);

  syncUiTheme(element, { themes: { darkMode: true } }, false);
  syncUiTheme(element, undefined, true);
  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.deepEqual(element.writes, [['data-theme', 'light'], ['data-theme', 'dark']]);
});

test('system theme observation respects current Home Assistant preferences and cleans up its listener', t => {
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
  const stop = observeUiTheme(element, () => hass);
  assert.equal(element.getAttribute('data-theme'), 'light');
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

  hass = { themes: { darkMode: 'auto' } };
  media.change(true);
  media.change(false);
  assert.equal(element.getAttribute('data-theme'), 'light');

  stop();
  assert.deepEqual(removed, added, 'cleanup removes the exact registered event and callback');
  assert.deepEqual([...listeners], [externalListener], 'other components retain their listeners');
  const writesAfterCleanup = element.writes.length;
  media.change(true);
  assert.equal(element.writes.length, writesAfterCleanup);
  assert.equal(element.getAttribute('data-theme'), 'light');
});
