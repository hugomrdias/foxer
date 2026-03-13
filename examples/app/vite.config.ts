import path from 'path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    plugins: ['promise', 'import', 'react', 'react-perf'],
  },
  run: {
    tasks: {
      check: {
        command: 'vp lint && vp fmt',
      },
      dev: {
        command: 'vp dev',
        dependsOn: ['check'],
        cache: false,
      },
      build: {
        command: 'vp build',
        dependsOn: ['check'],
      },
    },
  },
})
