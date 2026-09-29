/**
 * 서버·수집기 테스트 설정.
 * - `npm test`: DB가 필요 없는 단위 테스트만 호스트에서 돌린다.
 * - `npm run test:db`: 컨테이너 안에서 `RUN_DB_TESTS=1`로 DB 통합 테스트(`*.db.test.ts`)까지 돌린다.
 */
import { configDefaults, defineConfig } from 'vitest/config';

const runDatabaseTests = Boolean(process.env.RUN_DB_TESTS);
// Jenkins가 테스트 결과 그래프를 그리도록 JUnit XML을 남긴다. 설정하지 않으면 콘솔 출력만 한다.
const junitDirectory = process.env.JUNIT_OUTPUT_DIR;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...(runDatabaseTests ? [] : ['**/*.db.test.ts'])],
    globalSetup: runDatabaseTests ? ['src/test-support/prepare-test-database.ts'] : [],
    // DB 통합 테스트는 같은 테스트 DB를 비우고 채우므로 파일을 하나씩 돌린다.
    fileParallelism: !runDatabaseTests,
    reporters: junitDirectory ? ['default', 'junit'] : ['default'],
    outputFile: junitDirectory ? { junit: `${junitDirectory}/backend.xml` } : undefined,
  },
});
