import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Per-test environment override: add @vitest/environment comment
    // or use // @vitest-environment jsdom in individual test files
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})