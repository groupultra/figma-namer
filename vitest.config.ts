import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/ui/index.tsx', 'src/**/index.ts'],
    },
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@plugin': path.resolve(__dirname, 'src/plugin'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@vlm': path.resolve(__dirname, 'src/vlm'),
    },
  },
});
