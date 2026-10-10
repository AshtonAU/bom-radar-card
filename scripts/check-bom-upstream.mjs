import { BOM_LAYERS, BOM_TILE_MATRIX_SETS } from '../src/bom-layers.js';
import { RADAR_COVERAGE_TILE_URL } from '../src/radar-coverage.js';
import { createTimestampAvailabilityResolver } from '../src/timestamp-availability.js';
import { generateFallbackTimestamps } from '../src/timestamps.js';

const CAPABILITIES_URL =
  'https://api.bom.gov.au/apikey/v1/mapping/timeseries/wmts/1.0.0/WMTSCapabilities.xml';
const WMTS_BASE = 'https://api.bom.gov.au/apikey/v1/mapping/timeseries/wmts';
const TOWNS_AND_CITIES_TILE_URL =
  'https://api.bom.gov.au/apikey/v1/mapping/overlays/towns_and_cities/MapServer/tile/7/76/117?blankTile=false';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_ATTEMPTS = 3;
const TILE_CHECK_CONCURRENCY = 4;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'bom-radar-card-upstream-check/1.0',
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      const retryableStatus = response.status === 404 || response.status >= 500;
      if (!retryableStatus || attempt === REQUEST_ATTEMPTS) {
        return response;
      }
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === REQUEST_ATTEMPTS) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  throw lastError || new Error('Upstream request failed without a response');
}

function getLayerBlock(capabilities, layerId) {
  const identifier = `<ows:Identifier>${layerId}</ows:Identifier>`;
  const identifierIndex = capabilities.indexOf(identifier);
  if (identifierIndex === -1) {
    return null;
  }

  const layerStart = capabilities.lastIndexOf('<Layer>', identifierIndex);
  const layerEnd = capabilities.indexOf('</Layer>', identifierIndex);
  if (layerStart === -1 || layerEnd === -1) {
    throw new Error(`Capabilities XML has an incomplete layer entry for ${layerId}`);
  }

  return capabilities.slice(layerStart, layerEnd + '</Layer>'.length);
}

function getLayerTimestamps(layerBlock, layerId) {
  const timestamps = [...layerBlock.matchAll(/<Value>([^<]+)<\/Value>/g)]
    .map((match) => match[1])
    .filter((value) => Number.isFinite(Date.parse(value)));

  if (timestamps.length === 0) {
    throw new Error(`Capabilities XML has no valid timestamps for ${layerId}`);
  }

  return timestamps;
}

function getLayerDefaultTimestamp(layerBlock) {
  return layerBlock.match(/<Default>([^<]+)<\/Default>/)?.[1] || null;
}

function getLayerTileMatrixSets(layerBlock) {
  return [...layerBlock.matchAll(/<TileMatrixSet>([^<]+)<\/TileMatrixSet>/g)]
    .map((match) => match[1]);
}

function getTimestampCadencesMinutes(timestamps) {
  return [...new Set(timestamps.slice(1).map((value, index) =>
    (Date.parse(value) - Date.parse(timestamps[index])) / 60_000))];
}

function getTileMatrixSetBlock(capabilities, matrixSetId) {
  const identifier = `<ows:Identifier>${matrixSetId}</ows:Identifier>`;
  let identifierIndex = capabilities.indexOf(identifier);

  while (identifierIndex !== -1) {
    const matrixSetStart = capabilities.lastIndexOf('<TileMatrixSet>', identifierIndex);
    const layerStart = capabilities.lastIndexOf('<Layer>', identifierIndex);
    if (matrixSetStart !== -1 && matrixSetStart > layerStart) {
      const matrixSetEnd = capabilities.indexOf('</TileMatrixSet>', identifierIndex);
      if (matrixSetEnd === -1) {
        throw new Error(`Capabilities XML has an incomplete matrix set for ${matrixSetId}`);
      }
      return capabilities.slice(matrixSetStart, matrixSetEnd + '</TileMatrixSet>'.length);
    }
    identifierIndex = capabilities.indexOf(identifier, identifierIndex + identifier.length);
  }

  return null;
}

function getTileMatrices(matrixSetBlock, matrixSetId) {
  const matrices = [...matrixSetBlock.matchAll(/<TileMatrix>([\s\S]*?)<\/TileMatrix>/g)].map((match) => {
    const block = match[1];
    const readNumber = (tag) => Number(block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]);
    const topLeft = block.match(/<TopLeftCorner>([^<]+)<\/TopLeftCorner>/)?.[1]
      ?.trim()
      .split(/\s+/)
      .map(Number);

    return {
      z: readNumber('ows:Identifier'),
      tlx: topLeft?.[0],
      tly: topLeft?.[1],
      tileWidth: readNumber('TileWidth'),
      tileHeight: readNumber('TileHeight'),
      w: readNumber('MatrixWidth'),
      h: readNumber('MatrixHeight'),
    };
  });

  if (matrices.length === 0) {
    throw new Error(`Capabilities XML has no tile matrices for ${matrixSetId}`);
  }
  return matrices;
}

function approximatelyEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
}

