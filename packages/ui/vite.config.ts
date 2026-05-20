import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: [/^@tauri-apps\/api\//],
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/cytoscape')) return 'cytoscape'
          if (id.includes('node_modules/katex')) return 'katex'
          if (id.includes('node_modules/mermaid')) return 'mermaid'
          if (id.includes('@mermaid-js')) return 'mermaid'
          if (id.includes('node_modules/dagre')) return 'mermaid-vendor'
          if (id.includes('node_modules/khroma')) return 'mermaid-vendor'
          if (id.includes('node_modules/non-layered-tidy')) return 'mermaid-vendor'
          if (id.includes('node_modules/lodash')) return 'lodash'
          if (id.includes('node_modules/marked') || id.includes('node_modules/markdown')) return 'markdown'
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark')) return 'markdown'
          if (id.includes('node_modules/rehype')) return 'markdown'
          if (id.includes('node_modules/codemirror') || id.includes('@codemirror')) return 'codemirror'
          if (id.includes('node_modules/')) {
            // Further split react/vendor by first path segment
            const parts = id.split('node_modules/')
            if (parts.length > 1) {
              const pkg = parts[1].split('/')[0]
              if (pkg.startsWith('@')) {
                const scoped = parts[1].split('/')[1]
                if (['react', 'react-dom', 'react-router', 'scheduler', 'zustand', 'use-sync-external-store'].includes(pkg) ||
                    ['react', 'react-dom', 'react-router', 'scheduler', 'zustand'].includes(scoped)) {
                  return 'react-vendor'
                }
              }
              if (['lucide-react', 'lucide-static'].includes(pkg)) return 'icons'
            }
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5177,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
})
