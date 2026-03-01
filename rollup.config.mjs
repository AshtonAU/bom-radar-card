import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/bom-radar-card.js',
  output: {
    file: 'dist/bom-radar-card.js',
    format: 'es',
  },
  plugins: [
    resolve(),
    terser(),
  ],
};
