import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * Extract the actual package name from a module ID, handling both
 * npm flat and pnpm nested path structures.
 *
 * npm:   .../node_modules/lodash-es/...
 * pnpm:  .../node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/...
 */
function extractPackageName(id: string): string | null {
  const nmIndex = id.lastIndexOf('node_modules/')
  if (nmIndex === -1) return null

  const afterNm = id.slice(nmIndex + 'node_modules/'.length)
  // Skip .pnpm/ prefix used by pnpm: ".pnpm/pkg@ver/node_modules/actual-pkg/"
  const afterPnpm = afterNm.startsWith('.pnpm/')
    ? afterNm.slice('.pnpm/'.length)
    : afterNm

  // e.g. "lodash-es@4.17.21/node_modules/lodash-es/..." → take first segment
  const firstSegment = afterPnpm.split('/')[0]

  // Scoped package: strip version after @scope/pkg@version
  // e.g. "@radix-ui+react-dialog@1.2.3" → extract "@radix-ui/react-dialog"
  if (firstSegment.startsWith('@')) {
    // pnpm encodes scoped packages as @scope+name@version
    // Find the last @ that starts a version (after the scope/name)
    const plusIndex = firstSegment.indexOf('+')
    if (plusIndex !== -1) {
      const scope = firstSegment.slice(0, plusIndex) // @radix-ui
      const rest = firstSegment.slice(plusIndex + 1) // react-dialog@1.2.3 or react-dialog
      const nameNoVersion = rest.split('@')[0] // react-dialog
      return `${scope}/${nameNoVersion}`
    }
    return firstSegment
  }

  // Unscoped: strip version suffix
  // e.g. "scheduler@0.27.0" → "scheduler"
  return firstSegment.split('@')[0]
}

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
          if (!id.includes('node_modules/')) return

          // ── Specific groupings (high priority) ──

          // Cytoscape graph library (used by mermaid architecture diagrams)
          if (id.includes('/cytoscape')) return 'cytoscape'
          if (id.includes('/cytoscape-fcose') || id.includes('/cytoscape-cose')) return 'cytoscape'
          if (id.includes('/cose-base') || id.includes('/layout-base')) return 'cytoscape'

          // KaTeX math rendering
          if (id.includes('/katex')) return 'katex'

          // Mermaid diagram engine
          if (id.includes('/mermaid') || id.includes('@mermaid-js')) return 'mermaid'
          if (id.includes('/dagre') || id.includes('/dagre-d3')) return 'mermaid-vendor'
          if (id.includes('/khroma')) return 'mermaid-vendor'
          if (id.includes('/non-layered-tidy')) return 'mermaid-vendor'

          // Lodash utilities
          if (id.includes('/lodash')) return 'lodash'

          // Markdown rendering pipeline
          if (id.includes('/marked') || id.includes('/markdown-it')) return 'markdown'
          if (id.includes('/react-markdown') || id.includes('/remark')) return 'markdown'
          if (id.includes('/rehype')) return 'markdown'
          if (id.includes('/unified') || id.includes('/unist')) return 'markdown'
          if (id.includes('/bail') || id.includes('/trough')) return 'markdown'
          if (id.includes('/is-plain-obj') || id.includes('/debounce')) return 'markdown'

          // Code editing: CodeMirror packages
          if (id.includes('/codemirror') || id.includes('@codemirror')) return 'codemirror'
          if (id.includes('/@lezer') || id.includes('/lezer-')) return 'codemirror'
          if (id.includes('/crelt') || id.includes('/style-mod')) return 'codemirror'
          if (id.includes('/w3c-keynames')) return 'codemirror'

          // Syntax highlighting: react-syntax-highlighter + prismjs
          if (id.includes('/react-syntax-highlighter') || id.includes('/prismjs')) return 'syntax-highlighter'
          if (id.includes('/refractor')) return 'syntax-highlighter'
          if (id.includes('/prism-')) return 'syntax-highlighter'

          // Icons: lucide-react is huge — keep it separate
          if (id.includes('/lucide-react') || id.includes('/lucide-static')) return 'icons'

          // Creative coding: p5.js is large — keep it separate
          if (id.includes('/p5')) return 'p5'

          // ── Fallback: auto-group remaining packages ──

          const pkg = extractPackageName(id)
          if (!pkg) return

          // React ecosystem → react-vendor
          if (['react', 'react-dom', 'react-router', 'scheduler', 'zustand', 'use-sync-external-store'].includes(pkg)) {
            return 'react-vendor'
          }

          // Radix UI → radix-vendor
          if (pkg.startsWith('@radix-ui/') || pkg.startsWith('radix-ui')) {
            return 'radix-vendor'
          }

          // Tanstack → tanstack-vendor
          if (pkg.startsWith('@tanstack/')) {
            return 'tanstack-vendor'
          }

          // Group other packages by name — rollup will merge small ones
          // Avoid creating too many tiny chunks: only group known large ones
          const largeUngrouped = ['clsx', 'tailwind-merge', 'class-variance-authority', 'react-resizable-panels']
          if (largeUngrouped.includes(pkg)) {
            return 'react-vendor'
          }

          // All other node_modules → react-vendor (keeps chunks manageable)
          return 'react-vendor'
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