function createTileUrl(layerConfig, time, matrix = 0, row = 0, col = 0) {
  const params = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    LAYER: layerConfig.id,
    STYLE: 'default',
    FORMAT: 'image/png',
    TILEMATRIXSET: layerConfig.tileMatrixSet,
    TILEMATRIX: String(matrix),
    TILEROW: String(row),
    TILECOL: String(col),
    time,
  });
  return `${WMTS_BASE}?${params}`;
}

function hasPngSignature(bytes) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function createRadarCoverageTileUrl(matrix, row, col) {
  return RADAR_COVERAGE_TILE_URL
    .replace('{z}', String(matrix))
    .replace('{y}', String(row))
    .replace('{x}', String(col));
}

const configuredLayers = Object.entries(BOM_LAYERS);
const configuredLayerIds = configuredLayers.map(([, config]) => config.id);
if (configuredLayerIds.length === 0 || new Set(configuredLayerIds).size !== configuredLayerIds.length) {
  throw new Error('BOM_LAYERS must contain unique WMTS layer identifiers');
}

const capabilitiesResponse = await fetchWithRetry(CAPABILITIES_URL, {
  headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
});
if (!capabilitiesResponse.ok) {
  throw new Error(`BOM capabilities request failed with HTTP ${capabilitiesResponse.status}`);
}

const capabilities = await capabilitiesResponse.text();
const missingLayerIds = configuredLayerIds.filter((layerId) => !getLayerBlock(capabilities, layerId));
if (missingLayerIds.length > 0) {
  throw new Error(`BOM capabilities is missing configured layers: ${missingLayerIds.join(', ')}`);
}

const capabilitiesDateHeader = capabilitiesResponse.headers.get('date');
const capabilitiesDate = new Date(capabilitiesDateHeader || Date.now());
if (!Number.isFinite(capabilitiesDate.getTime())) {
  throw new Error(`BOM capabilities returned an invalid Date header: ${capabilitiesDateHeader}`);
}

const invalidLayers = [];
const publishedTimesByLayer = new Map();
const runtimeTimesByLayer = new Map();

for (const [matrixSetId, expectedMatrices] of Object.entries(BOM_TILE_MATRIX_SETS)) {
  const matrixSetBlock = getTileMatrixSetBlock(capabilities, matrixSetId);
  if (!matrixSetBlock) {
    invalidLayers.push(`${matrixSetId}: matrix set is missing from capabilities`);
    continue;
  }
  if (!matrixSetBlock.includes('urn:ogc:def:crs:EPSG:6.3:3857')) {
    invalidLayers.push(`${matrixSetId}: expected EPSG:3857 support`);
  }

  const advertisedMatrices = getTileMatrices(matrixSetBlock, matrixSetId);
  for (const expected of expectedMatrices) {
    const advertised = advertisedMatrices.find((matrix) => matrix.z === expected.z);
    if (
      !advertised ||
      advertised.tileWidth !== 256 ||
      advertised.tileHeight !== 256 ||
      advertised.w !== expected.w ||
      advertised.h !== expected.h ||
      !approximatelyEqual(advertised.tlx, expected.tlx) ||
      !approximatelyEqual(advertised.tly, expected.tly)
    ) {
      invalidLayers.push(`${matrixSetId}: matrix ${expected.z} geometry no longer matches the runtime offsets`);
    }
  }
}

