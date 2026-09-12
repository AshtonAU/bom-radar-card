import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardSource = await readFile(new URL('../src/bom-radar-card.js', import.meta.url), 'utf8');
const leafletCss = cardSource.match(/const LEAFLET_CSS = `([\s\S]*?)`;/)?.[1] ?? '';
const cardCss = cardSource.match(/const CARD_CSS = `([\s\S]*?)`;/)?.[1] ?? '';

function getCssProperty(css, selector, property) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selectors, declarations] of rules) {
    if (selectors.trim() !== selector && !selectors.split(',').some(item => item.trim() === selector)) continue;
    const value = declarations.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1];
    if (value !== undefined) return value.trim();
  }

  assert.fail(`Expected ${selector} to declare ${property}`);
}

function getZIndex(selector) {
  const zIndex = getCssProperty(leafletCss, selector, 'z-index');
  assert.match(zIndex, /^-?\d+$/, `Expected ${selector} to declare a numeric z-index`);
  return Number(zIndex);
}

test('keeps loaded Leaflet tiles and overlays behind the home marker pane', () => {
  const tileZIndex = getZIndex('.leaflet-tile-pane');
  const overlayZIndex = getZIndex('.leaflet-overlay-pane');
  const markerZIndex = getZIndex('.leaflet-marker-pane');
  const controlZIndex = getZIndex('.leaflet-control');

  assert.equal(getZIndex('.leaflet-pane'), 400);
  assert.equal(tileZIndex, 200);
  assert.equal(overlayZIndex, 400);
  assert.equal(getZIndex('.leaflet-shadow-pane'), 500);
  assert.equal(markerZIndex, 600);
  assert.equal(getZIndex('.leaflet-tooltip-pane'), 650);
  assert.equal(getZIndex('.leaflet-popup-pane'), 700);
  assert.equal(controlZIndex, 800);
  assert.equal(getZIndex('.leaflet-top,.leaflet-bottom'), 1000);
  assert.ok(tileZIndex < overlayZIndex);
  assert.ok(overlayZIndex < markerZIndex);
  assert.ok(markerZIndex < controlZIndex);
});

test('preserves Leaflet absolute positioning for the home marker icon', () => {
  assert.equal(getCssProperty(cardCss, '.marker-dot', 'position'), 'absolute');
});

test('uses shared theme typography and keeps playback hover unfilled with visible keyboard focus', () => {
  assert.equal(getCssProperty(cardCss, ':host', 'font-family'), 'var(--bom-font-family)');
  assert.equal(getCssProperty(cardCss, '.play-btn', 'background'), 'none');
  assert.equal(getCssProperty(cardCss, '.play-btn:hover', 'color'), 'var(--bom-text)');
  assert.doesNotMatch(cardCss.match(/\.play-btn:hover\s*\{([^}]*)\}/)[1], /background/);
  assert.match(cardCss, /\.play-btn:focus-visible[^}]*outline: 2px solid/);
});

test('map actions share one toolbar with consistent sizes and no repeated control margins', () => {
  assert.equal(getCssProperty(leafletCss, '.leaflet-top.leaflet-right', 'display'), 'flex');
  assert.equal(getCssProperty(leafletCss, '.leaflet-top.leaflet-right > .leaflet-control', 'margin'), '0');
  assert.equal(getCssProperty(leafletCss, '.leaflet-top.leaflet-right[hidden]', 'display'), 'none');
  assert.equal(getCssProperty(cardCss, '.card-content.has-top-legend .leaflet-top.leaflet-right', 'top'), '14px');
  assert.equal(getCssProperty(cardCss, '.bom-key-cluster', 'flex-direction'), 'column');
  for (const selector of ['.leaflet-control-zoom a', '.bom-recenter-button', '.bom-layer-button']) {
    assert.equal(getCssProperty(leafletCss, selector, 'width'), 'var(--bom-control-size)');
    assert.equal(getCssProperty(leafletCss, selector, 'height'), 'var(--bom-control-size)');
    assert.equal(getCssProperty(leafletCss, selector, 'background'), 'transparent');
  }
  assert.equal(getCssProperty(cardCss, '.card-content', '--bom-control-size'), '36px');
  assert.match(cardCss, /@media \(pointer: coarse\)\s*\{\s*\.card-content\s*\{\s*--bom-control-size: 44px;/);
  assert.doesNotMatch(cardCss, /margin-top:\s*(18|20)px/);
});

test('loading uses theme text colour while interactive highlights retain their accent', () => {
  assert.equal(getCssProperty(cardCss, '.spinner', 'border-top-color'), 'var(--bom-text)');
  assert.equal(getCssProperty(cardCss, '.spinner', 'border'), '2px solid color-mix(in srgb, var(--bom-text) 15%, transparent)');
  assert.equal(getCssProperty(cardCss, '.frame-dot.active::after', 'background'), 'var(--bom-ui-accent-color, #F8FAFC)');
});

test('layer grid has a fixed header and an internally scrolling body', () => {
  assert.equal(getCssProperty(cardCss, '.bom-layer-panel, .bom-key-panel', 'overflow'), 'hidden');
  assert.equal(getCssProperty(cardCss, '.bom-layer-header, .bom-key-header', 'flex-shrink'), '0');
  assert.equal(getCssProperty(cardCss, '.bom-layer-body, .bom-key-body', 'overflow'), 'auto');
  assert.equal(getCssProperty(leafletCss, '.bom-layer-grid', 'grid-template-columns'), 'repeat(var(--bom-layer-columns,2),minmax(0,1fr))');
});

test('panels share theme-aware foreground and solid surface tokens', () => {
  assert.equal(getCssProperty(cardCss, '.bom-key-panel', 'position'), 'absolute');
  assert.equal(getCssProperty(cardCss, '.bom-key-panel', 'overflow'), 'hidden');
  assert.equal(getCssProperty(cardCss, '.bom-layer-panel, .bom-key-panel', 'color'), 'var(--bom-text)');
  assert.equal(getCssProperty(cardCss, '.bom-layer-panel, .bom-key-panel', 'background'), 'var(--bom-panel-background)');
});

test('isolates Leaflet below card-owned controls and overlays', () => {
  const mapZIndex = Number(getCssProperty(cardCss, '#map', 'z-index'));
  const controlsZIndex = Number(getCssProperty(cardCss, '.controls', 'z-index'));
  const badgeZIndex = Number(getCssProperty(cardCss, '.layer-badge', 'z-index'));
  const legendZIndex = Number(getCssProperty(cardCss, '.legend-card', 'z-index'));

  assert.equal(getCssProperty(cardCss, '#map', 'position'), 'relative');
  assert.equal(mapZIndex, 0);
  assert.ok(mapZIndex < controlsZIndex);
  assert.ok(mapZIndex < badgeZIndex);
  assert.ok(mapZIndex < legendZIndex);
});
