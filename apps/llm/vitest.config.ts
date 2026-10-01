/** Entry 대화 서비스 테스트 설정. 실제 엔진(CLI)은 부르지 않는 단위 테스트만 둔다. */
import { defineConfig } from 'vitest/config';

const junitDirectory = process.env.JUNIT_OUTPUT_DIR;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    reporters: junitDirectory ? ['default', 'junit'] : ['default'],
    outputFile: junitDirectory ? { junit: `${junitDirectory}/llm.xml` } : undefined,
  },
});