for (const [layerKey, config] of configuredLayers) {
  const layerBlock = getLayerBlock(capabilities, config.id);
  const publishedTimes = getLayerTimestamps(layerBlock, config.id);
  const defaultTimestamp = getLayerDefaultTimestamp(layerBlock);
  const matrixSets = getLayerTileMatrixSets(layerBlock);
  const cadences = getTimestampCadencesMinutes(publishedTimes);
  const expectedFrameCapacity = config.fallbackMaxFrames || 9;
  publishedTimesByLayer.set(layerKey, publishedTimes);

  if (new Set(publishedTimes).size !== publishedTimes.length) {
    invalidLayers.push(`${layerKey}: published timestamps contain duplicates`);
  }
  if (publishedTimes.some((value, index) => index > 0 && Date.parse(value) <= Date.parse(publishedTimes[index - 1]))) {
    invalidLayers.push(`${layerKey}: published timestamps are not strictly ascending`);
  }

  if (!matrixSets.includes(config.tileMatrixSet)) {
    invalidLayers.push(
      `${layerKey}: expected matrix set ${config.tileMatrixSet}, advertised ${matrixSets.join(', ') || 'none'}`,
    );
  }
  if (publishedTimes.length < expectedFrameCapacity) {
    invalidLayers.push(
      `${layerKey}: expected at least ${expectedFrameCapacity} published times, advertised ${publishedTimes.length}`,
    );
  }
  if (cadences.length !== 1 || cadences[0] !== config.fallbackStepMinutes) {
    invalidLayers.push(
      `${layerKey}: expected ${config.fallbackStepMinutes}-minute cadence, advertised ${cadences.join(', ') || 'none'}`,
    );
  }
  if (!defaultTimestamp || defaultTimestamp !== publishedTimes.at(-1)) {
    invalidLayers.push(
      `${layerKey}: default timestamp ${defaultTimestamp || 'missing'} does not match the latest published value`,
    );
  }

  if (config.timeMode === 'past') {
    const latestAgeMinutes = (capabilitiesDate.getTime() - Date.parse(publishedTimes.at(-1))) / 60_000;
    const maximumAgeMinutes = Math.max(180, config.fallbackStepMinutes * 2);
    const maximumFutureMinutes = config.fallbackStepMinutes >= 1440
      ? config.fallbackStepMinutes
      : 15;
    if (latestAgeMinutes < -maximumFutureMinutes || latestAgeMinutes > maximumAgeMinutes) {
      invalidLayers.push(
        `${layerKey}: latest observation ${publishedTimes.at(-1)} has unexpected age ${latestAgeMinutes.toFixed(1)} minutes`,
      );
    }
  } else if (Date.parse(publishedTimes.at(-1)) < capabilitiesDate.getTime()) {
    invalidLayers.push(`${layerKey}: forecast horizon contains no current or future timestamp`);
  }

  const generatedTimes = generateFallbackTimestamps(config, 9, capabilitiesDate);
  const publishedTimeSet = new Set(publishedTimes);
  const resolver = createTimestampAvailabilityResolver({
    probe: async (timestamp) => publishedTimeSet.has(timestamp),
  });
  const runtimeTimes = await resolver.resolve({
    cacheKey: `${config.id}\u0000${config.tileMatrixSet}`,
    timestamps: generatedTimes,
    stepMinutes: config.fallbackStepMinutes || 5,
  });
  runtimeTimesByLayer.set(layerKey, runtimeTimes);

  if (
    runtimeTimes.length !== generatedTimes.length ||
    runtimeTimes.some((timestamp) => !publishedTimeSet.has(timestamp))
  ) {
    invalidLayers.push(
      `${layerKey}: generated window cannot be corrected to ${generatedTimes.length} current published timestamps`,
    );
  }
}
if (invalidLayers.length > 0) {
  throw new Error(`BOM layer metadata does not match the runtime registry:\n- ${invalidLayers.join('\n- ')}`);
}

async function checkPngTile(layerKey, layerConfig, time, matrix = 0, row = 0, col = 0) {
  return checkPngUrl(
    `BOM WMTS ${layerKey}`,
    createTileUrl(layerConfig, time, matrix, row, col),
  );
}

async function checkPngUrl(label, url) {
  const tileResponse = await fetchWithRetry(url, {
    headers: { Accept: 'image/png,image/*;q=0.9,*/*;q=0.1' },
  });
  if (!tileResponse.ok) {
    throw new Error(`${label} tile request failed with HTTP ${tileResponse.status}`);
  }

  const tileBytes = new Uint8Array(await tileResponse.arrayBuffer());
  if (!hasPngSignature(tileBytes)) {
    throw new Error(
      `${label} response was not a PNG ` +
      `(${tileResponse.headers.get('content-type') || 'unknown type'})`,
    );
  }
}

let checkedTiles = 0;
for (let index = 0; index < configuredLayers.length; index += TILE_CHECK_CONCURRENCY) {
  const batch = configuredLayers.slice(index, index + TILE_CHECK_CONCURRENCY);
  await Promise.all(batch.map(async ([layerKey, layerConfig]) => {
    const runtimeTimes = runtimeTimesByLayer.get(layerKey);
    const stableTime = runtimeTimes[Math.floor(runtimeTimes.length / 2)];
    const sydneyCol = layerConfig.tileMatrixSet === 'GoogleMapsCompatible_BoM_ADFD' ? 13 : 16;
    await checkPngTile(layerKey, layerConfig, stableTime, 7, 10, sydneyCol);
  }));
  checkedTiles += batch.length;
}

const availabilityProbeChecks = [
  ['reflectivity', publishedTimesByLayer.get('reflectivity').at(-1)],
  [
    'air_temperature',
    publishedTimesByLayer.get('air_temperature')
      .find((value) => Date.parse(value) >= capabilitiesDate.getTime()) ||
      publishedTimesByLayer.get('air_temperature').at(-1),
  ],
];
for (const [layerKey, time] of availabilityProbeChecks) {
  const layerConfig = BOM_LAYERS[layerKey];
  await checkPngTile(`${layerKey} availability probe`, layerConfig, time);
  checkedTiles++;
}

await Promise.all([
  checkPngUrl('BOM radar coverage z0', createRadarCoverageTileUrl(0, 0, 0)),
  checkPngUrl('BOM radar coverage Australia z5', createRadarCoverageTileUrl(5, 19, 29)),
  checkPngUrl('BOM towns and cities Sydney z7', TOWNS_AND_CITIES_TILE_URL),
]);
checkedTiles += 3;

console.log(
  `Runtime upstream check passed: ${configuredLayerIds.length} BOM layers with matching matrix sets, cadence, ` +
    `frame capacity, correctable runtime windows, current defaults, freshness, and ${checkedTiles} live PNG tiles`,
);
