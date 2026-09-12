import { getLayerLegend } from './bom-legends.js';

// Keep the existing radar appearance. All other continuous palettes use evenly
// spaced stops. Neither is a numeric axis: BOM's exact ranges stay in the data.
const RADAR_STOP_POSITIONS = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 100];
const percentage = (index, intervals) => Number((100 * index / intervals).toFixed(4));

function cssColor([r, g, b, a]) {
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

export function getLegendConfig(layerKey) {
  const legend = getLayerLegend(layerKey);
  if (!legend || legend.kind === 'direction') return null;

  const { bands, kind } = legend;
  const stops = bands.map(({ rgba }, index) => {
    const color = cssColor(rgba);
    if (kind === 'categorical' || bands.length === 1) {
      // Hard stops retain categorical colours, including the single fog band.
      return `${color} ${percentage(index, bands.length)}%, ${color} ${percentage(index + 1, bands.length)}%`;
    }
    const position = kind === 'radar' ? RADAR_STOP_POSITIONS[index] : percentage(index, bands.length - 1);
    return `${color} ${position}%`;
  });
  const meaning = layerKey === 'reflectivity' ? 'weaker to stronger radar echoes; qualitative colour key'
    : layerKey === 'rain_rate' ? 'lighter to heavier rainfall; qualitative colour key'
      : kind === 'categorical' ? 'discrete colour categories'
        : 'qualitative colour gradient, not a numerical axis';
  const ranges = bands.map(({ label }) => `${label}${kind === 'categorical' ? '' : ` ${legend.unit}`}`).join('; ');
  return {
    ...legend,
    gradient: `linear-gradient(90deg, ${stops.join(', ')})`,
    ariaLabel: `${legend.title}: ${meaning}. ${ranges}.`,
  };
}

export function renderLegendHtml(layerKey) {
  const legend = getLegendConfig(layerKey);
  if (!legend) return '';
  return `<div class="legend-card" data-layer="${escapeHtml(layerKey)}" role="img" aria-label="${escapeHtml(legend.ariaLabel)}">
    <div class="legend-scale" aria-hidden="true" style="background:${legend.gradient}"></div>
  </div>`;
}

export function renderLegendBandsHtml(layerKey) {
  const legend = getLayerLegend(layerKey);
  if (!legend || legend.kind === 'direction') return '';
  const unit = legend.kind === 'categorical' ? '' : ` ${legend.unit}`;
  return `<ul class="bom-key-bands">${legend.bands.map(({ label, rgba }) =>
    `<li><span class="bom-key-swatch" aria-hidden="true" style="background:${cssColor(rgba)}"></span><span>${escapeHtml(label + unit)}</span></li>`,
  ).join('')}</ul><p class="bom-key-note">BOM colour bands, not a reading at your location.</p>`;
}
