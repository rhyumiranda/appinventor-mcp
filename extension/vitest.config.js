import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '..',
    include: ['__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['extension/lib/**/*.js', 'extension/host/**/*.js'],
      exclude: ['__tests__/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
