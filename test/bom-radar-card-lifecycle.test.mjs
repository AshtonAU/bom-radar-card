import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/bom-radar-card.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }

  _syncFromClassName() {
    this.classes = new Set(String(this.element.className || '').split(/\s+/).filter(Boolean));
  }

  _syncToClassName() {
    this.element.className = Array.from(this.classes).join(' ');
  }

  add(...classes) {
    this._syncFromClassName();
    classes.forEach((className) => this.classes.add(className));
    this._syncToClassName();
  }

  remove(...classes) {
    this._syncFromClassName();
    classes.forEach((className) => this.classes.delete(className));
    this._syncToClassName();
  }

  contains(className) {
    this._syncFromClassName();
    return this.classes.has(className);
  }

  toggle(className, force) {
    this._syncFromClassName();
    const shouldAdd = force ?? !this.classes.has(className);
    if (shouldAdd) {
      this.classes.add(className);
    } else {
      this.classes.delete(className);
    }
    this._syncToClassName();
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = {
      removeProperty(name) {
        delete this[name];
      },
    };
    this.dataset = {};
    this.attributes = {};
    this.eventListeners = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.id = '';
    this.alt = '';
    this.type = '';
    this.title = '';
    this.value = '';
    this.checked = false;
    this.src = '';
    this.onload = null;
    this.onerror = null;
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') {
      this.className = String(value);
      this.classList._syncFromClassName();
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, listener) {
    this.eventListeners[type] = this.eventListeners[type] || [];
    this.eventListeners[type].push(listener);
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 400, left: 0, right: 640, width: 640, height: 400 };
  }

  insertAdjacentHTML(position, html) {
    const element = this.ownerDocument.createElement('div');
    const classMatch = String(html).match(/class="([^"]+)"/);
    if (classMatch) element.className = classMatch[1];
    element.innerHTML = html;

    if (position !== 'beforebegin' || !this.parentNode) {
      this.appendChild(element);
      return;
    }

    const index = this.parentNode.children.indexOf(this);
    element.parentNode = this.parentNode;
    this.parentNode.children.splice(index < 0 ? 0 : index, 0, element);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      if (matchesSelector(element, selector)) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

class FakeShadowRoot extends FakeElement {
  constructor(ownerDocument) {
    super('#shadow-root', ownerDocument);
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];

    const card = this.ownerDocument.createElement('ha-card');
    const content = this.ownerDocument.createElement('div');
    content.className = this._innerHTML.includes('card-content is-square') ? 'card-content is-square' : 'card-content';
    const map = this.ownerDocument.createElement('div');
    map.id = 'map';
    const loading = this.ownerDocument.createElement('div');
    loading.id = 'loading';
    loading.className = 'loading-overlay';

    content.appendChild(map);
    content.appendChild(loading);

    if (this._innerHTML.includes('id="play-btn"')) {
      const controls = this.ownerDocument.createElement('div');
      controls.className = 'controls';
      const play = this.ownerDocument.createElement('button');
      play.id = 'play-btn';
      const timeline = this.ownerDocument.createElement('div');
      timeline.id = 'timeline';
      timeline.className = 'timeline';
      const label = this.ownerDocument.createElement('span');
      label.id = 'time-label';
      controls.appendChild(play);
      controls.appendChild(timeline);
      controls.appendChild(label);
      content.appendChild(controls);
    }

    card.appendChild(content);
    this.appendChild(card);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  getElementById(id) {
    return findElement(this, (element) => element.id === id);
  }
}

class FakeHTMLElement extends FakeElement {
  constructor() {
    super('custom-element', currentDocument);
    this.isConnected = false;
  }

