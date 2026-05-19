import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Desktop Vite config for Tauri builds.
// This builds the desktop entry point (src/main.tsx) which initialises
// the Tauri platform layer before rendering the UI.
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../ui/src'),
    },
  },
  // Tauri expects a fixed port for dev mode
  server: {
    port: 5177,
    strictPort: true,
  },
  // Output to ../ui/dist so Tauri's frontendDist config finds it.
  // Actually, for desktop builds we output to our own dist/ so Tauri
  // can pick it up via frontendDist.
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})