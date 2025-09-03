import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  build: {
    target: 'esnext',
    lib: {
      entry: {
        extension: './src/web/extension.ts',
        'test/suite/index': './src/web/test/suite/index.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['vscode'],
      output: {
        dir: './dist/web',
        entryFileNames: '[name].js',
        format: 'cjs',
      },
    },
    sourcemap: 'hidden',
  },
  resolve: {
    alias: {
      path: 'path-browserify',
    },
  },
  define: {
    global: 'globalThis',
  },
});