  attachShadow() {
    this.shadowRoot = new FakeShadowRoot(this.ownerDocument);
    return this.shadowRoot;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.head = new FakeElement('head', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    if (selector === 'script[data-bom-radar-leaflet]') {
      return this.head.children.find((child) => child.tagName === 'SCRIPT' && child.dataset.bomRadarLeaflet) || null;
    }
    return super.querySelector(selector);
  }
}

let currentDocument = null;

function matchesSelector(element, selector) {
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return String(element.className).split(/\s+/).includes(selector.slice(1));
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function findElement(root, predicate) {
  for (const child of root.children) {
    if (predicate(child)) return child;
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function createCustomElementsRegistry() {
  const registry = new Map();
  return {
    define(name, ctor) {
      if (registry.has(name)) throw new Error(`the name "${name}" has already been used`);
      registry.set(name, ctor);
    },
    get(name) {
      return registry.get(name);
    },
  };
}

function createFakeLeaflet(document, options = {}) {
  class FakeMap {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      this.layers = [];
      this.controls = [];
      this.events = {};
      this.invalidateSizeCalls = 0;
      this.attributionControl = { setPrefix: () => {} };
    }

    getZoom() {
      return this.options.zoom;
    }

    on(events, listener) {
      events.split(/\s+/).forEach((eventName) => {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(listener);
      });
      return this;
    }

    hasLayer(layer) {
      return this.layers.includes(layer);
    }

    removeLayer(layer) {
      this.layers = this.layers.filter((existing) => existing !== layer);
    }

    remove() {
      this.removed = true;
      this.layers = [];
    }

    invalidateSize() {
      this.invalidateSizeCalls += 1;
    }

    panTo() {}
  }

  class FakeTileLayer {
    constructor(url = '', options = {}) {
      this.url = url;
      this.options = options;
      this.opacity = options.opacity ?? 1;
    }

    addTo(map) {
      this._map = map;
      map.layers.push(this);
      return this;
    }

    setOpacity(opacity) {
      this.opacity = opacity;
    }
  }

  function control() {
    return {
      addTo(map) {
        this._container = this.onAdd ? this.onAdd(map) : null;
        map.controls.push(this);
        return this;
      },
    };
  }

  control.zoom = () => ({
    addTo(map) {
      map.controls.push(this);
      return this;
    },
  });

  return {
    map: (container, options) => new FakeMap(container, options),
    tileLayer: (url, tileOptions) => {
      if (options.tileLayerThrows) throw new Error('tile layer failed');
      return new FakeTileLayer(url, tileOptions);
    },
    TileLayer: {
      extend(proto) {
        class ExtendedTileLayer extends FakeTileLayer {}
        Object.assign(ExtendedTileLayer.prototype, proto);
        return ExtendedTileLayer;
      },
    },
    control,
    marker: () => ({ addTo: (map) => { map.layers.push({ type: 'marker' }); } }),
    divIcon: (options) => options,
    DomUtil: {
      create(tagName, className, parent) {
        const element = document.createElement(tagName);
        element.className = className || '';
        if (parent) parent.appendChild(element);
        return element;
      },
    },
    DomEvent: {
      disableClickPropagation: () => {},
      disableScrollPropagation: () => {},
      on: (element, eventName, listener) => element.addEventListener(eventName, listener),
      stop: () => {},
    },
  };
}

function createSandbox({ preloadLeaflet = true, leafletDelayMs = 0, tileLayerThrows = false } = {}) {
  const document = new FakeDocument();
  currentDocument = document;
  const customElements = createCustomElementsRegistry();
  const fakeLeaflet = createFakeLeaflet(document, { tileLayerThrows });
  const window = { customCards: [] };
  if (preloadLeaflet) window.L = fakeLeaflet;

  document.head.appendChild = (child) => {
    child.parentNode = document.head;
    document.head.children.push(child);
    if (child.tagName === 'SCRIPT') {
      setTimeout(() => {
        window.L = fakeLeaflet;
        child.onload?.();
      }, leafletDelayMs);
    }
    return child;
  };

  const sandbox = {
    window,
    document,
    customElements,
    HTMLElement: FakeHTMLElement,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    fetch: async () => {
      throw new Error('offline in test');
    },
    DOMParser: class {},
    console: { info: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
  };

  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.__Card = customElements.get('bom-radar-card');\nthis.__createBomTileLayer = createBomTileLayer;`, sandbox);

  return {
    Card: sandbox.__Card,
    createBomTileLayer: sandbox.__createBomTileLayer,
    document,
    L: fakeLeaflet,
    sandbox,
  };
}

function issueConfig(overrides = {}) {
  return {
    layer: 'reflectivity',
    zoom_level: 9,
    map_height: 400,
    basemap_provider: 'carto',
    basemap_style: 'dark',
    dark_basemap: true,
    frame_delay: 500,
    restart_delay: 1500,
    frame_count: 9,
    radar_opacity: 0.7,
    chrome_opacity: 1,
    show_marker: true,
    show_zoom: true,
    show_recenter: true,
    show_layer_switcher: true,
    show_playback: true,
    show_legend: true,
    square_style: false,
    show_layer_label: false,
    show_attribution: true,
    allow_overzoom: true,
    center_latitude: -27.55425269410533,
    center_longitude: 153.08397843081823,
    ...overrides,
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), 'condition was not met before timeout');
}

function setConnected(card, isConnected) {
  card.isConnected = isConnected;
  if (isConnected) {
    card.connectedCallback();
  } else {
    card.disconnectedCallback();
  }
}

test('initializes after Home Assistant sets config and hass while card is disconnected', async () => {
  const { Card } = createSandbox();
  const card = new Card();

  card.setConfig(issueConfig());
  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };

  assert.equal(card._initialized, false);
  assert.equal(card._map, null);

  setConnected(card, true);

  await waitFor(() => card._timestamps.length === 9);
  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 9);
  assert.equal(card.shadowRoot.getElementById('loading').classList.contains('hidden'), true);
  assert.ok(card._map.invalidateSizeCalls >= 1);

  setConnected(card, false);
});

test('waits for config and hass when card is connected first', async () => {
  const { Card } = createSandbox();
  const card = new Card();

  setConnected(card, true);
  assert.equal(card._initialized, false);

  card.setConfig(issueConfig());
  assert.equal(card._initialized, false);

  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };
  await waitFor(() => card._timestamps.length === 9);

  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 9);
  assert.ok(card._map);

  setConnected(card, false);
});

test('can disconnect and reconnect through a full SPA navigation cycle', async () => {
  const { Card } = createSandbox();
  const card = new Card();

  card.setConfig(issueConfig());
  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };
  setConnected(card, true);

  await waitFor(() => card._timestamps.length === 9);
  const firstMap = card._map;

  setConnected(card, false);
  assert.equal(card._map, null);
  assert.equal(card._initialized, false);

  setConnected(card, true);
  await waitFor(() => card._timestamps.length === 9 && card._map && card._map !== firstMap);

  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 9);
  assert.equal(card.shadowRoot.getElementById('loading').classList.contains('hidden'), true);
  assert.notEqual(card._map, firstMap);

  setConnected(card, false);
});

test('cleans up partial map when initialization throws after map creation', async () => {
  const { Card } = createSandbox({ tileLayerThrows: true });
  const card = new Card();

  card.setConfig(issueConfig());
  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };
  setConnected(card, true);

  await waitFor(() => card._initialized === false);

  assert.equal(card._map, null);
  assert.match(card.shadowRoot.getElementById('loading').innerHTML, /Failed to load BOM weather data/);

  setConnected(card, false);
});

test('ignores stale async initialization that resolves after disconnect', async () => {
  const { Card } = createSandbox({ preloadLeaflet: false, leafletDelayMs: 30 });
  const card = new Card();

  setConnected(card, true);
  card.setConfig(issueConfig());
  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };

  assert.equal(card._initialized, true);
  setConnected(card, false);

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(card._map, null);
  assert.equal(card._initialized, false);

  setConnected(card, true);
  await waitFor(() => card._timestamps.length === 9);

  assert.ok(card._map);
  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 9);

  setConnected(card, false);
});

test('ignores stale radar data load that resolves after reconnect', async () => {
  const { Card } = createSandbox();
  const card = new Card();
  const originalLoadRadarData = card._loadRadarData.bind(card);
  const radarLoads = [];

  card._loadRadarData = async (L, initToken) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    radarLoads.push({ release });
    await gate;
    return originalLoadRadarData(L, initToken);
  };

  card.setConfig(issueConfig());
  card.hass = { config: { latitude: -27.55, longitude: 153.08 } };
  setConnected(card, true);

  await waitFor(() => card._map && radarLoads.length === 1);
  const firstMap = card._map;

  setConnected(card, false);
  setConnected(card, true);

  await waitFor(() => card._map && card._map !== firstMap && radarLoads.length === 2);
  const secondMap = card._map;

  radarLoads[0].release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(card._timestamps.length, 0);
  assert.equal(secondMap.layers.length, 1);
  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 0);

  radarLoads[1].release();
  await waitFor(() => card._timestamps.length === 9);

  assert.equal(card.shadowRoot.getElementById('timeline').children.length, 9);
  assert.ok(secondMap.layers.length > 1);

  setConnected(card, false);
});

test('BOM tile fallback calls Leaflet completion once after image error', () => {
  const { createBomTileLayer, L } = createSandbox();
  const layer = createBomTileLayer(
    L,
    'atm_surf_air_precip_reflectivity_dbz',
    'GoogleMapsCompatible_BoM',
    '2026-05-11T00:00:00Z',
  );

  let doneCalls = 0;
  const tile = layer.createTile({ z: 0, x: 1, y: 0 }, () => {
    doneCalls += 1;
  });

  tile.onerror();
  tile.onload();

  assert.equal(doneCalls, 1);
});
