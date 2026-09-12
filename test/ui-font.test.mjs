import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { rollup } from 'rollup';
import { bundleUiFont, uiFontLicenseBanner } from '../scripts/bundle-ui-font.mjs';

const bundle = await rollup({ input: 'src/ui-font.js', plugins: [bundleUiFont()] });
const { output } = await bundle.generate({ format: 'iife', name: 'uiFont' });
await bundle.close();

test('font is embedded, licensed, and loaded only once across card instances', async () => {
  const faces = [];
  let loads = 0;
  const context = vm.createContext({
    document: { fonts: { add: font => faces.push(font) } },
    FontFace: class {
      constructor(name, source, descriptors) {
        assert.equal(name, 'BOM Inter');
        assert.ok(source.startsWith('url(data:font/woff2;base64,d09GMg'));
        assert.equal(descriptors.display, 'swap');
        assert.equal(descriptors.weight, '100 900');
      }
      load() { loads++; return Promise.resolve(this); }
    },
  });
  vm.runInContext(output[0].code, context);
  await context.uiFont.loadUiFont();
  await context.uiFont.loadUiFont();
  assert.equal(faces.length, 1);
  assert.equal(loads, 1);
  const license = await uiFontLicenseBanner();
  assert.match(license, /The Inter Project Authors/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
  assert.match(license, /DISCLAIMER/);
});

test('font failure is reported without preventing system-font fallback', async () => {
  const warnings = [];
  const context = vm.createContext({
    document: { fonts: { add() {} } },
    console: { warn: (...args) => warnings.push(args) },
    FontFace: class { load() { return Promise.reject(new Error('Font blocked')); } },
  });
  vm.runInContext(output[0].code, context);
  await context.uiFont.loadUiFont();
  await context.uiFont.loadUiFont();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /using system font/);
  const unsupported = vm.createContext({});
  vm.runInContext(output[0].code, unsupported);
  assert.equal(unsupported.uiFont.loadUiFont(), undefined);
});
