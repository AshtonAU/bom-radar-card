import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLayerPickerBounds } from '../src/layer-picker-layout.js';

const viewport = { left: 0, top: 0, right: 1280, bottom: 900 };

test('right-aligns a capped three-column picker in a wide card', () => {
  assert.deepEqual(getLayerPickerBounds({
    card: { left: 100, top: 100, right: 900, bottom: 800 }, viewport,
  }), { left: 312, top: 8, width: 480, maxHeight: 480, columns: 3 });
});

test('uses two columns within a 320px card and reserves the strip and playback', () => {
  assert.deepEqual(getLayerPickerBounds({
    card: { left: 16, top: 40, right: 336, bottom: 440 }, viewport,
    topInset: 14, bottomInset: 64,
  }), { left: 8, top: 14, width: 304, maxHeight: 322, columns: 2 });
});

test('keeps a partly scrolled card picker below the viewport top', () => {
  const card = { left: 20, top: -70, right: 340, bottom: 330 };
  const result = getLayerPickerBounds({ card, viewport, topInset: 14, bottomInset: 64 });
  assert.equal(result.top, 78);
  assert.equal(card.top + result.top, 8);
  assert.equal(result.maxHeight, 258);
});

test('honours offset viewport edges and partial horizontal card visibility', () => {
  assert.deepEqual(getLayerPickerBounds({
    card: { left: -100, top: -50, right: 550, bottom: 700 },
    viewport: { left: 50, top: 100, right: 430, bottom: 600 },
  }), { left: 158, top: 158, width: 364, maxHeight: 480, columns: 2 });
});

test('constrains the panel to the visible viewport bottom', () => {
  assert.deepEqual(getLayerPickerBounds({
    card: { left: 0, top: 700, right: 320, bottom: 1100 }, viewport,
    bottomInset: 64,
  }), { left: 8, top: 8, width: 304, maxHeight: 184, columns: 2 });
});

test('does not discard the playback inset on short cards', () => {
  assert.deepEqual(getLayerPickerBounds({
    card: { left: 0, top: 20, right: 320, bottom: 90 }, viewport,
    topInset: 14, bottomInset: 64,
  }), { left: 8, top: 14, width: 304, maxHeight: 0, columns: 2 });
});

test('never returns negative dimensions when there is no available space', () => {
  const result = getLayerPickerBounds({
    card: { left: 1300, top: 1000, right: 1620, bottom: 1400 }, viewport,
  });
  assert.equal(result.width, 0);
  assert.equal(result.maxHeight, 0);
  assert.equal(result.columns, 1);
});

test('uses available width to select one, two, or three columns at exact thresholds', () => {
  for (const [width, columns] of [[100, 1], [239, 1], [240, 2], [439, 2], [440, 3]]) {
    const result = getLayerPickerBounds({
      card: { left: 0, top: 0, right: width + 16, bottom: 400 }, viewport,
    });
    assert.equal(result.width, width);
    assert.equal(result.columns, columns);
  }
});
