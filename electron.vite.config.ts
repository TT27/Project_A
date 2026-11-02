import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const aliases = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@domain': resolve(__dirname, 'src/domain'),
  '@renderer': resolve(__dirname, 'src/renderer')
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: aliases },
    build: {
      sourcemap: true,
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    // zod must be bundled: a sandboxed preload cannot require() packages from node_modules.
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
    resolve: { alias: aliases },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // The preload runs inside a sandboxed renderer: it must be a single CommonJS file
        // with no runtime require() of project modules.
        output: { format: 'cjs', inlineDynamicImports: true }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: { alias: aliases },
    build: {
      sourcemap: false,
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } }
    }
  }
});
