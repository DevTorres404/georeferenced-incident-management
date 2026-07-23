import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['app/js/**'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.min.js'
      ],
      reportsDirectory: 'coverage'
    },
    server: {
      deps: {
        inline: [/\.js\?v=\d+$/]
      }
    }
  },
  plugins: [
    {
      name: 'resolve-v-cache-buster',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer) {
          return null
        }

        const match = source.match(/^(\..*?)\.js\?v=\d+$/)
        if (match) {
          const cleanPath = `${match[1]}.js`
          const resolved = path.resolve(path.dirname(importer), cleanPath)
          return { id: resolved }
        }

        return null
      }
    }
  ]
})
