import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/api/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/src/**/*.js'],
      exclude: ['server/src/index.js', 'server/src/migrate-*.js', 'server/src/seed*.js'],
    },
  },
});
