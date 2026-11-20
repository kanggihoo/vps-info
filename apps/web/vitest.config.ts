/** 화면 쪽 단위 테스트 설정. `src/`(브라우저 코드)와 `scripts/`(토큰 생성·컴포넌트 추가)를 함께 돌린다. */
import { defineConfig } from 'vitest/config';
import { WEB_ALIASES } from './vite.config.ts';

export default defineConfig({
  resolve: { alias: WEB_ALIASES },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/components/ui/**', 'src/styles/design-token-names.ts'],
    },
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['./test-setup.ts'],
    // findBy*·waitFor 대기를 5초로 늘렸으므로(test-setup.ts) 한 테스트가 대기를 여러 번 거치면 기본 5초를 넘는다.
    testTimeout: 15_000,
  },
});
