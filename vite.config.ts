import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [glsl()],
  server: {
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        buildingEditor: resolve(__dirname, 'building-editor.html'),
      },
    },
  },
});
