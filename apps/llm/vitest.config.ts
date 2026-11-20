/** Entry 대화 서비스 테스트 설정. 실제 엔진(CLI)은 부르지 않는 단위 테스트만 둔다. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/test-support/**'],
    },
    include: ['src/**/*.test.ts'],
  },
});
