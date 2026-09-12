import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rollup } from 'rollup';
import config from '../rollup.config.mjs';
import { getLayerLegend } from '../src/bom-legends.js';
import { getLegendConfig } from '../src/legend.js';
import { BOM_LAYERS } from '../src/bom-layers.js';

// Local-only visual QA: build in memory without modifying the release asset.
const bundle = await rollup(config);
const { output } = await bundle.generate(config.output);
await bundle.close();
const html = await readFile(new URL('../dev/legend-preview.html', import.meta.url));
const visualHtml = await readFile(new URL('../dev/visual-preview.html', import.meta.url));
createServer((request, response) => {
  if (request.url?.split('?')[0] === '/visual') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(visualHtml);
    return;
  }
  if (request.url === '/legend-examples.json') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(Object.fromEntries(Object.keys(BOM_LAYERS).map(key => [key, {
      ...getLayerLegend(key), gradient: getLegendConfig(key)?.gradient ?? null,
    }]))));
    return;
  }
  const isBundle = request.url === '/card.js';
  response.writeHead(200, { 'Content-Type': isBundle ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' });
  response.end(isBundle ? output[0].code : html);
}).listen(8124, '127.0.0.1', () => console.log('Legend preview: http://127.0.0.1:8124'));
