/** 화면 쪽 단위 테스트 설정. `src/`(브라우저 코드)와 `scripts/`(토큰 생성·컴포넌트 추가)를 함께 돌린다. */
import { defineConfig } from 'vitest/config';
import { WEB_ALIASES } from './vite.config.ts';

// Jenkins가 테스트 결과 그래프를 그리도록 JUnit XML을 남긴다. 설정하지 않으면 콘솔 출력만 한다.
const junitDirectory = process.env.JUNIT_OUTPUT_DIR;

export default defineConfig({
  resolve: { alias: WEB_ALIASES },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    reporters: junitDirectory ? ['default', 'junit'] : ['default'],
    outputFile: junitDirectory ? { junit: `${junitDirectory}/web.xml` } : undefined,
  },
});
