import { readFile } from 'node:fs/promises';

const fontRoot = new URL('../node_modules/@fontsource-variable/inter/', import.meta.url);
const moduleId = '\0bom-ui-font';

export function bundleUiFont() {
  return {
    name: 'bom-ui-font',
    resolveId(source) { return source === 'virtual:bom-ui-font' ? moduleId : null; },
    async load(id) {
      if (id !== moduleId) return null;
      const font = await readFile(new URL('files/inter-latin-wght-normal.woff2', fontRoot));
      return `export default ${JSON.stringify(`data:font/woff2;base64,${font.toString('base64')}`)};`;
    },
  };
}

export async function uiFontLicenseBanner() {
  const license = await readFile(new URL('LICENSE', fontRoot), 'utf8');
  return `/*! Bundled Inter font — SIL Open Font License 1.1\n${license}\n*/`;
}
