import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { bundleUiFont, uiFontLicenseBanner } from './scripts/bundle-ui-font.mjs';

const licenseBanner = `/*!
 * bom-radar-card - MIT License
 *
 * Includes Leaflet 1.9.4 (https://leafletjs.com)
 * Leaflet: BSD 2-Clause License
 * Copyright (c) 2010-2023, Volodymyr Agafonkin
 * Copyright (c) 2010-2011, CloudMade
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */`;

export default {
  input: 'src/bom-radar-card.js',
  onwarn(warning, warn) {
    if (warning.code === 'UNRESOLVED_IMPORT') {
      throw new Error(`Unresolved bundle import: ${warning.source || warning.message}`);
    }
    warn(warning);
  },
  output: {
    file: 'dist/bom-radar-card.js',
    format: 'es',
    banner: async () => `${licenseBanner}\n${await uiFontLicenseBanner()}`,
  },
  plugins: [
    bundleUiFont(),
    nodeResolve({ browser: true }),
    terser({
      format: {
        comments: /^!/,
      },
    }),
  ],
};
