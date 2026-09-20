import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { rollup } from 'rollup';

import { BOM_LAYERS } from '../src/bom-layers.js';
import { bundleUiFont } from '../scripts/bundle-ui-font.mjs';

const LEAFLET_TEST_MODULE_ID = '\0bom-radar-card-leaflet-test-double';

async function buildLifecycleBundle() {
  const bundle = await rollup({
    input: fileURLToPath(new URL('../src/bom-radar-card.js', import.meta.url)),
    plugins: [bundleUiFont(), {
      name: 'leaflet-lifecycle-test-boundary',
      resolveId(source) {
        return source === 'leaflet/dist/leaflet-src.esm.js' ? LEAFLET_TEST_MODULE_ID : null;
      },
      load(id) {
        if (id !== LEAFLET_TEST_MODULE_ID) return null;
        return `
          const leaflet = globalThis.__leafletTestDouble;
          export const TileLayer = leaflet.TileLayer;
          export const DomUtil = leaflet.DomUtil;
          export const DomEvent = leaflet.DomEvent;
          export const map = (...args) => leaflet.map(...args);
          export const tileLayer = (...args) => leaflet.tileLayer(...args);
          export const marker = (...args) => leaflet.marker(...args);
          export const divIcon = (...args) => leaflet.divIcon(...args);
          export const layerGroup = (...args) => leaflet.layerGroup(...args);
          export const canvas = (...args) => leaflet.canvas(...args);
          export const circleMarker = (...args) => leaflet.circleMarker(...args);
          export const control = (...args) => leaflet.control(...args);
          control.zoom = (...args) => leaflet.control.zoom(...args);
        `;
      },
    }],
  });

  try {
    const { output } = await bundle.generate({ format: 'iife' });
    return output[0].code;
  } finally {
    await bundle.close();
  }
}

// Rollup resolves the card's real ESM dependency graph. Only Leaflet, the
// browser rendering boundary, is replaced so lifecycle behavior still runs
// through the card's public custom-element API without network or a fake copy
// of the card implementation.
const lifecycleBundle = await buildLifecycleBundle();

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }

  _read() {
    this.classes = new Set(String(this.element.className || '').split(/\s+/).filter(Boolean));
  }

  _write() {
    this.element.className = [...this.classes].join(' ');
  }

  add(...classNames) {
    this._read();
    classNames.forEach((className) => this.classes.add(className));
    this._write();
  }

  remove(...classNames) {
    this._read();
    classNames.forEach((className) => this.classes.delete(className));
    this._write();
  }

  contains(className) {
    this._read();
    return this.classes.has(className);
  }

  toggle(className, force) {
    this._read();
    const shouldAdd = force ?? !this.classes.has(className);
    if (shouldAdd) this.classes.add(className);
    else this.classes.delete(className);
    this._write();
    return shouldAdd;
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return selector.slice(1).split('.').every(name => element.classList.contains(name));
  return element.localName === selector.toLowerCase();
}

function decodeHtmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function readHtmlAttribute(attributes, name) {
  return decodeHtmlAttribute(attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '');
}

function buildEditorControls(document, html) {
  const fragment = new FakeDocumentFragment(document);
  const selectPattern = /<select\b([^>]*\bid="[^"]+"[^>]*)>([\s\S]*?)<\/select>/g;
  const inputPattern = /<input\b([^>]*\bid="[^"]+"[^>]*)>/g;

  for (const match of html.matchAll(selectPattern)) {
    const [, attributes, options] = match;
    const select = document.createElement('select');
    select.id = readHtmlAttribute(attributes, 'id');
    const selectedOption = options.match(/<option\b([^>]*\bselected\b[^>]*)>/);
    const firstOption = options.match(/<option\b([^>]*)>/);
    select.value = readHtmlAttribute(selectedOption?.[1] ?? firstOption?.[1] ?? '', 'value');
    fragment.appendChild(select);
  }

  for (const match of html.matchAll(inputPattern)) {
    const attributes = match[1];
    const input = document.createElement('input');
    input.id = readHtmlAttribute(attributes, 'id');
    input.type = readHtmlAttribute(attributes, 'type');
    input.value = readHtmlAttribute(attributes, 'value');
    input.checked = /(?:^|\s)checked(?:\s|$)/.test(attributes);
    fragment.appendChild(input);
  }

  return fragment;
}

