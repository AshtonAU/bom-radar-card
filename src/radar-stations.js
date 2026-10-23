// Bureau of Meteorology public radar locations, retrieved 2026-10-23.
// Source: https://api.bom.gov.au/apikey/v1/mapping/overlays/radar_sites/FeatureServer/0
// Kept locally so selecting a radar requires no additional network request.
export const RADAR_STATIONS = [
  { id: '93', name: "Brewarrina", state: 'NSW', latitude: -29.97079, longitude: 146.81358 },
  { id: '40', name: "Canberra (Captains Flat)", state: 'NSW', latitude: -35.6614, longitude: 149.51225 },
  { id: '28', name: "Grafton", state: 'NSW', latitude: -29.62066, longitude: 152.96333 },
  { id: '94', name: "Hillston", state: 'NSW', latitude: -33.55221, longitude: 145.52863 },
  { id: '53', name: "Moree", state: 'NSW', latitude: -29.49029, longitude: 149.84619 },
  { id: '69', name: "Namoi (Blackjack Mountain)", state: 'NSW', latitude: -31.02422, longitude: 150.19197 },
  { id: '4', name: "Newcastle", state: 'NSW', latitude: -32.7298, longitude: 152.02537 },
  { id: '71', name: "Sydney (Terrey Hills)", state: 'NSW', latitude: -33.70078, longitude: 151.20948 },
  { id: '55', name: "Wagga Wagga", state: 'NSW', latitude: -35.15815, longitude: 147.45631 },
  { id: '3', name: "Wollongong (Appin)", state: 'NSW', latitude: -34.26238, longitude: 150.87515 },
  { id: '96', name: "Yeoval", state: 'NSW', latitude: -32.74447, longitude: 148.70809 },
  { id: '25', name: "Alice Springs", state: 'NT', latitude: -23.79505, longitude: 133.88894 },
  { id: '63', name: "Darwin (Berrimah)", state: 'NT', latitude: -12.45591, longitude: 130.92656 },
  { id: '112', name: "Gove", state: 'NT', latitude: -12.26897, longitude: 136.82044 },
  { id: '42', name: "Katherine (Tindal)", state: 'NT', latitude: -14.51091, longitude: 132.44703 },
  { id: '77', name: "Warruwi", state: 'NT', latitude: -11.64848, longitude: 133.37997 },
  { id: '24', name: "Bowen", state: 'QLD', latitude: -19.88577, longitude: 148.07568 },
  { id: '50', name: "Brisbane (Marburg)", state: 'QLD', latitude: -27.60634, longitude: 152.54004 },
  { id: '66', name: "Brisbane (Mt Stapylton)", state: 'QLD', latitude: -27.71773, longitude: 153.24 },
  { id: '19', name: "Cairns", state: 'QLD', latitude: -16.81817, longitude: 145.66303 },
  { id: '72', name: "Emerald", state: 'QLD', latitude: -23.54959, longitude: 148.23919 },
  { id: '23', name: "Gladstone", state: 'QLD', latitude: -23.85507, longitude: 151.26252 },
  { id: '74', name: "Greenvale", state: 'QLD', latitude: -18.99765, longitude: 144.99586 },
  { id: '8', name: "Gympie (Mount Kanigan)", state: 'QLD', latitude: -25.95733, longitude: 152.57692 },
  { id: '56', name: "Longreach", state: 'QLD', latitude: -23.43979, longitude: 144.28226 },
  { id: '22', name: "Mackay", state: 'QLD', latitude: -21.11725, longitude: 149.21728 },
  { id: '36', name: "Mornington Island (Gulf of Carpentaria)", state: 'QLD', latitude: -16.66409, longitude: 139.18124 },
  { id: '75', name: "Mount Isa", state: 'QLD', latitude: -20.71121, longitude: 139.55529 },
  { id: '107', name: "Richmond", state: 'QLD', latitude: -20.75177, longitude: 143.14144 },
  { id: '98', name: "Taroom", state: 'QLD', latitude: -25.69617, longitude: 149.89817 },
  { id: '108', name: "Toowoomba", state: 'QLD', latitude: -27.27406, longitude: 151.993 },
  { id: '106', name: "Townsville", state: 'QLD', latitude: -19.41978, longitude: 146.55096 },
  { id: '67', name: "Warrego", state: 'QLD', latitude: -26.44018, longitude: 147.34913 },
  { id: '78', name: "Weipa", state: 'QLD', latitude: -12.66644, longitude: 141.92461 },
  { id: '41', name: "Willis Island", state: 'QLD', latitude: -16.28738, longitude: 149.96463 },
  { id: '64', name: "Adelaide (Buckland Park)", state: 'SA', latitude: -34.61701, longitude: 138.46877 },
  { id: '46', name: "Adelaide (Sellicks Hill)", state: 'SA', latitude: -35.32955, longitude: 138.50248 },
  { id: '33', name: "Ceduna", state: 'SA', latitude: -32.12984, longitude: 133.69636 },
  { id: '14', name: "Mount Gambier", state: 'SA', latitude: -37.74771, longitude: 140.77463 },
  { id: '27', name: "Woomera", state: 'SA', latitude: -31.15581, longitude: 136.8044 },
  { id: '76', name: "Hobart (Mt Koonya)", state: 'TAS', latitude: -43.1126, longitude: 147.80522 },
  { id: '52', name: "NW Tasmania (West Takone)", state: 'TAS', latitude: -41.17916, longitude: 145.58 },
  { id: '68', name: "Bairnsdale", state: 'VIC', latitude: -37.88754, longitude: 147.5755 },
  { id: '2', name: "Melbourne (Laverton)", state: 'VIC', latitude: -37.85524, longitude: 144.75545 },
  { id: '97', name: "Mildura", state: 'VIC', latitude: -34.28712, longitude: 141.59821 },
  { id: '95', name: "Rainbow (Wimmera)", state: 'VIC', latitude: -35.99756, longitude: 142.01332 },
  { id: '49', name: "Yarrawonga", state: 'VIC', latitude: -36.02962, longitude: 146.02275 },
  { id: '31', name: "Albany", state: 'WA', latitude: -34.94176, longitude: 117.81635 },
  { id: '17', name: "Broome", state: 'WA', latitude: -17.94826, longitude: 122.23532 },
  { id: '114', name: "Carnarvon", state: 'WA', latitude: -24.88827, longitude: 113.66941 },
  { id: '15', name: "Dampier", state: 'WA', latitude: -20.65353, longitude: 116.68331 },
  { id: '32', name: "Esperance", state: 'WA', latitude: -33.8302, longitude: 121.89173 },
  { id: '6', name: "Geraldton", state: 'WA', latitude: -28.80467, longitude: 114.69735 },
  { id: '44', name: "Giles", state: 'WA', latitude: -25.03323, longitude: 128.30174 },
  { id: '39', name: "Halls Creek", state: 'WA', latitude: -18.22894, longitude: 127.66283 },
  { id: '48', name: "Kalgoorlie", state: 'WA', latitude: -30.78422, longitude: 121.45483 },
  { id: '111', name: "Karratha", state: 'WA', latitude: -20.99244, longitude: 116.8758 },
  { id: '29', name: "Learmonth", state: 'WA', latitude: -22.10319, longitude: 113.99967 },
  { id: '38', name: "Newdegate", state: 'WA', latitude: -33.09695, longitude: 119.0088 },
  { id: '70', name: "Perth (Serpentine)", state: 'WA', latitude: -32.39176, longitude: 115.86696 },
  { id: '16', name: "Port Hedland", state: 'WA', latitude: -20.37184, longitude: 118.63166 },
  { id: '58', name: "South Doodlakine", state: 'WA', latitude: -31.77778, longitude: 117.95279 },
  { id: '79', name: "Watheroo", state: 'WA', latitude: -30.36021, longitude: 116.28972 },
  { id: '7', name: "Wyndham", state: 'WA', latitude: -15.4517, longitude: 128.12086 },
];

