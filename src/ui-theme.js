// UI surfaces follow the dashboard unless a built-in palette is selected.
// Basemap day/night selection is independent.
export function normalizeUiTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function getUiTheme(hass, systemDark = false, preference = 'auto') {
  const selected = normalizeUiTheme(preference);
  if (selected !== 'auto') return selected;
  const dark = typeof hass?.themes?.darkMode === 'boolean' ? hass.themes.darkMode : systemDark;
  return dark ? 'dark' : 'light';
}

export function syncUiTheme(element, hass, systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches, preference = 'auto') {
  const selected = normalizeUiTheme(preference);
  const theme = getUiTheme(hass, systemDark, selected);
  if (element.getAttribute('data-ui-theme') !== selected) element.setAttribute('data-ui-theme', selected);
  if (element.getAttribute('data-theme') !== theme) element.setAttribute('data-theme', theme);
}

export function observeUiTheme(element, getHass, getPreference = () => 'auto') {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const update = () => syncUiTheme(element, getHass(), media?.matches, getPreference());
  media?.addEventListener?.('change', update);
  update();
  return () => media?.removeEventListener?.('change', update);
}

export const UI_THEME_CSS = `
:host {
  color-scheme: light;
  --bom-fallback-surface: #ffffff;
  --bom-fallback-text: #202b38;
  --bom-fallback-muted: #5c6876;
  --bom-fallback-border: #d4dbe3;
  --bom-fallback-divider: #e6eaf0;
  --bom-fallback-accent: #26384b;
  --bom-fallback-track: #b7c1cd;
  --bom-fallback-scrollbar: #96a2b1;
  --bom-fallback-error: #b42318;
  --bom-fallback-shadow: 0 3px 14px rgb(22 34 48 / 0.14);

  --bom-surface: var(--card-background-color, var(--bom-fallback-surface));
  --bom-text: var(--primary-text-color, var(--bom-fallback-text));
  --bom-muted: var(--secondary-text-color, var(--bom-fallback-muted));
  --bom-border: var(--divider-color, var(--bom-fallback-border));
  --bom-divider: var(--divider-color, var(--bom-fallback-divider));
  --bom-default-accent: var(--primary-color, var(--bom-fallback-accent));
  --bom-track: var(--slider-track-color, var(--bom-fallback-track));
  --bom-scrollbar: var(--scrollbar-thumb-color, var(--bom-fallback-scrollbar));
  --bom-error: var(--error-color, var(--bom-fallback-error));
  --bom-shadow: var(--ha-card-box-shadow, var(--bom-fallback-shadow));
  --bom-hover: color-mix(in srgb, var(--bom-text) 5%, var(--bom-surface));
  --bom-selected: color-mix(in srgb, var(--bom-default-accent) 12%, var(--bom-surface));
  --bom-panel-background: linear-gradient(var(--bom-surface), var(--bom-surface)), var(--bom-fallback-surface);
  --bom-font-family: var(--ha-font-family-body, var(--primary-font-family, 'BOM Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif));
}
:host([data-theme="dark"]) {
  color-scheme: dark;
  --bom-fallback-surface: #1b2028;
  --bom-fallback-text: #edf1f5;
  --bom-fallback-muted: #afb9c6;
  --bom-fallback-border: #414b59;
  --bom-fallback-divider: #343d49;
  --bom-fallback-accent: #edf1f5;
  --bom-fallback-track: #617083;
  --bom-fallback-scrollbar: #778698;
  --bom-fallback-error: #ffaca5;
  --bom-fallback-shadow: 0 3px 14px rgb(0 0 0 / 0.28);
}
:host([data-ui-theme="light"]), :host([data-ui-theme="dark"]) {
  --bom-surface: var(--bom-fallback-surface);
  --bom-text: var(--bom-fallback-text);
  --bom-muted: var(--bom-fallback-muted);
  --bom-border: var(--bom-fallback-border);
  --bom-divider: var(--bom-fallback-divider);
  --bom-default-accent: var(--bom-fallback-accent);
  --bom-track: var(--bom-fallback-track);
  --bom-scrollbar: var(--bom-fallback-scrollbar);
  --bom-error: var(--bom-fallback-error);
  --bom-shadow: var(--bom-fallback-shadow);
}
`;