class FakeElement {
  constructor(localName = 'div', ownerDocument = null) {
    this.localName = localName.toLowerCase();
    this.tagName = localName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
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
    this.textContent = '';
    this.clientWidth = 640;
    this.clientHeight = 400;
    this.isConnected = true;
    this._innerHTML = '';
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  contains(element) {
    if (!element) return false;
    return this === element || this.children.some(child => child.contains(element));
  }

  focus(options) {
    this.focusOptions = options;
    this.ownerDocument.activeElement = this;
    let root = this;
    while (root.parentNode) root = root.parentNode;
    root.activeElement = this;
    this.focused = true;
  }

  matches(selector) {
    if (selector === ':focus-visible') return this.focusVisible === true;
    return matchesSelector(this, selector);
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    if (this.localName === '#shadow-root' && this._innerHTML.includes('<div class="editor">')) {
      this.appendChild(buildEditorControls(this.ownerDocument, this._innerHTML));
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, referenceNode) {
    if (child.localName === '#document-fragment') {
      for (const fragmentChild of [...child.children]) {
        this.insertBefore(fragmentChild, referenceNode);
      }
      child.children = [];
      return child;
    }

    child.remove();
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    const referenceIndex = referenceNode ? this.children.indexOf(referenceNode) : -1;
    if (referenceIndex === -1) this.children.push(child);
    else this.children.splice(referenceIndex, 0, child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index !== -1) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name === 'id') this.id = stringValue;
    if (name === 'class') this.className = stringValue;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    this.eventListeners[type] ||= [];
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    this.eventListeners[type] = (this.eventListeners[type] || []).filter(value => value !== listener);
  }

  dispatchEvent(event) {
    const resolvedEvent = typeof event === 'string' ? { type: event } : event;
    for (const listener of this.eventListeners[resolvedEvent.type] || []) {
      listener.call(this, resolvedEvent);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  getBoundingClientRect() {
    return {
      top: 0,
      bottom: this.clientHeight,
      left: 0,
      right: this.clientWidth,
      width: this.clientWidth,
      height: this.clientHeight,
    };
  }

  insertAdjacentHTML(position, html) {
    const element = this.ownerDocument.createElement(String(html).match(/<([a-z]+)/)?.[1] || 'div');
    const classMatch = String(html).match(/class="([^"]+)"/);
    if (classMatch) element.className = classMatch[1];
    element.innerHTML = html;
    const layerMatch = String(html).match(/data-layer="([^"]+)"/);
    if (layerMatch) element.dataset.layer = layerMatch[1];

    if (position === 'beforebegin' && this.parentNode) {
      this.parentNode.insertBefore(element, this);
    } else {
      this.appendChild(element);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
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

class FakeDocumentFragment extends FakeElement {
  constructor(ownerDocument) {
    super('#document-fragment', ownerDocument);
  }
}

function buildCardFragment(document, html) {
  const fragment = new FakeDocumentFragment(document);
  if (!html.includes('<ha-card')) return fragment;

  const style = document.createElement('style');
  const card = document.createElement('ha-card');
  const content = document.createElement('div');
  content.className = html.includes('card-content is-square') ? 'card-content is-square' : 'card-content';

  const map = document.createElement('div');
  map.id = 'map';
  const heightMatch = html.match(/id="map" style="height: ([0-9]+)px"/);
  map.style.height = `${heightMatch?.[1] ?? 300}px`;

  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.className = 'loading-overlay';
  loading.innerHTML = '<div class="spinner"></div><div class="loading-text">Loading BOM weather data</div>';

  content.appendChild(map);
  content.appendChild(loading);

  if (html.includes('id="play-btn"')) {
    const controls = document.createElement('div');
    controls.className = 'controls';
    const play = document.createElement('button');
    play.id = 'play-btn';
    play.innerHTML = html.match(/id="play-btn"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '';
    const timeline = document.createElement('div');
    timeline.id = 'timeline';
    timeline.className = 'timeline';
    const label = document.createElement('span');
    label.id = 'time-label';
    label.textContent = '--:--';
    controls.appendChild(play);
    controls.appendChild(timeline);
    controls.appendChild(label);
    content.appendChild(controls);
  }

  card.appendChild(content);
  fragment.appendChild(style);
  fragment.appendChild(card);
  return fragment;
}

class FakeTemplate extends FakeElement {
  constructor(ownerDocument) {
    super('template', ownerDocument);
    this.content = new FakeDocumentFragment(ownerDocument);
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.content = buildCardFragment(this.ownerDocument, this._innerHTML);
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

class FakeShadowRoot extends FakeElement {
  constructor(ownerDocument) {
    super('#shadow-root', ownerDocument);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
}

let currentDocument = null;

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

  createElement(localName) {
    if (localName === 'template') return new FakeTemplate(this);
    return new FakeElement(localName, this);
  }
}

function createCustomElementsRegistry() {
  const constructors = new Map();
  const hiddenNextGets = new Set();
  const defineAttempts = [];

  return {
    defineAttempts,
    define(name, constructor) {
      defineAttempts.push(name);
      if (constructors.has(name)) throw new Error(`the name "${name}" has already been used`);
      constructors.set(name, constructor);
    },
    get(name) {
      if (hiddenNextGets.delete(name)) return undefined;
      return constructors.get(name);
    },
    hideNextGet(name) {
      hiddenNextGets.add(name);
    },
  };
}

function createScheduler() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const animationFrames = new Map();

  return {
    timeouts,
    intervals,
    animationFrames,
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback, delay = 0) {
      const id = nextId++;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      animationFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      animationFrames.delete(id);
    },
    flushAnimationFrames() {
      const queuedFrames = [...animationFrames.entries()];
      animationFrames.clear();
      queuedFrames.forEach(([, callback]) => callback(0));
    },
    runNextTimeout(delay) {
      const entry = [...timeouts.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected an active ${delay}ms timeout`);
      const [id, timer] = entry;
      timeouts.delete(id);
      timer.callback();
    },
    activeTimeoutDelays() {
      return [...timeouts.values()].map((timer) => timer.delay);
    },
  };
}

function createLeafletDouble(document, renderControlContainers = false) {
  const state = {
    maps: [],
    tileLayerCalls: [],
    tileLayerThrows: false,
  };

  class FakeMap {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      this.layers = [];
      this.controls = [];
      this.events = {};
      this.panes = {};
      this.invalidateSizeCalls = 0;
      this.removed = false;
      if (renderControlContainers) {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'leaflet-top leaflet-right';
        container.appendChild(this.toolbar);
        if (options.attributionControl) {
          const credits = document.createElement('div');
          credits.className = 'leaflet-control-attribution';
          credits.clientWidth = 140;
          credits.clientHeight = 18;
          container.appendChild(credits);
        }
      }
      this.attributionControl = {
        attributions: [],
        setPrefix: () => {},
        addAttribution: (attribution) => this.attributionControl.attributions.push(attribution),
      };
    }

    getZoom() {
      return this.options.zoom;
    }

    getPane(name) {
      return this.panes[name] || null;
    }

    createPane(name) {
      const pane = { style: {} };
      this.panes[name] = pane;
      return pane;
    }

    on(eventNames, listener) {
      eventNames.split(/\s+/).forEach((eventName) => {
        this.events[eventName] ||= [];
        this.events[eventName].push(listener);
      });
      return this;
    }

    hasLayer(layer) {
      return this.layers.includes(layer);
    }

    removeLayer(layer) {
      this.layers = this.layers.filter((candidate) => candidate !== layer);
      return this;
    }

    remove() {
      this.removed = true;
      this.layers = [];
    }

    invalidateSize() {
      this.invalidateSizeCalls += 1;
      return this;
    }

    panTo() {
      return this;
    }
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
      return this;
    }

    bringToFront() {
      return this;
    }
  }

  function control() {
    return {
      addTo(map) {
        this._container = this.onAdd?.(map) ?? null;
        if (this._container && map.toolbar) map.toolbar.appendChild(this._container);
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

  const leaflet = {
    map(container, options) {
      const map = new FakeMap(container, options);
      state.maps.push(map);
      return map;
    },
    tileLayer(url, options) {
      state.tileLayerCalls.push({ url, options });
      if (state.tileLayerThrows) throw new Error('tile layer failed');
      return new FakeTileLayer(url, options);
    },
    TileLayer: {
      extend(prototype) {
        class ExtendedTileLayer extends FakeTileLayer {}
        Object.assign(ExtendedTileLayer.prototype, prototype);
        return ExtendedTileLayer;
      },
    },
    control,
    marker() {
      const marker = {
        addTo(map) {
          map.layers.push(marker);
          return marker;
        },
      };
      return marker;
    },
    divIcon(options) {
      return options;
    },
    layerGroup() {
      const layers = [];
      const group = {
        addTo(map) {
          group._map = map;
          map.layers.push(group);
          return group;
        },
        addLayer(layer) {
          layers.push(layer);
          return group;
        },
        removeLayer(layer) {
          const index = layers.indexOf(layer);
          if (index !== -1) layers.splice(index, 1);
          return group;
        },
      };
      return group;
    },
    canvas() {
      return { _ctx: {}, _redraw() {} };
    },
    circleMarker() {
      return { setStyle() {}, setRadius() {} };
    },
    DomUtil: {
      create(localName, className, parent) {
        const element = document.createElement(localName);
        element.className = className || '';
        parent?.appendChild(element);
        return element;
      },
    },
    DomEvent: {
      disableClickPropagation() {},
      disableScrollPropagation() {},
      on(element, eventName, listener) {
        element.addEventListener(eventName, listener);
      },
      stop() {},
    },
  };

  return { leaflet, state };
}

function createWindow() {
  const listeners = {};
  return {
    customCards: [],
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(type, listener) {
      listeners[type] ||= new Set();
      listeners[type].add(listener);
    },
    removeEventListener(type, listener) {
      listeners[type]?.delete(listener);
    },
    listenerCount(type) {
      return listeners[type]?.size ?? 0;
    },
    dispatchEvent(event) {
      for (const listener of listeners[event.type] || []) listener(event);
    },
    matchMedia() {
      return { matches: false };
    },
  };
}

function evaluateLifecycleBundle(sandbox) {
  new vm.Script(lifecycleBundle, { filename: 'bom-radar-card.lifecycle-bundle.js' }).runInContext(sandbox);
}

function createHarness({ tileLayerThrows = false, imageResponder = () => true, renderControlContainers = false } = {}) {
  const document = new FakeDocument();
  currentDocument = document;
  const customElements = createCustomElementsRegistry();
  const scheduler = createScheduler();
  const window = createWindow();
  const { leaflet, state: leafletState } = createLeafletDouble(document, renderControlContainers);
  leafletState.tileLayerThrows = tileLayerThrows;
  const consoleMessages = { info: [], warn: [], error: [] };
  const observerState = { resize: [], intersection: [] };
  const imageProbeState = { requests: [] };

  class FakeImage {
    constructor() {
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.onload = null;
      this.onerror = null;
      this._src = '';
    }

    set src(value) {
      this._src = String(value);
      const request = { image: this, url: this._src };
      imageProbeState.requests.push(request);
      const response = imageResponder(request.url, imageProbeState.requests.length - 1);
      Promise.resolve(response).then((available) => {
        if (available === undefined) return;
        if (available) {
          this.naturalWidth = 256;
          this.naturalHeight = 256;
          this.onload?.();
        } else {
          this.onerror?.();
        }
      });
    }

    get src() {
      return this._src;
    }
  }

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      this.observations = [];
      observerState.resize.push(this);
    }

    observe(target, options) {
      this.observations.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      this.observations = [];
      observerState.intersection.push(this);
    }

    observe(target) {
      this.observations.push(target);
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      Object.assign(this, options);
    }
  }

  const sandbox = vm.createContext({
    __leafletTestDouble: leaflet,
    window,
    document,
    Image: FakeImage,
    customElements,
    HTMLElement: FakeHTMLElement,
    ResizeObserver: FakeResizeObserver,
    IntersectionObserver: FakeIntersectionObserver,
    CustomEvent: FakeCustomEvent,
    console: {
      info: (...args) => consoleMessages.info.push(args),
      warn: (...args) => consoleMessages.warn.push(args),
      error: (...args) => consoleMessages.error.push(args),
    },
    setTimeout: (callback, delay) => scheduler.setTimeout(callback, delay),
    clearTimeout: (id) => scheduler.clearTimeout(id),
    setInterval: (callback, delay) => scheduler.setInterval(callback, delay),
    clearInterval: (id) => scheduler.clearInterval(id),
    requestAnimationFrame: (callback) => scheduler.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => scheduler.cancelAnimationFrame(id),
  });

  evaluateLifecycleBundle(sandbox);

  return {
    Card: customElements.get('bom-radar-card'),
    Editor: customElements.get('bom-radar-card-editor'),
    consoleMessages,
    customElements,
    document,
    imageProbeState,
    leafletState,
    observerState,
    sandbox,
    scheduler,
    window,
  };
}

function issueConfig(overrides = {}) {
  return {
    layer: 'reflectivity',
    zoom_level: 7,
    map_height: 400,
    basemap_provider: 'bom',
    basemap_style: 'dark',
    frame_delay: 500,
    restart_delay: 1500,
    frame_count: 9,
    show_marker: false,
    show_zoom: false,
    show_recenter: false,
    show_layer_switcher: false,
    show_legend: false,
    show_attribution: false,
    show_lightning: false,
    ...overrides,
  };
}

function issueHass(states = {}) {
  return {
    config: { latitude: -27.55, longitude: 153.08 },
    states,
  };
}

function setConnected(card, isConnected) {
  card.isConnected = isConnected;
  if (isConnected) card.connectedCallback();
  else card.disconnectedCallback();
}

async function flushUntil(predicate, message = 'condition was not met') {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await Promise.resolve();
    if (predicate()) return;
  }
  assert.ok(predicate(), message);
}

function timeline(card) {
  return card.shadowRoot.getElementById('timeline');
}

function activeFrameIndex(card) {
  return timeline(card).children.findIndex((frame) => frame.classList.contains('active'));
}

async function initializeCard(harness, config, hass = issueHass()) {
  const card = new harness.Card();
  card.setConfig(config);
  card.hass = hass;
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === config.frame_count);
  return card;
}

test('initializes after Home Assistant sets config and hass while the card is disconnected', async () => {
  const harness = createHarness();
  const card = new harness.Card();

  card.setConfig(issueConfig());
  card.hass = issueHass();
  assert.equal(harness.leafletState.maps.length, 0);

  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  assert.equal(harness.leafletState.maps.length, 1);
  assert.equal(timeline(card).children.length, 9);
  assert.equal(harness.imageProbeState.requests.length, 2);
  for (const { url } of harness.imageProbeState.requests) {
    const probeUrl = new URL(url);
    assert.equal(probeUrl.searchParams.get('TILEMATRIXSET'), 'GoogleMapsCompatible_BoM');
    assert.equal(probeUrl.searchParams.get('TILEMATRIX'), '0');
    assert.equal(probeUrl.searchParams.get('TILEROW'), '0');
    assert.equal(probeUrl.searchParams.get('TILECOL'), '0');
  }
  assert.equal(card.shadowRoot.getElementById('loading').classList.contains('hidden'), true);
  assert.ok(harness.leafletState.maps[0].invalidateSizeCalls >= 1);

  setConnected(card, false);
});

test('waits for both config and hass when the card is connected first', async () => {
  const harness = createHarness();
  const card = new harness.Card();

  setConnected(card, true);
  card.setConfig(issueConfig());
  assert.equal(harness.leafletState.maps.length, 0);

  card.hass = issueHass();
  await flushUntil(() => timeline(card)?.children.length === 9);

  assert.equal(harness.leafletState.maps.length, 1);
  assert.equal(timeline(card).children.length, 9);

  setConnected(card, false);
});

test('disconnects and reconnects through a full Home Assistant view lifecycle', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const firstMap = harness.leafletState.maps[0];
  const firstResizeObserver = harness.observerState.resize[0];
  const firstIntersectionObserver = harness.observerState.intersection[0];
  const firstMapInvalidations = firstMap.invalidateSizeCalls;
  assert.equal(harness.window.listenerCount('resize'), 1);
  assert.equal(harness.scheduler.intervals.size, 1);
  assert.ok(harness.scheduler.activeTimeoutDelays().includes(500));
  assert.equal(firstResizeObserver.disconnected, false);
  assert.equal(firstIntersectionObserver.disconnected, false);

  setConnected(card, false);
  assert.equal(firstMap.removed, true);
  assert.equal(harness.window.listenerCount('resize'), 0);
  assert.equal(harness.scheduler.intervals.size, 0);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(500), false);
  assert.equal(firstResizeObserver.disconnected, true);
  assert.equal(firstIntersectionObserver.disconnected, true);

  harness.scheduler.flushAnimationFrames();
  assert.equal(firstMap.invalidateSizeCalls, firstMapInvalidations);

  setConnected(card, true);
  await flushUntil(() => harness.leafletState.maps.length === 2 && timeline(card)?.children.length === 9);

  const secondMap = harness.leafletState.maps[1];
  const secondResizeObserver = harness.observerState.resize[1];
  const secondIntersectionObserver = harness.observerState.intersection[1];
  assert.notEqual(secondMap, firstMap);
  assert.equal(timeline(card).children.length, 9);
  assert.equal(harness.window.listenerCount('resize'), 1);
  assert.equal(harness.scheduler.intervals.size, 1);
  assert.ok(harness.scheduler.activeTimeoutDelays().includes(500));
  assert.equal(secondResizeObserver.disconnected, false);
  assert.equal(secondIntersectionObserver.disconnected, false);

  const secondMapInvalidations = secondMap.invalidateSizeCalls;

  setConnected(card, false);
  assert.equal(secondMap.removed, true);
  assert.equal(harness.window.listenerCount('resize'), 0);
  assert.equal(harness.scheduler.intervals.size, 0);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(500), false);
  assert.equal(secondResizeObserver.disconnected, true);
  assert.equal(secondIntersectionObserver.disconnected, true);
  harness.scheduler.flushAnimationFrames();
  assert.equal(secondMap.invalidateSizeCalls, secondMapInvalidations);
});

test('does not finish an initialization after the card disconnects', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  setConnected(card, true);

  card.hass = issueHass();
  const abandonedMap = harness.leafletState.maps[0];
  assert.ok(abandonedMap, 'map creation begins synchronously');

  setConnected(card, false);
  await flushUntil(() => abandonedMap.removed);
  for (let attempt = 0; attempt < 10; attempt += 1) await Promise.resolve();

  assert.equal(harness.leafletState.maps.length, 1);
  assert.equal(abandonedMap.layers.length, 0);
  assert.equal(timeline(card).children.length, 0);
  assert.equal(harness.window.listenerCount('resize'), 0);
  assert.equal(harness.scheduler.intervals.size, 0);
});

test('suppresses stale radar completion across an immediate disconnect and reconnect', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  setConnected(card, true);

  card.hass = issueHass();
  const firstMap = harness.leafletState.maps[0];
  assert.ok(firstMap, 'the first map is created before radar timestamps resolve');

  setConnected(card, false);
  setConnected(card, true);
  const secondMap = harness.leafletState.maps[1];
  assert.ok(secondMap, 'reconnect starts a fresh initialization');

  await flushUntil(() => timeline(card)?.children.length === 9);

  assert.equal(firstMap.removed, true);
  assert.equal(firstMap.layers.length, 0);
  assert.equal(secondMap.removed, false);
  assert.equal(timeline(card).children.length, 9);
  assert.equal(secondMap.layers.length, 10, 'one basemap plus nine current radar frames');

  setConnected(card, false);
});

test('corrects a confirmed forecast rollover with z0 probes while preserving seven frames', async () => {
  const probeResults = [true, false, false, true];
  const harness = createHarness({
    imageResponder: (_url, index) => probeResults[index],
  });
  const card = new harness.Card();
  card.setConfig(issueConfig({ layer: 'forecast_rain_chance_daily', frame_count: 9 }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 7);

  assert.equal(harness.imageProbeState.requests.length, 4);
  const probeUrls = harness.imageProbeState.requests.map(({ url }) => new URL(url));
  for (const url of probeUrls) {
    assert.equal(url.searchParams.get('TILEMATRIXSET'), 'GoogleMapsCompatible_BoM_ADFD');
    assert.equal(url.searchParams.get('TILEMATRIX'), '0');
    assert.equal(url.searchParams.get('TILEROW'), '0');
    assert.equal(url.searchParams.get('TILECOL'), '0');
  }

  const nominalFirst = probeUrls[0].searchParams.get('time');
  const nominalLast = probeUrls[1].searchParams.get('time');
  const replacement = probeUrls[3].searchParams.get('time');
  assert.equal(probeUrls[2].searchParams.get('time'), nominalLast, 'the failed boundary is retried once');
  assert.equal(Date.parse(nominalFirst) - Date.parse(replacement), 24 * 60 * 60 * 1000);
  assert.equal(card._timestamps.length, 7);
  assert.equal(card._timestamps[0], replacement);
  assert.equal(card._timestamps[1], nominalFirst);
  assert.equal(card._timestamps.at(-1), new Date(Date.parse(nominalLast) - 24 * 60 * 60 * 1000)
    .toISOString().replace('.000Z', 'Z'));

  setConnected(card, false);
});

test('keeps old layers visible and commits only the newest overlapping same-layer refresh', async () => {
  let deferDailyProbes = false;
  const pendingProbeResolutions = [];
  const harness = createHarness({
    imageResponder: (url) => {
      if (!deferDailyProbes || !url.includes(BOM_LAYERS.forecast_rain_chance_daily.id)) return true;
      return new Promise((resolve) => pendingProbeResolutions.push(resolve));
    },
  });
  const card = new harness.Card();
  card.setConfig(issueConfig({ show_layer_label: true, show_layer_switcher: true }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const originalLayers = [...card._radarLayers];
  const originalTimestamps = [...card._timestamps];
  deferDailyProbes = true;
  const firstRefresh = card._setLayer('forecast_rain_chance_daily');
  await flushUntil(() => pendingProbeResolutions.length === 2, 'daily boundary probes did not start');

  assert.equal(card._radarLayers.length, originalLayers.length);
  assert.ok(card._radarLayers.every((layer, index) => layer === originalLayers[index]),
    'the current frames remain mounted while probes run');
  assert.equal(JSON.stringify(card._timestamps), JSON.stringify(originalTimestamps));

  const secondRefresh = card._refreshData();
  await flushUntil(() => pendingProbeResolutions.length === 2, 'overlap should share in-flight probes');
  pendingProbeResolutions.forEach((resolve) => resolve(true));
  await firstRefresh;
  await secondRefresh;

  assert.equal(card._config.layer, 'forecast_rain_chance_daily');
  assert.equal(card._committedRadarLayerKey, 'forecast_rain_chance_daily');
  assert.equal(card._timestamps.length, 7);
  assert.equal(card._radarLayers.length, 7);
  assert.ok(originalLayers.every((layer) => !card._map.layers.includes(layer)));
  assert.equal(card._map.layers.length, 8, 'one basemap plus seven current forecast frames');
  assert.equal(card._layerSwitcher.button.title, 'Weather layer: Chance of rain · daily');
  assert.match(card.shadowRoot.querySelector('.layer-badge').innerHTML, /Chance of rain · daily/);
  assert.ok(timeline(card).children.every((dot) => /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/
    .test(dot.getAttribute('aria-label'))), 'the committed daily product owns timeline formatting');
  assert.equal(harness.scheduler.activeTimeoutDelays().filter((delay) => delay === 500).length, 1);

  setConnected(card, false);
});

test('discards an A-to-B completion after the card switches back to A', async () => {
  let deferDailyProbes = false;
  const pendingProbeResolutions = [];
  const harness = createHarness({
    imageResponder: (url) => {
      if (!deferDailyProbes || !url.includes(BOM_LAYERS.forecast_rain_chance_daily.id)) return true;
      return new Promise((resolve) => pendingProbeResolutions.push(resolve));
    },
  });
  const card = new harness.Card();
  card.setConfig(issueConfig());
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);
  const reflectivityTimestamps = [...card._timestamps];

  deferDailyProbes = true;
  const switchToDaily = card._setLayer('forecast_rain_chance_daily');
  await flushUntil(() => pendingProbeResolutions.length === 2, 'daily boundary probes did not start');
  const switchBack = card._setLayer('reflectivity');
  await switchBack;

  pendingProbeResolutions.forEach((resolve) => resolve(true));
  await switchToDaily;

  assert.equal(card._config.layer, 'reflectivity');
  assert.equal(JSON.stringify(card._timestamps), JSON.stringify(reflectivityTimestamps));
  assert.equal(card._radarLayers.length, 9);
  assert.equal(card._map.layers.length, 10, 'one basemap plus the current nine reflectivity frames');
  assert.equal(harness.scheduler.activeTimeoutDelays().filter((delay) => delay === 500).length, 1);

  setConnected(card, false);
});

test('offers and manages the opt-in radar coverage layer only for supported radar products', async () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  editor.setConfig({ layer: 'reflectivity' });
  assert.match(editor.shadowRoot.innerHTML, /id="show_radar_coverage"/);
  editor.setConfig({ layer: 'air_temperature', show_radar_coverage: true });
  assert.doesNotMatch(editor.shadowRoot.innerHTML, /id="show_radar_coverage"/);

  const card = new harness.Card();
  card.setConfig(issueConfig({ show_radar_coverage: true, allow_overzoom: true }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9 && card._radarCoverageLayer);

  const firstCoverageLayer = card._radarCoverageLayer;
  const coverageCalls = () => harness.leafletState.tileLayerCalls
    .filter(({ url }) => url.includes('/radar_coverage/MapServer/tile/'));
  assert.equal(coverageCalls().length, 1);
  assert.equal(firstCoverageLayer.options.maxNativeZoom, 10);
  assert.equal(firstCoverageLayer.options.maxZoom, 10);
  assert.equal(card._map.panes.bomRadarCoveragePane.style.zIndex, '350');
  assert.equal(card._map.panes.bomRadarCoveragePane.style.pointerEvents, 'none');

  await card._setLayer('air_temperature');
  assert.equal(card._radarCoverageLayer, null);
  assert.equal(card._map.hasLayer(firstCoverageLayer), false);

  await card._setLayer('rain_rate');
  assert.ok(card._radarCoverageLayer);
  assert.notEqual(card._radarCoverageLayer, firstCoverageLayer);
  assert.equal(coverageCalls().length, 2);
  card._syncRadarCoverageLayer();
  assert.equal(coverageCalls().length, 2, 'repeated sync does not duplicate the coverage layer');

  const map = card._map;
  setConnected(card, false);
  assert.equal(card._radarCoverageLayer, null);
  assert.equal(map.layers.length, 0);
});

test('keeps radar and coverage consistent while a supported layer switch is pending', async () => {
  let deferDailyProbes = false;
  const pendingProbeResolutions = [];
  const harness = createHarness({
    imageResponder: (url) => {
      if (!deferDailyProbes || !url.includes(BOM_LAYERS.forecast_rain_chance_daily.id)) return true;
      return new Promise((resolve) => pendingProbeResolutions.push(resolve));
    },
  });
  const card = new harness.Card();
  card.setConfig(issueConfig({ show_radar_coverage: true }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => card._radarCoverageLayer && timeline(card)?.children.length === 9);

  const oldCoverage = card._radarCoverageLayer;
  const oldLayers = [...card._radarLayers];
  deferDailyProbes = true;
  const switchLayer = card._setLayer('forecast_rain_chance_daily');
  await flushUntil(() => pendingProbeResolutions.length === 2);

  assert.equal(card._radarCoverageLayer, oldCoverage);
  assert.ok(card._radarLayers.every((layer, index) => layer === oldLayers[index]));
  pendingProbeResolutions.forEach((resolve) => resolve(true));
  await switchLayer;

  assert.equal(card._radarCoverageLayer, null);
  assert.equal(card._radarLayers.length, 7);
  assert.ok(oldLayers.every((layer) => !card._map.hasLayer(layer)));

  setConnected(card, false);
});

test('leaves the previous radar layers mounted if a refresh replacement throws', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const originalLayers = [...card._radarLayers];
  const originalTimestamps = [...card._timestamps];
  const originalMapLayers = [...card._map.layers];
  const originalTileLayerExtend = harness.sandbox.__leafletTestDouble.TileLayer.extend;
  let partiallyAddedLayer = null;
  harness.sandbox.__leafletTestDouble.TileLayer.extend = () => class {
    addTo(map) {
      partiallyAddedLayer = this;
      map.layers.push(this);
      throw new Error('tile layer add failed');
    }
  };
  try {
    await card._refreshData();
  } finally {
    harness.sandbox.__leafletTestDouble.TileLayer.extend = originalTileLayerExtend;
  }

  assert.equal(card._radarLayers.length, originalLayers.length);
  assert.ok(card._radarLayers.every((layer, index) => layer === originalLayers[index]));
  assert.equal(JSON.stringify(card._timestamps), JSON.stringify(originalTimestamps));
  assert.ok(originalLayers.every((layer) => card._map.hasLayer(layer)));
  assert.equal(card._map.layers.length, originalMapLayers.length);
  assert.equal(card._map.hasLayer(partiallyAddedLayer), false,
    'a layer registered by Leaflet before addTo throws is removed');
  assert.equal(harness.consoleMessages.warn.length, 1);
  assert.match(String(harness.consoleMessages.warn[0][0]), /Refresh failed/);

  setConnected(card, false);
});

test('rolls a failed product switch back without mislabelling the previous radar data', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig({
    show_layer_label: true,
    show_layer_switcher: true,
    show_radar_coverage: true,
  }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => card._radarCoverageLayer && timeline(card)?.children.length === 9);

  const originalLayers = [...card._radarLayers];
  const originalTimestamps = [...card._timestamps];
  const originalCoverageLayer = card._radarCoverageLayer;
  const originalMapLayers = [...card._map.layers];
  const originalTimeline = timeline(card).children.map((dot) => ({
    className: dot.className,
    label: dot.getAttribute('aria-label'),
  }));
  const originalTimeLabel = card.shadowRoot.getElementById('time-label').textContent;
  const originalTileLayerExtend = harness.sandbox.__leafletTestDouble.TileLayer.extend;
  let partiallyAddedLayer = null;
  harness.sandbox.__leafletTestDouble.TileLayer.extend = () => class {
    addTo(map) {
      partiallyAddedLayer = this;
      map.layers.push(this);
      throw new Error('target product add failed');
    }
  };
  try {
    await card._setLayer('forecast_rain_chance_daily');
  } finally {
    harness.sandbox.__leafletTestDouble.TileLayer.extend = originalTileLayerExtend;
  }

  const reflectivityOption = card._layerSwitcher.panel.querySelectorAll('.bom-layer-option')
    .find((option) => option.dataset.layer === 'reflectivity');
  const forecastOption = card._layerSwitcher.panel.querySelectorAll('.bom-layer-option')
    .find((option) => option.dataset.layer === 'forecast_rain_chance_daily');
  assert.equal(card._config.layer, 'reflectivity');
  assert.ok(card._radarLayers.every((layer, index) => layer === originalLayers[index]));
  assert.equal(JSON.stringify(card._timestamps), JSON.stringify(originalTimestamps));
  assert.equal(card._radarCoverageLayer, originalCoverageLayer);
  assert.deepEqual(card._map.layers, originalMapLayers);
  assert.equal(card._map.hasLayer(partiallyAddedLayer), false);
  assert.deepEqual(timeline(card).children.map((dot) => ({
    className: dot.className,
    label: dot.getAttribute('aria-label'),
  })), originalTimeline);
  assert.equal(card.shadowRoot.getElementById('time-label').textContent, originalTimeLabel);
  assert.equal(card._layerSwitcher.button.title, 'Weather layer: Rain reflectivity');
  assert.equal(reflectivityOption.getAttribute('aria-pressed'), 'true');
  assert.equal(forecastOption.getAttribute('aria-pressed'), 'false');
  assert.match(card.shadowRoot.querySelector('.layer-badge').innerHTML, /Rain reflectivity/);
  assert.equal(harness.consoleMessages.warn.length, 1);
  assert.match(String(harness.consoleMessages.warn[0][0]), /Failed to switch to layer/);

  setConnected(card, false);
});

test('rolls A-to-B-pending then C-failed back to the committed A product', async () => {
  let deferDailyProbes = false;
  const pendingDailyProbeResolutions = [];
  const harness = createHarness({
    imageResponder: (url) => {
      if (!deferDailyProbes || !url.includes(BOM_LAYERS.forecast_rain_chance_daily.id)) return true;
      return new Promise((resolve) => pendingDailyProbeResolutions.push(resolve));
    },
  });
  const card = new harness.Card();
  card.setConfig(issueConfig({
    show_layer_label: true,
    show_layer_switcher: true,
    show_radar_coverage: true,
  }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => card._radarCoverageLayer && timeline(card)?.children.length === 9);

  const committedTimestamps = [...card._timestamps];
  const committedCoverageLayer = card._radarCoverageLayer;
  const committedTimelineLabels = timeline(card).children.map((dot) => dot.getAttribute('aria-label'));
  deferDailyProbes = true;
  const switchToB = card._setLayer('forecast_rain_chance_daily');
  await flushUntil(() => pendingDailyProbeResolutions.length === 2, 'B boundary probes did not start');

  await card._rebuildRadarLayers();
  const rebuiltCommittedLayers = [...card._radarLayers];
  assert.equal(card._committedRadarLayerKey, 'reflectivity');
  assert.ok(rebuiltCommittedLayers.every((layer) => (
    layer.getTileUrl({ z: 0, x: 1, y: 0 }).includes(BOM_LAYERS.reflectivity.id)
  )),
    'a zoom rebuild uses the displayed A product while B is still pending');

  const originalTileLayerExtend = harness.sandbox.__leafletTestDouble.TileLayer.extend;
  let partiallyAddedCLayer = null;
  harness.sandbox.__leafletTestDouble.TileLayer.extend = () => class {
    addTo(map) {
      partiallyAddedCLayer = this;
      map.layers.push(this);
      throw new Error('C product add failed');
    }
  };
  try {
    await card._setLayer('air_temperature');
  } finally {
    harness.sandbox.__leafletTestDouble.TileLayer.extend = originalTileLayerExtend;
  }

  assert.equal(card._config.layer, 'reflectivity');
  assert.equal(card._committedRadarLayerKey, 'reflectivity');
  assert.ok(card._radarLayers.every((layer, index) => layer === rebuiltCommittedLayers[index]));
  assert.equal(JSON.stringify(card._timestamps), JSON.stringify(committedTimestamps));
  assert.equal(card._radarCoverageLayer, committedCoverageLayer);
  assert.equal(card._map.hasLayer(partiallyAddedCLayer), false);
  assert.equal(card._layerSwitcher.button.title, 'Weather layer: Rain reflectivity');
  assert.match(card.shadowRoot.querySelector('.layer-badge').innerHTML, /Rain reflectivity/);
  assert.deepEqual(
    timeline(card).children.map((dot) => dot.getAttribute('aria-label')),
    committedTimelineLabels,
    'the timeline remains formatted for committed observed radar data',
  );

  pendingDailyProbeResolutions.forEach((resolve) => resolve(true));
  await switchToB;

  assert.equal(card._config.layer, 'reflectivity');
  assert.equal(card._committedRadarLayerKey, 'reflectivity');
  assert.ok(card._radarLayers.every((layer, index) => layer === rebuiltCommittedLayers[index]),
    'the stale B completion cannot replace committed A');
  assert.equal(card._radarCoverageLayer, committedCoverageLayer);
  assert.equal(card._layerSwitcher.button.title, 'Weather layer: Rain reflectivity');

  setConnected(card, false);
  assert.equal(card._committedRadarLayerKey, null);
});

test('cleans up a coverage layer if Leaflet registers it before addTo throws', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const originalMapLayers = [...card._map.layers];
  const originalTileLayer = harness.sandbox.__leafletTestDouble.tileLayer;
  harness.sandbox.__leafletTestDouble.tileLayer = (url, options) => {
    if (url.includes('/radar_coverage/MapServer/tile/')) {
      throw new Error('coverage construction failed');
    }
    return originalTileLayer(url, options);
  };
  card._config.show_radar_coverage = true;
  assert.doesNotThrow(() => card._syncRadarCoverageLayer());
  assert.equal(card._radarCoverageLayer, null);
  assert.deepEqual(card._map.layers, originalMapLayers);
  assert.equal(harness.consoleMessages.warn.length, 1);

  let partiallyAddedCoverageLayer = null;
  harness.sandbox.__leafletTestDouble.tileLayer = (url, options) => {
    if (!url.includes('/radar_coverage/MapServer/tile/')) {
      return originalTileLayer(url, options);
    }
    partiallyAddedCoverageLayer = {
      options,
      addTo(map) {
        map.layers.push(this);
        throw new Error('coverage add failed');
      },
    };
    return partiallyAddedCoverageLayer;
  };
  try {
    assert.doesNotThrow(() => card._syncRadarCoverageLayer());
  } finally {
    harness.sandbox.__leafletTestDouble.tileLayer = originalTileLayer;
  }

  assert.equal(card._radarCoverageLayer, null);
  assert.equal(card._map.hasLayer(partiallyAddedCoverageLayer), false);
  assert.deepEqual(card._map.layers, originalMapLayers);
  assert.equal(harness.consoleMessages.warn.length, 2);
  assert.ok(harness.consoleMessages.warn.every(([message]) => /radar coverage layer/.test(String(message))));

  setConnected(card, false);
});

test('cleans up a partial map failure and recovers on a later hass update', async () => {
  const harness = createHarness({ tileLayerThrows: true });
  const card = new harness.Card();
  card.setConfig(issueConfig());
  setConnected(card, true);
  card.hass = issueHass();

  await flushUntil(
    () => card.shadowRoot.getElementById('loading')?.innerHTML.includes('Failed to load BOM weather data'),
    'initialization failure was not rendered',
  );

  const failedMap = harness.leafletState.maps[0];
  assert.equal(failedMap.removed, true);
  assert.equal(failedMap.layers.length, 0);
  assert.equal(harness.window.listenerCount('resize'), 0);
  assert.equal(harness.consoleMessages.error.length, 1);

  harness.leafletState.tileLayerThrows = false;
  card.hass = issueHass();
  await flushUntil(() => harness.leafletState.maps.length === 2 && timeline(card)?.children.length === 9);

  assert.equal(harness.leafletState.maps[1].removed, false);
  assert.equal(timeline(card).children.length, 9);
  assert.equal(card.shadowRoot.getElementById('loading').classList.contains('hidden'), true);

  setConnected(card, false);
});

test('setConfig restarts an initialized paused card in its documented playing state', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig());
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const firstMap = harness.leafletState.maps[0];
  const playButton = card.shadowRoot.getElementById('play-btn');
  playButton.click();
  assert.match(playButton.innerHTML, /M8 5v14l11-7z/);

  card.setConfig(issueConfig({ map_height: 500 }));
  await flushUntil(() => harness.leafletState.maps.length === 2 && timeline(card)?.children.length === 9);

  const restartedPlayButton = card.shadowRoot.getElementById('play-btn');
  assert.equal(firstMap.removed, true);
  assert.match(restartedPlayButton.innerHTML, /<rect/);
  assert.equal(activeFrameIndex(card), 8);
  assert.equal(card.shadowRoot.getElementById('map').style.height, '500px');
  assert.ok(harness.scheduler.activeTimeoutDelays().includes(500));

  harness.scheduler.runNextTimeout(500);
  assert.equal(activeFrameIndex(card), 0);

  setConnected(card, false);
});

test('applies restart_delay after displaying the final animation frame', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig({ frame_count: 3, frame_delay: 500, restart_delay: 1700 }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 3);

  assert.equal(activeFrameIndex(card), 2);
  harness.scheduler.runNextTimeout(500);
  assert.equal(activeFrameIndex(card), 0);
  harness.scheduler.runNextTimeout(500);
  assert.equal(activeFrameIndex(card), 1);
  harness.scheduler.runNextTimeout(500);
  assert.equal(activeFrameIndex(card), 2);

  const animationDelays = harness.scheduler.activeTimeoutDelays().filter((delay) => delay !== 300);
  assert.deepEqual(animationDelays, [1700]);

  setConnected(card, false);
});

test('auto basemap keeps its current style without sun data and restarts on day-night transitions', async () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig({ basemap_style: 'auto', dark_basemap: false }));
  card.hass = issueHass();
  setConnected(card, true);
  await flushUntil(() => timeline(card)?.children.length === 9);

  const firstMap = harness.leafletState.maps[0];
  assert.match(harness.leafletState.tileLayerCalls[0].url, /basemap_default/);

  card.hass = issueHass({ 'sensor.unrelated': { state: 'on' } });
  await Promise.resolve();
  assert.equal(harness.leafletState.maps.length, 1);
  assert.equal(firstMap.removed, false);

  card.hass = issueHass({ 'sun.sun': { state: 'below_horizon', attributes: {} } });
  await flushUntil(() => harness.leafletState.maps.length === 2 && timeline(card)?.children.length === 9);
  assert.equal(firstMap.removed, true);
  assert.match(harness.leafletState.tileLayerCalls[1].url, /basemap_dark/);

  const nightMap = harness.leafletState.maps[1];
  card.hass = issueHass();
  await Promise.resolve();
  assert.equal(harness.leafletState.maps.length, 2);
  assert.equal(nightMap.removed, false);

  card.hass = issueHass({ 'sun.sun': { state: 'above_horizon', attributes: {} } });
  await flushUntil(() => harness.leafletState.maps.length === 3 && timeline(card)?.children.length === 9);
  assert.equal(nightMap.removed, true);
  assert.match(harness.leafletState.tileLayerCalls[2].url, /basemap_default/);

  setConnected(card, false);
});

test('adds the trimmed and encoded CARTO key to base and label tiles for light, dark, and auto styles', async () => {
  const expectedKeySuffix = '?key=abc%20%3F%26%2F';
  const scenarios = [
    { style: 'light', sunState: 'below_horizon', expectedPath: 'voyager' },
    { style: 'dark', sunState: 'above_horizon', expectedPath: 'dark' },
    { style: 'auto', sunState: 'above_horizon', expectedPath: 'voyager' },
    { style: 'auto', sunState: 'below_horizon', expectedPath: 'dark' },
  ];

  for (const { style, sunState, expectedPath } of scenarios) {
    const harness = createHarness();
    const card = await initializeCard(
      harness,
      issueConfig({
        basemap_provider: 'carto',
        basemap_style: style,
        basemap_api_key: 'legacy-stadia-key',
        carto_api_key: '  abc ?&/  ',
      }),
      issueHass({ 'sun.sun': { state: sunState, attributes: {} } }),
    );
    const cartoCalls = harness.leafletState.tileLayerCalls.filter(({ url }) => url.includes('cartocdn.com'));

    assert.equal(cartoCalls.length, 2, `${style}/${sunState} should create CARTO base and label layers`);
    assert.ok(cartoCalls.every(({ url }) => url.endsWith(expectedKeySuffix)));
    assert.ok(cartoCalls.every(({ url }) => (url.match(/\?key=/g) || []).length === 1));
    assert.ok(cartoCalls.every(({ url }) => url.includes(expectedPath)));
    assert.equal(cartoCalls.find(({ url }) => url.includes('only_labels')).options.pane, 'overlayPane');

    setConnected(card, false);
  }
});

test('leaves CARTO URLs unchanged when the configured key is blank or not a string', async () => {
  for (const cartoApiKey of ['   ', 42, null]) {
    const harness = createHarness();
    const card = await initializeCard(harness, issueConfig({
      basemap_provider: 'carto',
      basemap_style: 'light',
      carto_api_key: cartoApiKey,
    }));
    const cartoCalls = harness.leafletState.tileLayerCalls.filter(({ url }) => url.includes('cartocdn.com'));

    assert.equal(cartoCalls.length, 2);
    assert.ok(cartoCalls.every(({ url }) => !url.includes('?')));

    setConnected(card, false);
  }
});

test('never sends provider API keys to BOM tiles', async () => {
  const harness = createHarness();
  const legacySecret = 'stadia secret ?&/';
  const cartoSecret = 'carto secret ?&/';
  const card = await initializeCard(harness, issueConfig({
    basemap_provider: 'bom',
    basemap_style: 'default',
    basemap_api_key: legacySecret,
    carto_api_key: cartoSecret,
  }));
  const bomBasemapCall = harness.leafletState.tileLayerCalls.find(({ url }) => url.includes('/mapping/basemaps/'));

  assert.ok(bomBasemapCall);
  assert.equal(
    bomBasemapCall.url,
    'https://api.bom.gov.au/apikey/v1/mapping/basemaps/basemap_default/MapServer/tile/{z}/{y}/{x}?blankTile=false',
  );
  assert.ok(!bomBasemapCall.url.includes(encodeURIComponent(legacySecret)));
  assert.ok(!bomBasemapCall.url.includes(encodeURIComponent(cartoSecret)));

  setConnected(card, false);
});

test('falls back to BOM without sending either key for an invalid provider', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({
    basemap_provider: 'not-a-provider',
    basemap_api_key: 'legacy-secret',
    carto_api_key: 'carto-secret',
  }));
  const basemapCall = harness.leafletState.tileLayerCalls.find(({ url }) => url.includes('/mapping/basemaps/'));

  assert.ok(basemapCall);
  assert.ok(!/[?&](?:key|api_key|token)=/.test(basemapCall.url));
  assert.equal(card._config.basemap_provider, 'bom');

  setConnected(card, false);
});

test('does not treat a legacy basemap_api_key as a CARTO key after upgrade', async () => {
  const harness = createHarness();
  const legacySecret = 'legacy-stadia-secret';
  const card = await initializeCard(harness, issueConfig({
    basemap_provider: 'carto',
    basemap_style: 'light',
    basemap_api_key: legacySecret,
  }));
  const cartoCalls = harness.leafletState.tileLayerCalls.filter(({ url }) => url.includes('cartocdn.com'));

  assert.equal(cartoCalls.length, 2);
  assert.ok(cartoCalls.every(({ url }) => !url.includes('?key=') && !url.includes(legacySecret)));

  setConnected(card, false);
});

test('keeps basemap_api_key backward compatible for Stadia Maps and Esri without sending carto_api_key', async () => {
  const scenarios = [
    { provider: 'stadia', style: 'alidade_light', host: 'stadiamaps.com', parameter: 'api_key' },
    { provider: 'esri', style: 'imagery', host: 'arcgisonline.com', parameter: 'token' },
  ];

  for (const { provider, style, host, parameter } of scenarios) {
    const harness = createHarness();
    const card = await initializeCard(harness, issueConfig({
      basemap_provider: provider,
      basemap_style: style,
      basemap_api_key: '  legacy ?&/  ',
      carto_api_key: 'carto-only-secret',
    }));
    const providerCalls = harness.leafletState.tileLayerCalls.filter(({ url }) => url.includes(host));

    assert.ok(providerCalls.length > 0);
    assert.ok(providerCalls.every(({ url }) => new URL(url).searchParams.get(parameter) === 'legacy ?&/'));
    assert.ok(providerCalls.every(({ url }) => !url.includes('carto-only-secret')));

    setConnected(card, false);
  }
});

test('uses linked CARTO and OpenStreetMap attribution while preserving the user attribution toggle', async () => {
  for (const showAttribution of [undefined, true, false]) {
    const harness = createHarness();
    const config = issueConfig({
      basemap_provider: 'carto',
      basemap_style: 'light',
      show_attribution: showAttribution,
    });
    const card = await initializeCard(harness, config);
    const map = harness.leafletState.maps[0];
    const cartoBaseCall = harness.leafletState.tileLayerCalls.find(({ url }) => url.includes('voyager_nolabels'));

    assert.equal(map.options.attributionControl, showAttribution !== false);
    assert.match(cartoBaseCall.options.attribution, /<a href="https:\/\/[^" ]*carto\.com[^" ]*">CARTO<\/a>/);
    assert.match(cartoBaseCall.options.attribution, /<a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a>/);

    setConnected(card, false);
  }
});

test('keeps attribution user-toggleable for every basemap provider', async () => {
  const providers = [
    { provider: 'bom', style: 'default' },
    { provider: 'carto', style: 'light' },
    { provider: 'stadia', style: 'alidade_light' },
    { provider: 'esri', style: 'topo' },
  ];

  for (const { provider, style } of providers) {
    for (const showAttribution of [true, false]) {
      const harness = createHarness();
      const card = await initializeCard(harness, issueConfig({
        basemap_provider: provider,
        basemap_style: style,
        show_attribution: showAttribution,
      }));

      assert.equal(harness.leafletState.maps[0].options.attributionControl, showAttribution);
      assert.equal(card._config.show_attribution, showAttribution);

      setConnected(card, false);
    }
  }
});

test('uniform colour strip is opt-in, follows the committed product, and retains its node on refresh', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, { ...issueConfig(), layer: 'air_temperature' });
  assert.equal(card._config.show_weather_legend, false);
  assert.equal(card.shadowRoot.querySelector('.legend-card'), null);
  card.setConfig({ ...issueConfig(), layer: 'air_temperature', show_weather_legend: true });
  await flushUntil(() => card._committedRadarLayerKey === 'air_temperature');
  const legend = card.shadowRoot.querySelector('.legend-card');
  assert.ok(legend);
  assert.equal(legend.dataset.layer, 'air_temperature');
  card._renderTopOverlays();
  assert.equal(card.shadowRoot.querySelector('.legend-card'), legend);
  card._config.layer = 'wind_speed_kmh';
  card._renderTopOverlays();
  assert.equal(card.shadowRoot.querySelector('.legend-card'), legend, 'pending switch still labels committed temperature');
  card._committedRadarLayerKey = 'wind_speed_kmh';
  card._renderTopOverlays();
  assert.equal(card.shadowRoot.querySelector('.legend-card').dataset.layer, 'wind_speed_kmh');
  card._committedRadarLayerKey = 'wind_direction';
  card._renderTopOverlays();
  assert.equal(card.shadowRoot.querySelector('.legend-card'), null);
  card._committedRadarLayerKey = 'reflectivity';
  card._config.show_legend = true;
  card._renderTopOverlays();
  assert.ok(card.shadowRoot.querySelector('.legend-card'), 'existing radar legend remains');
  setConnected(card, false);
});

test('every layer shares one top-strip layout without losing the configured layer badge', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, { ...issueConfig(), show_legend: true, show_weather_legend: true, show_layer_label: true });
  for (const key of Object.keys(BOM_LAYERS)) {
    card._committedRadarLayerKey = key;
    card._renderTopOverlays();
    const legends = card.shadowRoot.querySelectorAll('.legend-card');
    const direction = ['wind_direction', 'swell_1_direction', 'swell_2_direction'].includes(key);
    assert.equal(legends.length, direction ? 0 : 1, key);
    assert.equal(card.shadowRoot.querySelector('.card-content').classList.contains('has-top-legend'), !direction, key);
    assert.ok(card.shadowRoot.querySelector('.layer-badge'), key);
    if (!direction) assert.equal(legends[0].dataset.layer, key);
  }
  card._committedRadarLayerKey = 'air_temperature';
  card._config.show_weather_legend = false;
  card._renderTopOverlays();
  assert.equal(card.shadowRoot.querySelector('.legend-card'), null);
  setConnected(card, false);
});

test('editor round-trips the optional weather key separately from the radar legend', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let changedConfig;
  editor.addEventListener('config-changed', event => { changedConfig = event.detail.config; });
  editor.setConfig({ ...issueConfig(), show_legend: false });
  const toggle = editor.shadowRoot.getElementById('show_weather_legend');
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.dispatchEvent({ type: 'change', target: toggle });
  assert.equal(changedConfig.show_weather_legend, true);
  assert.equal(changedConfig.show_legend, false);
  editor.setConfig(changedConfig);
  assert.equal(editor.shadowRoot.getElementById('show_weather_legend').checked, true);
});

test('colour key button opens exact ranges without a strip and toggles closed with focus returned', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ layer: 'air_temperature' }));
  const { button, panel, close, body, title } = card._legendControl;
  assert.equal(card._config.show_legend_button, true);
  assert.equal(card.shadowRoot.querySelector('.legend-card'), null);
  assert.equal(panel.hidden, true);
  assert.equal(button.getAttribute('aria-controls'), panel.id);
  button.click();
  assert.equal(panel.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(close.focused, true);
  assert.equal(title.textContent, 'Air temperature (°C)');
  assert.match(body.innerHTML, /&lt; 0 °C/);
  assert.equal((body.innerHTML.match(/<li>/g) || []).length, 11);
  close.click();
  assert.equal(panel.hidden, true);
  assert.equal(button.focused, true);
  button.click();
  button.click();
  assert.equal(panel.hidden, true);
  setConnected(card, false);
});

test('top colour strip works immediately, survives refresh, and reconnects without duplicate triggers', async () => {
  for (const config of [
    issueConfig({ show_legend: true }),
    issueConfig({ layer: 'air_temperature', show_weather_legend: true }),
  ]) {
    const harness = createHarness();
    const card = await initializeCard(harness, config);
    try {
      const strip = card.shadowRoot.querySelector('.legend-card');
      const trigger = card.shadowRoot.querySelector('.legend-open');
      assert.ok(trigger, `${config.layer} strip must be interactive on initial load`);
      trigger.click();
      assert.equal(card._legendControl.panel.hidden, false);
      card._legendControl.close.click();

      await card._refreshData();
      assert.equal(card.shadowRoot.querySelector('.legend-card'), strip);
      assert.equal(card.shadowRoot.querySelector('.legend-open'), trigger);
      assert.equal(card.shadowRoot.querySelectorAll('.legend-open').length, 1);

      setConnected(card, false);
      setConnected(card, true);
      await flushUntil(() => card._legendControl && timeline(card)?.children.length === config.frame_count);
      const reconnectedTrigger = card.shadowRoot.querySelector('.legend-open');
      assert.ok(reconnectedTrigger, 'reconnect must wire the new strip');
      assert.notEqual(reconnectedTrigger, trigger);
      assert.equal(card.shadowRoot.querySelectorAll('.legend-open').length, 1);
      reconnectedTrigger.click();
      assert.equal(card._legendControl.panel.hidden, false);
    } finally {
      setConnected(card, false);
    }
  }
});

test('toolbar and strip expose the same legend state and return focus to the opener', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({
    show_legend: true,
    show_weather_legend: true,
  }));
  try {
    await card._setLayer('air_temperature');
    const strip = card.shadowRoot.querySelector('.legend-open');
    assert.ok(strip);
    const key = card._legendControl;
    const assertExpanded = value => {
      assert.equal(key.button.getAttribute('aria-expanded'), String(value));
      assert.equal(strip.getAttribute('aria-expanded'), String(value));
      assert.equal(key.panel.hidden, !value);
    };
    const escape = () => card.shadowRoot.dispatchEvent({ type: 'keydown', key: 'Escape', stopPropagation() {} });

    assertExpanded(false);
    for (const opener of [key.button, strip]) {
      for (const dismiss of [() => key.close.click(), escape]) {
        opener.focus();
        opener.click();
        assertExpanded(true);
        assert.equal(card.shadowRoot.activeElement, key.close);
        dismiss();
        assertExpanded(false);
        assert.ok(harness.document.activeElement === opener, 'focus returns to the opener');
        assert.equal(opener.focusOptions.preventScroll, true);
      }
      opener.click();
      assertExpanded(true);
      opener.click();
      assertExpanded(false);
      assert.ok(harness.document.activeElement === opener, 'toggling closed restores the opener');
    }
  } finally {
    setConnected(card, false);
  }
});

test('closing the key returns to the toolbar when a committed layer removes the opening strip', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_legend: true, show_weather_legend: false }));
  try {
    const trigger = card.shadowRoot.querySelector('.legend-open');
    trigger.click();
    // A radar strip can be reopened while a forecast request is still pending.
    card._committedRadarLayerKey = 'air_temperature';
    card._renderTopOverlays();
    assert.equal(card.shadowRoot.querySelector('.legend-open'), null);
    assert.equal(card._legendControl.panel.hidden, false);
    card._legendControl.close.click();
    assert.ok(harness.document.activeElement === card._legendControl.button);
  } finally {
    setConnected(card, false);
  }
});

test('disabling the colour key button retains a static strip through refresh and reconnect', async () => {
  const harness = createHarness();
  const config = issueConfig({ show_legend: true, show_legend_button: false });
  const card = await initializeCard(harness, config);
  try {
    for (const transition of [
      async () => {},
      () => card._refreshData(),
      async () => {
        setConnected(card, false);
        setConnected(card, true);
        await flushUntil(() => timeline(card)?.children.length === config.frame_count);
      },
    ]) {
      await transition();
      assert.ok(card.shadowRoot.querySelector('.legend-card'));
      assert.equal(card.shadowRoot.querySelector('.legend-open'), null);
      assert.equal(card._legendControl, null);
    }
  } finally {
    setConnected(card, false);
  }
});

test('layer menu supports keyboard dismissal and focus return without the colour key', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_layer_switcher: true, show_legend_button: false }));
  const { button, panel } = card._layerSwitcher;
  button.click();
  assert.equal(panel.querySelector('.is-active').focused, true);
  let stopped = false;
  button.parentNode.dispatchEvent({ type: 'keydown', key: 'Escape', stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(panel.classList.contains('is-open'), false);
  assert.equal(button.focused, true);
  assert.equal(button.getAttribute('aria-controls'), panel.id);
  setConnected(card, false);
});

test('playback and frame buttons expose their current state', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig());
  const button = card.shadowRoot.getElementById('play-btn');
  button.click();
  assert.equal(button.getAttribute('aria-label'), 'Play animation');
  button.click();
  assert.equal(button.getAttribute('aria-label'), 'Pause animation');
  timeline(card).children[0].click();
  assert.equal(button.getAttribute('aria-label'), 'Play animation');
  assert.equal(timeline(card).children[0].getAttribute('aria-pressed'), 'true');
  assert.ok(timeline(card).children.slice(1).every(dot => dot.getAttribute('aria-pressed') === 'false'));
  setConnected(card, false);
});

test('toolbar disappears when empty and returns for colour-bearing layers or other enabled actions', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig());
  const toolbar = harness.document.createElement('div');
  toolbar.className = 'leaflet-top leaflet-right';
  card.shadowRoot.getElementById('map').appendChild(toolbar);
  card._renderTopOverlays();
  assert.equal(toolbar.hidden, false);
  card._committedRadarLayerKey = 'wind_direction';
  card._renderTopOverlays();
  assert.equal(toolbar.hidden, true);
  for (const action of ['show_zoom', 'show_recenter', 'show_layer_switcher']) {
    card._config[action] = true;
    card._syncMapToolbar();
    assert.equal(toolbar.hidden, false, `${action} must remain visible on direction layers`);
    card._config[action] = false;
  }
  card._committedRadarLayerKey = 'reflectivity';
  card._renderTopOverlays();
  assert.equal(toolbar.hidden, false);
  setConnected(card, false);

  const disabled = await initializeCard(harness, issueConfig({ show_legend_button: false }));
  disabled.shadowRoot.getElementById('map').appendChild(toolbar);
  disabled._syncMapToolbar();
  assert.equal(toolbar.hidden, true);
  setConnected(disabled, false);
});

test('layer grid fits the visible card, reserves playback space, and does not scroll the page on focus', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_layer_switcher: true, show_playback: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const { panel, button } = card._layerSwitcher;
  content.getBoundingClientRect = () => ({ left: 100, right: 458, top: -70, bottom: 230 });
  button.click();
  assert.equal(panel.style.maxHeight, '158px');
  assert.equal(panel.style.width, '342px');
  assert.equal(panel.style.top, '78px');
  assert.equal(panel.querySelector('.is-active').focusOptions.preventScroll, true);
  card._config.show_playback = false;
  card._fitLayerSwitcherPanel();
  assert.equal(panel.style.maxHeight, '214px');
  content.getBoundingClientRect = () => ({ left: 100, right: 105, top: 770, bottom: 780 });
  card._fitLayerSwitcherPanel();
  assert.equal(panel.style.maxHeight, '0px');
  assert.equal(panel.style.width, '0px');
  assert.equal(harness.window.listenerCount('scroll'), 1);
  const layerPanel = panel;
  assert.equal(layerPanel.parentNode, content);
  setConnected(card, false);
  assert.equal(harness.window.listenerCount('scroll'), 0);
  assert.equal(layerPanel.parentNode, null);
});

test('tapping a different card colour strip dismisses this card key', async () => {
  const harness = createHarness();
  const first = await initializeCard(harness, issueConfig({ show_legend: true }));
  const second = await initializeCard(harness, issueConfig({ show_legend: true }));
  try {
    first._legendControl.button.click();
    first._panelPointerHandler({ composedPath: () => [first.shadowRoot.querySelector('.legend-open')] });
    assert.equal(first._legendControl.panel.hidden, false);
    first._panelPointerHandler({ composedPath: () => [second.shadowRoot.querySelector('.legend-open')] });
    assert.equal(first._legendControl.panel.hidden, true);
  } finally {
    setConnected(first, false);
    setConnected(second, false);
  }
});

test('short cards adapt the toolbar using the enabled controls and available height', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_zoom: true, show_recenter: true, show_layer_switcher: true, show_playback: true }));
  try {
    const toolbar = harness.document.createElement('div');
    toolbar.className = 'leaflet-top leaflet-right';
    card.shadowRoot.getElementById('map').appendChild(toolbar);
    const content = card.shadowRoot.querySelector('.card-content');
    let height = 150;
    content.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: height });
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), true);
    height = 300;
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), false);
    height = 150;
    card._config.show_zoom = card._config.show_recenter = card._config.show_layer_switcher = false;
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), false);
  } finally {
    setConnected(card, false);
  }
});

test('short panels temporarily use playback space and restore it on close or resize', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_layer_switcher: true, show_playback: true, show_legend: true }));
  try {
    const content = card.shadowRoot.querySelector('.card-content');
    let height = 150;
    content.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: height });
    for (const control of [card._layerSwitcher, card._legendControl]) {
      control.button.click();
      assert.equal(content.classList.contains('panel-covers-playback'), true);
      assert.equal(control.panel.style.maxHeight, '128px');
      height = 300;
      card._fitLayerSwitcherPanel();
      assert.equal(content.classList.contains('panel-covers-playback'), false);
      height = 150;
      card._fitLayerSwitcherPanel();
      control.close.click();
      assert.equal(content.classList.contains('panel-covers-playback'), false);
      control.button.click();
      control.button.click();
      assert.equal(content.classList.contains('panel-covers-playback'), false, 'toggle close also restores playback');
    }
  } finally {
    setConnected(card, false);
  }
});

test('short narrow toolbars wrap full-size desktop and touch targets within the card width', async () => {
  for (const coarse of [false, true]) {
    const harness = createHarness({ renderControlContainers: true });
    harness.window.matchMedia = query => ({ matches: coarse && query === '(pointer: coarse)' });
    const card = await initializeCard(harness, issueConfig({ show_zoom: true, show_recenter: true,
      show_layer_switcher: true, show_playback: true, show_attribution: true, show_legend: true }));
    const content = card.shadowRoot.querySelector('.card-content');
    const size = coarse ? 44 : 36;
    for (const width of [160, 180, 320]) {
      content.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 220, width, height: 220 });
      card._syncMapToolbar();
      assert.equal(content.classList.contains('has-short-toolbar'), true);
      const columns = Number(content.style['--bom-toolbar-columns']);
      const expectedRows = Math.ceil(5 / Math.floor((width - 22) / size));
      const expectedColumns = Math.ceil(5 / expectedRows);
      assert.equal(columns, expectedColumns);
      if (width === 180) assert.equal(columns, 3, 'five controls balance into three plus two rather than four plus one');
      assert.ok(columns * size + 22 <= width, `${width}px card preserves ${size}px targets without horizontal clipping`);
      assert.equal(content.style['--bom-toolbar-height'], `${Math.ceil(5 / columns) * size + 6}px`, 'badge offset includes every wrapped row');
    }
    card._config.show_zoom = false;
    card._syncMapToolbar();
    assert.equal(content.style['--bom-toolbar-columns'], '3');
    assert.equal(content.style['--bom-toolbar-height'], `${size + 6}px`);
    setConnected(card, false);
  }
});

test('compact labels hide for chrome collisions or card overflow and recover without visibility oscillation', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ show_layer_label: true, show_attribution: true,
    show_layer_switcher: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const badge = content.querySelector('.layer-badge');
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  const toolbar = content.querySelector('.leaflet-top.leaflet-right');
  const playback = content.querySelector('.controls');
  const credits = content.querySelector('.leaflet-control-attribution');
  let height = 150;
  let labelRect = rect(8, 68, 240, 90);
  content.getBoundingClientRect = () => rect(0, 0, 320, height);
  badge.getBoundingClientRect = () => labelRect;
  toolbar.getBoundingClientRect = () => rect(80, 8, 312, 58);
  playback.getBoundingClientRect = () => rect(8, height - 58, 312, height - 8);
  credits.getBoundingClientRect = () => rect(90, height - 85, 320, height - 60);
  const resize = harness.observerState.resize[0];
  assert.equal(resize.observations.some(({ target }) => target === credits), true, 'credit wrapping and font changes trigger layout checks');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    resize.callback();
    assert.equal(content.classList.contains('has-crowded-label'), true);
  }
  height = 220;
  resize.callback();
  assert.equal(content.classList.contains('has-crowded-label'), false, 'more vertical space restores the label');
  labelRect = rect(8, 148, 240, 170);
  card._syncLayerBadgeVisibility();
  assert.equal(content.classList.contains('has-crowded-label'), true, 'playback overlap hides the label');
  content.classList.add('panel-covers-playback');
  card._syncLayerBadgeVisibility();
  assert.equal(content.classList.contains('has-crowded-label'), true, 'temporarily covered playback retains its reserved space');
  content.classList.remove('panel-covers-playback');
  labelRect = rect(8, 8, 240, 30);
  card._syncLayerBadgeVisibility();
  assert.equal(content.classList.contains('has-crowded-label'), true, 'toolbar overlap hides the label');
  labelRect = rect(-1, 68, 240, 90);
  card._syncLayerBadgeVisibility();
  assert.equal(content.classList.contains('has-crowded-label'), true, 'outside-card labels stay hidden');
  labelRect = rect(8, 68, 240, 90);
  card._syncLayerBadgeVisibility();
  assert.equal(content.classList.contains('has-crowded-label'), false);
  credits.getBoundingClientRect = () => rect(90, 70, 320, 160);
  resize.callback();
  assert.equal(content.classList.contains('has-crowded-label'), true, 'newly wrapped provider credits are protected');
  setConnected(card, false);
  assert.equal(resize.disconnected, true);
});

test('newly rendered layer labels are checked immediately and hidden titles stay measurable', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ show_layer_label: true, show_layer_switcher: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  content.getBoundingClientRect = () => rect(0, 0, 320, 220);
  content.querySelector('.leaflet-top.leaflet-right').getBoundingClientRect = () => rect(90, 8, 312, 58);
  content.querySelector('.controls').getBoundingClientRect = () => rect(8, 162, 312, 212);
  let labelRect = rect(8, 148, 240, 170);
  const createElement = harness.document.createElement.bind(harness.document);
  harness.document.createElement = localName => {
    const element = createElement(localName);
    const defaultRect = element.getBoundingClientRect.bind(element);
    element.getBoundingClientRect = () => element.classList.contains('layer-badge') ? labelRect : defaultRect();
    return element;
  };
  card._renderTopOverlays();
  assert.equal(content.classList.contains('has-crowded-label'), true);
  assert.equal(content.querySelector('.layer-badge').getBoundingClientRect().height, 22);
  labelRect = rect(8, 68, 240, 90);
  card._renderTopOverlays();
  assert.equal(content.classList.contains('has-crowded-label'), false, 'a replacement title is assessed against current geometry');
  card._config.show_layer_label = false;
  card._renderTopOverlays();
  assert.equal(content.classList.contains('has-crowded-label'), false);
  setConnected(card, false);
});

test('touch toolbar reserves room for provider credits above playback', async () => {
  const harness = createHarness();
  harness.window.matchMedia = query => ({ matches: query === '(pointer: coarse)' });
  const card = await initializeCard(harness, issueConfig({ show_zoom: true, show_recenter: true,
    show_layer_switcher: true, show_playback: true, show_attribution: true, show_legend: true }));
  try {
    const toolbar = harness.document.createElement('div');
    toolbar.className = 'leaflet-top leaflet-right';
    card.shadowRoot.getElementById('map').appendChild(toolbar);
    const credit = harness.document.createElement('div');
    credit.className = 'leaflet-control-attribution';
    card.shadowRoot.getElementById('map').appendChild(credit);
    credit.getBoundingClientRect = () => ({ height: 18 });
    const content = card.shadowRoot.querySelector('.card-content');
    content.getBoundingClientRect = () => ({ top: 0, bottom: 300 });
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), true);
    card._config.show_attribution = false;
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), false);
    card._config.show_attribution = true;
    content.getBoundingClientRect = () => ({ top: 0, bottom: 400 });
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), false);
    credit.getBoundingClientRect = () => ({ height: 120 });
    card._syncMapToolbar();
    assert.equal(content.classList.contains('has-short-toolbar'), true, 'wrapped multi-provider credits are measured');
  } finally {
    setConnected(card, false);
  }
});

test('colour key closes on Escape and map interaction; panels are mutually exclusive', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ show_layer_switcher: true }));
  const key = card._legendControl;
  assert.equal(key.button.parentNode, card._layerSwitcher.button.parentNode);
  key.button.click();
  let stopped = false;
  card.shadowRoot.dispatchEvent({ type: 'keydown', key: 'Escape', stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(key.panel.hidden, true);
  assert.equal(key.button.getAttribute('aria-expanded'), 'false');
  key.button.click();
  card._layerSwitcher.button.click();
  assert.equal(key.panel.hidden, true);
  assert.equal(card._layerSwitcher.panel.classList.contains('is-open'), true);
  key.button.click();
  assert.equal(card._layerSwitcher.panel.classList.contains('is-open'), false);
  for (const event of ['click', 'movestart', 'zoomstart']) {
    if (key.panel.hidden) key.button.click();
    const handlers = card._map.events[event];
    assert.ok(handlers.length);
    handlers.forEach(handler => handler());
    assert.equal(key.panel.hidden, true);
  }
  setConnected(card, false);
});

test('colour key stays on the displayed product, preserves same-layer content, and hides for directions', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ layer: 'air_temperature' }));
  const key = card._legendControl;
  key.button.click();
  key.body.scrollTop = 50;
  card._renderTopOverlays();
  assert.equal(key.body.scrollTop, 50);
  card._config.layer = 'wind_speed_kt';
  card._renderTopOverlays();
  assert.equal(key.panel.dataset.layer, 'air_temperature');
  card._committedRadarLayerKey = 'wind_speed_kt';
  card._renderTopOverlays();
  assert.equal(key.panel.hidden, false);
  assert.equal(key.panel.dataset.layer, 'wind_speed_kt');
  assert.match(key.body.innerHTML, /55 kt/);
  assert.equal(key.body.scrollTop, 0);
  card._committedRadarLayerKey = 'wind_direction';
  card._renderTopOverlays();
  assert.equal(key.button.hidden, true);
  assert.equal(key.panel.hidden, true);
  card._committedRadarLayerKey = 'fog';
  card._renderTopOverlays();
  assert.equal(key.button.hidden, false);
  assert.equal((key.body.innerHTML.match(/<li>/g) || []).length, 1);
  assert.equal(key.title.textContent, 'Fog');
  setConnected(card, false);
});

test('colour key is optional, cleans up on disconnect, and starts closed on reconnect', async () => {
  const harness = createHarness();
  const disabled = await initializeCard(harness, issueConfig({ show_legend_button: false }));
  assert.equal(disabled._legendControl, null);
  setConnected(disabled, false);
  const card = await initializeCard(harness, issueConfig());
  const key = card._legendControl;
  key.button.click();
  setConnected(card, false);
  assert.equal(card._legendControl, null);
  assert.equal(key.panel.parentNode, null);
  assert.equal(card.shadowRoot.eventListeners.keydown.length, 0);
  setConnected(card, true);
  await flushUntil(() => card._legendControl && card._committedRadarLayerKey === 'reflectivity');
  assert.notEqual(card._legendControl, key);
  assert.equal(card._legendControl.panel.hidden, true);
  assert.equal(card.shadowRoot.eventListeners.keydown.length, 1);
  setConnected(card, false);
});

test('editor saves the colour-key-button preference independently', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let config;
  editor.addEventListener('config-changed', event => { config = event.detail.config; });
  editor.setConfig(issueConfig());
  const button = editor.shadowRoot.getElementById('show_legend_button');
  assert.equal(button.checked, true);
  button.checked = false;
  button.dispatchEvent({ type: 'change', target: button });
  assert.equal(config.show_legend_button, false);
  editor.setConfig(config);
  assert.equal(editor.shadowRoot.getElementById('show_legend_button').checked, false);
});

function dispatchToolbarActivity(target, type, leaf, properties = {}) {
  const path = [];
  for (let node = leaf; node; node = node.parentNode) path.push(node);
  const event = {
    type, target: leaf, pointerId: 1, pointerType: 'mouse',
    composedPath: () => path,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
    ...properties,
  };
  target.dispatchEvent(event);
  return event;
}

test('auto-hide is opt-in and applies one chrome-wide idle state after ten seconds', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const defaultCard = await initializeCard(harness, issueConfig());
  assert.equal(defaultCard._config.auto_hide_controls, false);
  assert.equal(defaultCard._autoHideControls, null);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  setConnected(defaultCard, false);

  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const map = card.shadowRoot.getElementById('map');
  const controls = card.shadowRoot.querySelector('.controls');
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  assert.equal(controls.classList.contains('is-idle'), false);
  assert.equal(card.shadowRoot.getElementById('time-label').textContent.length > 0, true);
  dispatchToolbarActivity(content, 'pointermove', map);
  assert.equal(content.classList.contains('is-idle'), false);
  assert.equal(harness.scheduler.activeTimeoutDelays().filter(delay => delay === 10_000).length, 1);
  setConnected(card, false);
});

test('first hidden-chrome tap consumes the complete pointer and compatibility gesture only', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const map = card.shadowRoot.getElementById('map');
  harness.scheduler.runNextTimeout(10_000);
  dispatchToolbarActivity(content, 'pointermove', map, { pointerType: 'touch' });
  assert.equal(content.classList.contains('is-idle'), true, 'touch pre-hover must not bypass the first-tap guard');
  const down = dispatchToolbarActivity(content, 'pointerdown', map, { pointerType: 'touch' });
  assert.equal(down.defaultPrevented, true);
  assert.equal(down.propagationStopped, true);
  assert.equal(content.classList.contains('is-idle'), false);
  for (const type of ['touchstart', 'mousedown', 'touchmove']) {
    assert.equal(dispatchToolbarActivity(content, type, map).defaultPrevented, true, type);
  }
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  assert.equal(dispatchToolbarActivity(harness.window, 'pointerup', map).defaultPrevented, true);
  for (const type of ['touchend', 'mouseup', 'click', 'dblclick']) {
    assert.equal(dispatchToolbarActivity(content, type, map).defaultPrevented, true, type);
  }
  assert.equal(dispatchToolbarActivity(content, 'pointerdown', map).defaultPrevented, undefined);
  assert.equal(dispatchToolbarActivity(content, 'mousedown', map).defaultPrevented, undefined);
  dispatchToolbarActivity(harness.window, 'pointerup', map);
  assert.equal(dispatchToolbarActivity(content, 'click', map).defaultPrevented, undefined);
  setConnected(card, false);
});

test('hidden playback and attribution wake only, while the visible colour strip opens its key directly', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true, show_legend: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const map = card.shadowRoot.getElementById('map');
  const attribution = harness.document.createElement('a');
  attribution.className = 'leaflet-control-attribution';
  map.appendChild(attribution);
  const playback = card.shadowRoot.getElementById('play-btn');
  const strip = card.shadowRoot.querySelector('.legend-open');
  for (const leaf of [playback, attribution]) {
    harness.scheduler.runNextTimeout(10_000);
    assert.equal(dispatchToolbarActivity(content, 'pointerdown', leaf).defaultPrevented, true);
    dispatchToolbarActivity(harness.window, 'pointerup', leaf);
    assert.equal(dispatchToolbarActivity(content, 'click', leaf).defaultPrevented, true);
    assert.equal(content.classList.contains('is-idle'), false);
    assert.equal(card._playing, true, 'the wake tap does not pause playback');
    assert.equal(dispatchToolbarActivity(content, 'pointerdown', leaf).defaultPrevented, undefined);
    dispatchToolbarActivity(harness.window, 'pointerup', leaf);
    assert.equal(dispatchToolbarActivity(content, 'click', leaf).defaultPrevented, undefined);
  }
  playback.click();
  assert.equal(card._playing, false, 'playback still responds');
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(dispatchToolbarActivity(content, 'pointerdown', strip).defaultPrevented, undefined);
  dispatchToolbarActivity(harness.window, 'pointerup', strip);
  assert.equal(dispatchToolbarActivity(content, 'click', strip).defaultPrevented, undefined);
  strip.click();
  assert.equal(card._legendControl.panel.hidden, false, 'colour strip still opens its key');
  assert.equal(content.classList.contains('is-idle'), false);
  setConnected(card, false);
});

test('auto-hide holds all chrome for open panels, control focus and map movement', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true, show_layer_switcher: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const mapElement = card.shadowRoot.getElementById('map');
  card._legendControl.button.click();
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  card._closeLegendPanel();
  card.shadowRoot.activeElement = mapElement;
  dispatchToolbarActivity(content, 'focusout', card._legendControl.button, { relatedTarget: mapElement });
  card._layerSwitcher.button.click();
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  card._closeLayerSwitcher();
  card.shadowRoot.activeElement = mapElement;
  dispatchToolbarActivity(content, 'focusout', card._layerSwitcher.button, { relatedTarget: mapElement });
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  card._legendControl.button.focusVisible = true;
  card._legendControl.button.focus();
  dispatchToolbarActivity(content, 'focusin', card._legendControl.button);
  assert.equal(content.classList.contains('is-idle'), false);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  dispatchToolbarActivity(content, 'focusout', card._legendControl.button, { relatedTarget: mapElement });
  card.shadowRoot.activeElement = mapElement;
  harness.scheduler.runNextTimeout(0);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), true);
  card._map.events.movestart.forEach(listener => listener());
  card._map.events.zoomstart.forEach(listener => listener());
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  card._map.events.moveend.forEach(listener => listener());
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false, 'zoom still holds the controls');
  await Promise.all(card._map.events.zoomend.map(listener => listener()));
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  setConnected(card, false);
});

test('auto-hide waits for drag release outside the card and clears cancelled gestures', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const map = card.shadowRoot.getElementById('map');
  dispatchToolbarActivity(content, 'pointerdown', map);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  dispatchToolbarActivity(harness.window, 'pointerup', harness.document);
  harness.scheduler.runNextTimeout(10_000);
  dispatchToolbarActivity(content, 'pointerdown', map);
  dispatchToolbarActivity(harness.window, 'pointercancel', map);
  assert.equal(dispatchToolbarActivity(content, 'click', map).defaultPrevented, undefined);
  dispatchToolbarActivity(content, 'pointerdown', map);
  harness.window.dispatchEvent({ type: 'blur' });
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), true);
  setConnected(card, false);
});

test('keyboard focus on playback, frames or map credits reveals and holds all chrome, but map focus does not', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const map = card.shadowRoot.getElementById('map');
  const credits = harness.document.createElement('div');
  credits.className = 'leaflet-control-attribution';
  const link = harness.document.createElement('a');
  credits.appendChild(link);
  map.appendChild(credits);
  for (const control of [card.shadowRoot.getElementById('play-btn'), timeline(card).children[0], link]) {
    harness.scheduler.runNextTimeout(10_000);
    assert.equal(content.classList.contains('is-idle'), true);
    control.focusVisible = true;
    control.focus();
    dispatchToolbarActivity(content, 'focusin', control);
    assert.equal(content.classList.contains('is-idle'), false);
    assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
    map.focus();
    dispatchToolbarActivity(content, 'focusout', control, { relatedTarget: map });
    assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), true);
  }
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  setConnected(card, false);
});

test('auto-hide still controls playback when every toolbar action is disabled', async () => {
  const harness = createHarness();
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true, show_legend_button: false }));
  const content = card.shadowRoot.querySelector('.card-content');
  assert.ok(card._autoHideControls);
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  const play = card.shadowRoot.getElementById('play-btn');
  assert.equal(dispatchToolbarActivity(content, 'pointerdown', play).defaultPrevented, true);
  dispatchToolbarActivity(harness.window, 'pointerup', play);
  assert.equal(dispatchToolbarActivity(content, 'click', play).defaultPrevented, true);
  assert.equal(card._playing, true);
  setConnected(card, false);
});

test('pointer-focused playback and layer-picker return focus do not pin the chrome open', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true, show_layer_switcher: true }));
  const content = card.shadowRoot.querySelector('.card-content');
  const playback = card.shadowRoot.getElementById('play-btn');
  dispatchToolbarActivity(content, 'pointerdown', playback, { pointerType: 'touch' });
  playback.focus();
  dispatchToolbarActivity(content, 'focusin', playback);
  dispatchToolbarActivity(harness.window, 'pointerup', playback, { pointerType: 'touch' });
  playback.click();
  assert.equal(playback.matches(':focus-visible'), false);
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  card._autoHideControls.activity();
  card._layerSwitcher.button.click();
  await card._setLayer('reflectivity');
  assert.equal(card.shadowRoot.activeElement, card._layerSwitcher.button);
  assert.equal(card._layerSwitcher.button.matches(':focus-visible'), false);
  harness.scheduler.runNextTimeout(10_000);
  assert.equal(content.classList.contains('is-idle'), true);
  setConnected(card, false);
});

test('Escape-returned keyboard-visible panel focus keeps the chrome visible', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const { button } = card._legendControl;
  button.focusVisible = true;
  button.click();
  card.shadowRoot.dispatchEvent({ type: 'keydown', key: 'Escape', stopPropagation() {} });
  assert.equal(card.shadowRoot.activeElement, button);
  assert.equal(button.matches(':focus-visible'), true);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  assert.equal(card.shadowRoot.querySelector('.card-content').classList.contains('is-idle'), false);
  setConnected(card, false);
});

test('auto-hide never starts during unresolved loading or an initialization error', async () => {
  for (const options of [{ imageResponder: () => undefined }, { tileLayerThrows: true }]) {
    const harness = createHarness(options);
    const card = new harness.Card();
    card.setConfig(issueConfig({ auto_hide_controls: true }));
    card.hass = issueHass();
    setConnected(card, true);
    for (let attempt = 0; attempt < 40; attempt += 1) await Promise.resolve();
    assert.equal(card._autoHideControls, null);
    assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
    assert.equal(card.shadowRoot.querySelector('.card-content').classList.contains('is-idle'), false);
    const loading = card.shadowRoot.getElementById('loading');
    assert.ok(loading);
    assert.equal(loading.classList.contains('hidden'), false);
    if (options.tileLayerThrows) assert.match(loading.innerHTML, /Failed to load/);
    setConnected(card, false);
  }
});

test('auto-hide config changes and reconnects clean up every timer and listener', async () => {
  const harness = createHarness({ renderControlContainers: true });
  const card = await initializeCard(harness, issueConfig({ auto_hide_controls: true }));
  const oldContent = card.shadowRoot.querySelector('.card-content');
  assert.equal(oldContent.eventListeners.pointerdown.length, 1);
  assert.equal(harness.window.listenerCount('pointerup'), 1);
  harness.scheduler.runNextTimeout(10_000);
  dispatchToolbarActivity(oldContent, 'pointerdown', card.shadowRoot.getElementById('map'));
  dispatchToolbarActivity(harness.window, 'pointerup', card.shadowRoot.getElementById('map'));
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(700), true);
  setConnected(card, false);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(700), false);
  assert.equal(harness.window.listenerCount('pointerup'), 0);
  assert.equal(harness.window.listenerCount('pointercancel'), 0);
  assert.equal(harness.window.listenerCount('blur'), 0);
  for (const listeners of Object.values(oldContent.eventListeners)) assert.equal(listeners.length, 0);
  setConnected(card, true);
  await flushUntil(() => card._autoHideControls && card._committedRadarLayerKey === 'reflectivity');
  assert.equal(harness.window.listenerCount('pointerup'), 1);
  assert.equal(card.shadowRoot.querySelector('.card-content').classList.contains('is-idle'), false);
  card.setConfig(issueConfig({ auto_hide_controls: false }));
  await flushUntil(() => card._committedRadarLayerKey === 'reflectivity');
  assert.equal(card._autoHideControls, null);
  assert.equal(harness.window.listenerCount('pointerup'), 0);
  assert.equal(harness.scheduler.activeTimeoutDelays().includes(10_000), false);
  setConnected(card, false);
});

test('editor persists the opt-in auto-hide preference independently of playback', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let config;
  editor.addEventListener('config-changed', event => { config = event.detail.config; });
  editor.setConfig(issueConfig());
  const toggle = editor.shadowRoot.getElementById('auto_hide_controls');
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.dispatchEvent({ type: 'change', target: toggle });
  assert.equal(config.auto_hide_controls, true);
  assert.equal(config.show_playback, true);
  editor.setConfig(config);
  assert.equal(editor.shadowRoot.getElementById('auto_hide_controls').checked, true);
});

test('dashboard theme changes preserve the map, playback and open colour key independently of the basemap', async () => {
  const harness = createHarness();
  const hass = { ...issueHass({ 'sun.sun': { state: 'above_horizon' } }), themes: { darkMode: false } };
  const card = await initializeCard(harness, issueConfig({ basemap_style: 'auto' }), hass);
  const map = card._map;
  const frames = timeline(card);
  const key = card._legendControl;
  key.button.click();
  assert.equal(key.panel.hidden, false);
  assert.equal(card.getAttribute('data-theme'), 'light');
  assert.equal(card.getAttribute('data-ui-theme'), 'auto');

  card.hass = { ...hass, themes: { darkMode: true } };
  assert.equal(card.getAttribute('data-theme'), 'dark');
  assert.equal(card._map, map);
  assert.equal(timeline(card), frames);
  assert.equal(card._legendControl, key);
  assert.equal(key.panel.hidden, false);
  assert.equal(harness.leafletState.maps.length, 1);

  card.hass = hass;
  assert.equal(card.getAttribute('data-theme'), 'light');
  assert.equal(card._map, map);
  assert.equal(key.panel.hidden, false);
  setConnected(card, false);
});

test('card configuration updates the controls theme before initialization and falls back safely for unknown values', () => {
  const harness = createHarness();
  const card = new harness.Card();
  card.setConfig(issueConfig({ ui_theme: 'dark' }));
  assert.equal(card.getAttribute('data-theme'), 'dark');
  assert.equal(card.getAttribute('data-ui-theme'), 'dark');

  card.hass = { ...issueHass(), themes: { darkMode: false } };
  assert.equal(card.getAttribute('data-theme'), 'dark');
  card.setConfig(issueConfig({ ui_theme: 'light' }));
  assert.equal(card.getAttribute('data-theme'), 'light');
  assert.equal(card.getAttribute('data-ui-theme'), 'light');
  card.hass = { ...issueHass(), themes: { darkMode: true } };
  assert.equal(card.getAttribute('data-theme'), 'light');

  for (const ui_theme of ['invalid', undefined, false, {}]) {
    card.setConfig(issueConfig({ ui_theme }));
    assert.equal(card._config.ui_theme, 'auto');
    assert.equal(card.getAttribute('data-ui-theme'), 'auto');
    assert.equal(card.getAttribute('data-theme'), 'dark');
  }
  assert.equal(harness.leafletState.maps.length, 0);
});

test('fixed controls themes survive connection and dashboard changes without replacing map or playback state', async () => {
  for (const ui_theme of ['light', 'dark']) {
    const harness = createHarness();
    const hass = { ...issueHass({ 'sun.sun': { state: 'above_horizon' } }), themes: { darkMode: ui_theme === 'light' } };
    const card = await initializeCard(harness, issueConfig({ ui_theme, basemap_style: 'auto' }), hass);
    const map = card._map;
    const frames = timeline(card);
    const key = card._legendControl;
    const basemapStyle = card._resolvedBasemapStyle;
    card.shadowRoot.getElementById('play-btn').click();
    key.button.click();
    assert.equal(card._playing, false);
    assert.equal(key.panel.hidden, false);
    assert.equal(card.getAttribute('data-theme'), ui_theme);
    assert.equal(card.getAttribute('data-ui-theme'), ui_theme);

    for (const darkMode of [false, true]) {
      card.hass = { ...hass, themes: { darkMode } };
      assert.equal(card.getAttribute('data-theme'), ui_theme);
      assert.equal(card.getAttribute('data-ui-theme'), ui_theme);
      assert.equal(card._map, map);
      assert.equal(timeline(card), frames);
      assert.equal(card._legendControl, key);
      assert.equal(key.panel.hidden, false);
      assert.equal(card._playing, false);
      assert.equal(card._resolvedBasemapStyle, basemapStyle);
      assert.equal(harness.leafletState.maps.length, 1);
    }
    setConnected(card, false);
  }
});

test('changing an initialized card controls theme applies each palette and restores dashboard inheritance', async () => {
  const harness = createHarness();
  const hass = { ...issueHass(), themes: { darkMode: true } };
  const config = issueConfig({ accent_color: '#123456', location_color: '#abcdef' });
  const card = await initializeCard(harness, config, hass);

  for (const ui_theme of ['light', 'dark', undefined]) {
    card.setConfig({ ...config, ui_theme });
    await flushUntil(() => card._committedRadarLayerKey === 'reflectivity');
    assert.equal(card.getAttribute('data-ui-theme'), ui_theme ?? 'auto');
    assert.equal(card.getAttribute('data-theme'), ui_theme ?? 'dark');
    assert.equal(card._config.accent_color, '#123456');
    assert.equal(card._config.location_color, '#abcdef');
    assert.equal(card._config.basemap_style, config.basemap_style);
  }
  card.hass = { ...hass, themes: { darkMode: false } };
  assert.equal(card.getAttribute('data-theme'), 'light');
  setConnected(card, false);
});

test('editor theme changes retain its controls and unsaved field value', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  editor.hass = { ...issueHass(), themes: { darkMode: false } };
  editor.setConfig(issueConfig());
  const height = editor.shadowRoot.getElementById('map_height');
  height.value = '420';
  editor.hass = { ...issueHass(), themes: { darkMode: true } };
  assert.equal(editor.getAttribute('data-theme'), 'dark');
  assert.equal(editor.shadowRoot.getElementById('map_height'), height);
  assert.equal(height.value, '420');
});

test('editor round-trips controls themes independently of its appearance, accents and basemap', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  editor.hass = { ...issueHass(), themes: { darkMode: false } };
  editor.setConfig(issueConfig({ accent_color: '#123456', location_color: '#abcdef', ui_theme: 'invalid' }));
  let config;
  editor.addEventListener('config-changed', event => { config = event.detail.config; });
  assert.equal(editor.shadowRoot.getElementById('ui_theme').value, 'auto');

  for (const preference of ['dark', 'light', 'auto']) {
    const select = editor.shadowRoot.getElementById('ui_theme');
    select.value = preference;
    select.dispatchEvent({ type: 'change', target: select });
    assert.equal(config.ui_theme, preference === 'auto' ? undefined : preference);
    assert.equal(Object.hasOwn(config, 'ui_theme'), preference !== 'auto');
    assert.equal(config.accent_color, '#123456');
    assert.equal(config.location_color, '#abcdef');
    assert.equal(config.basemap_style, 'dark');
    editor.setConfig(config);
    assert.equal(editor.shadowRoot.getElementById('ui_theme').value, preference);
    assert.equal(editor.getAttribute('data-theme'), 'light');
    assert.equal(editor.getAttribute('data-ui-theme'), 'auto');
  }
});

test('editor opacity percentages round-trip as fractional configuration, including defaults and clearing', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let config;
  editor.addEventListener('config-changed', event => { config = event.detail.config; });
  editor.setConfig(issueConfig({ radar_opacity: 0.65, chrome_opacity: 0.85 }));
  const weather = editor.shadowRoot.getElementById('radar_opacity');
  const controls = editor.shadowRoot.getElementById('chrome_opacity');
  assert.equal(weather.value, '65');
  assert.equal(controls.value, '85');
  weather.value = '45';
  controls.value = '20';
  weather.dispatchEvent({ type: 'change', target: weather });
  assert.equal(config.radar_opacity, 0.45);
  assert.equal(config.chrome_opacity, 0.2);
  editor.setConfig(config);
  assert.equal(editor.shadowRoot.getElementById('radar_opacity').value, '45');
  assert.equal(editor.shadowRoot.getElementById('chrome_opacity').value, '20');
  const updatedWeather = editor.shadowRoot.getElementById('radar_opacity');
  updatedWeather.value = '';
  updatedWeather.dispatchEvent({ type: 'change', target: updatedWeather });
  assert.equal(Object.hasOwn(config, 'radar_opacity'), false);
  editor.setConfig(issueConfig());
  assert.equal(editor.shadowRoot.getElementById('radar_opacity').value, '70');
  assert.equal(editor.shadowRoot.getElementById('chrome_opacity').value, '100');
});

test('new custom accents start with a readable theme neutral and preserve an existing colour', () => {
  const harness = createHarness();
  for (const [darkMode, ui_theme, expected] of [
    [false, undefined, '#26384b'],
    [true, undefined, '#edf1f5'],
    [false, 'dark', '#edf1f5'],
    [true, 'light', '#26384b'],
  ]) {
    const editor = new harness.Editor();
    editor.hass = { ...issueHass(), themes: { darkMode } };
    editor.setConfig(issueConfig({ ui_theme }));
    let config;
    editor.addEventListener('config-changed', event => { config = event.detail.config; });
    const toggle = editor.shadowRoot.getElementById('use_custom_accent_color');
    toggle.checked = true;
    toggle.dispatchEvent({ type: 'change', target: toggle });
    assert.equal(config.accent_color, expected);
    editor.setConfig({ ...config, accent_color: '#2468ac' });
    editor._valueChanged();
    assert.equal(config.accent_color, '#2468ac');
  }
});

test('editor provider changes clear the previous API key without restoring it on the next change', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  const changedConfigs = [];
  editor.addEventListener('config-changed', (event) => changedConfigs.push(event.detail.config));
  editor.setConfig({
    layer: 'reflectivity',
    basemap_provider: 'carto',
    basemap_style: 'light',
    basemap_api_key: 'stale-stadia-secret',
    carto_api_key: 'carto-only-secret',
    show_attribution: true,
  });

  const provider = editor.shadowRoot.getElementById('basemap_provider');
  const apiKey = editor.shadowRoot.getElementById('basemap_api_key');
  const showAttribution = editor.shadowRoot.getElementById('show_attribution');
  assert.equal(provider.value, 'carto');
  assert.equal(apiKey.value, 'carto-only-secret');

  provider.value = 'bom';
  provider.dispatchEvent({ type: 'change', target: provider });
  assert.equal(changedConfigs.length, 1);
  assert.equal(changedConfigs[0].basemap_provider, 'bom');
  assert.equal(Object.hasOwn(changedConfigs[0], 'basemap_api_key'), false);
  assert.equal(Object.hasOwn(changedConfigs[0], 'carto_api_key'), false);
  assert.equal(apiKey.value, '');

  showAttribution.checked = false;
  showAttribution.dispatchEvent({ type: 'change', target: showAttribution });
  assert.equal(changedConfigs.length, 2);
  assert.equal(changedConfigs[1].show_attribution, false);
  assert.equal(Object.hasOwn(changedConfigs[1], 'basemap_api_key'), false);
  assert.equal(Object.hasOwn(changedConfigs[1], 'carto_api_key'), false);
});

test('editor keeps and trims a CARTO key without retaining a legacy provider key', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let changedConfig;
  editor.addEventListener('config-changed', (event) => { changedConfig = event.detail.config; });
  editor.setConfig({
    layer: 'reflectivity',
    basemap_provider: 'carto',
    basemap_style: 'light',
    basemap_api_key: 'stale-stadia-key',
    carto_api_key: 'old-carto-key',
  });

  const apiKey = editor.shadowRoot.getElementById('basemap_api_key');
  apiKey.value = '  replacement ?&/  ';
  apiKey.dispatchEvent({ type: 'change', target: apiKey });

  assert.equal(changedConfig.basemap_provider, 'carto');
  assert.equal(changedConfig.carto_api_key, 'replacement ?&/');
  assert.equal(Object.hasOwn(changedConfig, 'basemap_api_key'), false);
});

test('editor hides and removes an unscoped legacy key from an existing CARTO config', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  let changedConfig;
  editor.addEventListener('config-changed', (event) => { changedConfig = event.detail.config; });
  editor.setConfig({
    layer: 'reflectivity',
    basemap_provider: 'carto',
    basemap_style: 'light',
    basemap_api_key: 'must-not-be-sent-to-carto',
    show_attribution: true,
  });

  const apiKey = editor.shadowRoot.getElementById('basemap_api_key');
  const showAttribution = editor.shadowRoot.getElementById('show_attribution');
  assert.equal(apiKey.value, '');

  showAttribution.checked = false;
  showAttribution.dispatchEvent({ type: 'change', target: showAttribution });

  assert.equal(Object.hasOwn(changedConfig, 'basemap_api_key'), false);
  assert.equal(Object.hasOwn(changedConfig, 'carto_api_key'), false);
  assert.equal(changedConfig.show_attribution, false);
});

test('editor stores a newly entered key for the provider selected after a Home Assistant rerender', () => {
  const harness = createHarness();
  const editor = new harness.Editor();
  const changedConfigs = [];
  editor.addEventListener('config-changed', (event) => changedConfigs.push(event.detail.config));
  editor.setConfig({
    layer: 'reflectivity',
    basemap_provider: 'carto',
    basemap_style: 'light',
    carto_api_key: 'old-carto-key',
  });

  const provider = editor.shadowRoot.getElementById('basemap_provider');
  provider.value = 'stadia';
  provider.dispatchEvent({ type: 'change', target: provider });
  assert.equal(Object.hasOwn(changedConfigs.at(-1), 'carto_api_key'), false);
  assert.equal(Object.hasOwn(changedConfigs.at(-1), 'basemap_api_key'), false);

  editor.setConfig(changedConfigs.at(-1));
  const apiKey = editor.shadowRoot.getElementById('basemap_api_key');
  assert.equal(apiKey.value, '');
  apiKey.value = '  new-stadia-key  ';
  apiKey.dispatchEvent({ type: 'change', target: apiKey });

  assert.equal(changedConfigs.at(-1).basemap_provider, 'stadia');
  assert.equal(changedConfigs.at(-1).basemap_api_key, 'new-stadia-key');
  assert.equal(Object.hasOwn(changedConfigs.at(-1), 'carto_api_key'), false);
});

test('duplicate bundle evaluation preserves existing custom elements and card metadata', () => {
  const harness = createHarness();
  assert.deepEqual(harness.customElements.defineAttempts, ['bom-radar-card', 'bom-radar-card-editor']);
  assert.equal(harness.window.customCards.length, 1);

  // Simulate the registry race where get() misses an existing definition but
  // define() observes it. Browsers report this duplicate-name error.
  harness.customElements.hideNextGet('bom-radar-card');
  harness.customElements.hideNextGet('bom-radar-card-editor');
  assert.doesNotThrow(() => evaluateLifecycleBundle(harness.sandbox));

  assert.deepEqual(harness.customElements.defineAttempts, [
    'bom-radar-card',
    'bom-radar-card-editor',
    'bom-radar-card',
    'bom-radar-card-editor',
  ]);
  assert.equal(harness.window.customCards.length, 1);
  assert.equal(harness.customElements.get('bom-radar-card'), harness.Card);
});
