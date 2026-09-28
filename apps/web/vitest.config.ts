/** 화면 쪽 단위 테스트 설정. `src/`(브라우저 코드)와 `scripts/`(토큰 생성·컴포넌트 추가)를 함께 돌린다. */
import { defineConfig } from 'vitest/config';
import { WEB_ALIASES } from './vite.config.ts';

export default defineConfig({
  resolve: { alias: WEB_ALIASES },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
