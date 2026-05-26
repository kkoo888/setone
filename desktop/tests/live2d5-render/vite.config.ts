import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'entry.ts'),
      name: 'Live2D5Test',
      formats: ['iife'],
      fileName: () => 'bundle.js',
    },
    rollupOptions: {
      output: {
        extend: true, // 挂载到 window.Live2D5Test
      },
    },
    sourcemap: true,
    minify: false,
  },
  resolve: {
    alias: {
      '@modules': resolve(__dirname, '../../modules'),
    },
  },
  server: {
    port: 0, // 随机端口
  },
})
