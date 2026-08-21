import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 노드 환경에서 도는 순수 로직만 다룬다. DOM도 DB도 필요 없다.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
});
