import fontUrl from 'virtual:bom-ui-font';

let fontLoad;

// One embedded font for every card instance; no external font service or HACS asset.
export function loadUiFont() {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  if (!fontLoad) {
    const font = new FontFace('BOM Inter', `url(${fontUrl})`, {
      weight: '100 900', style: 'normal', display: 'swap',
    });
    document.fonts.add(font);
    fontLoad = font.load().catch(error => {
      console.warn('BOM Radar Card: UI font unavailable; using system font.', error);
    });
  }
  return fontLoad;
}
