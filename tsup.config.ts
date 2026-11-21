import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'gzip/index': 'src/gzip/index.ts',
    'zip-create/index': 'src/zip-create/index.ts',
    'zip-extract/index': 'src/zip-extract/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
  external: ['fflate']
});