const RADAR_RANGE_RING_LAYERS = new Set(['rain_rate', 'reflectivity', 'accumulation_1hr']);
const EARTH_RADIUS_KM = 6371; // Leaflet's Earth radius is 6,371,000 metres.

export function getRadarStation(value) {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) return null;
    value = Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) return null;
  const id = String(value);
  return RADAR_STATIONS.find((station) => station.id === id) ?? null;
}

export function getRangeRingDistances(zoom) {
  if (!Number.isFinite(zoom) || zoom < 6) return [];
  if (zoom < 7) return [200];
  if (zoom < 8) return [200, 100];
  if (zoom < 9) return [100, 50];
  if (zoom < 10) return [60, 40, 20];
  return [30, 20, 10];
}

export function supportsRadarRangeRings(layerKey) {
  return RADAR_RANGE_RING_LAYERS.has(layerKey);
}

// Return a Leaflet-compatible [latitude, longitude] point due north of the radar.
export function getRangeRingLabelPosition(station, distanceKm) {
  const latitude = station?.latitude;
  const longitude = station?.longitude;
  if (
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    !Number.isFinite(distanceKm) || distanceKm < 0
  ) return null;

  const latitudeRadians = latitude * Math.PI / 180;
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const sinDestinationLatitude = Math.sin(latitudeRadians) * Math.cos(angularDistance)
    + Math.cos(latitudeRadians) * Math.sin(angularDistance);
  const destinationLatitude = Math.asin(Math.max(-1, Math.min(1, sinDestinationLatitude)));
  const longitudeOffset = Math.atan2(
    0,
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
  );
  const destinationLongitude = ((longitude + longitudeOffset * 180 / Math.PI + 540) % 360) - 180;
  return [destinationLatitude * 180 / Math.PI, destinationLongitude];
}
