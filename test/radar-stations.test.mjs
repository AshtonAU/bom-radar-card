import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RADAR_STATIONS,
  getRadarStation,
  getRangeRingDistances,
  supportsRadarRangeRings,
  getRangeRingLabelPosition,
} from '../src/radar-stations.js';

test('radar station lookup accepts numeric and string ids and rejects invalid ids', () => {
  assert.equal(getRadarStation(4).name, 'Newcastle');
  assert.equal(getRadarStation('4').name, 'Newcastle');
  assert.equal(getRadarStation('004').name, 'Newcastle');
  assert.equal(getRadarStation(''), null);
  assert.equal(getRadarStation('4x'), null);
  assert.equal(getRadarStation(-1), null);
  assert.equal(getRadarStation(1.5), null);
  assert.equal(getRadarStation(Number.MAX_SAFE_INTEGER + 1), null);
});

test('radar station catalogue has unique numeric ids and valid coordinates', () => {
  const ids = RADAR_STATIONS.map(station => station.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const station of RADAR_STATIONS) {
    assert.match(station.id, /^\d+$/);
    assert.ok(station.name);
    assert.ok(station.state);
    assert.ok(Number.isFinite(station.latitude) && Math.abs(station.latitude) <= 90);
    assert.ok(Number.isFinite(station.longitude) && Math.abs(station.longitude) <= 180);
  }
});

test('range ring distance steps follow radar zoom levels', () => {
  assert.deepEqual(getRangeRingDistances(5.99), []);
  assert.deepEqual(getRangeRingDistances(6), [200]);
  assert.deepEqual(getRangeRingDistances(7), [200, 100]);
  assert.deepEqual(getRangeRingDistances(8), [100, 50]);
  assert.deepEqual(getRangeRingDistances(9), [60, 40, 20]);
  assert.deepEqual(getRangeRingDistances(10), [30, 20, 10]);
  assert.deepEqual(getRangeRingDistances(Number.NaN), []);
});

test('range rings are supported only on radar precipitation products', () => {
  for (const layer of ['rain_rate', 'reflectivity', 'accumulation_1hr']) {
    assert.equal(supportsRadarRangeRings(layer), true);
  }
  for (const layer of ['wind', 'temperature', '', null]) {
    assert.equal(supportsRadarRangeRings(layer), false);
  }
});

test('range labels are positioned due north by the requested distance', () => {
  const station = getRadarStation('4');
  const position = getRangeRingLabelPosition(station, 100);
  assert.ok(position[0] > station.latitude);
  assert.ok(Math.abs(position[1] - station.longitude) < 1e-10);
  assert.ok(Math.abs(position[0] - station.latitude - (100 / 6371) * 180 / Math.PI) < 0.01);
  assert.equal(getRangeRingLabelPosition(null, 100), null);
  assert.equal(getRangeRingLabelPosition(station, -1), null);
});
