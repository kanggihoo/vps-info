/**
 * 테스트 설정.
 * - `npm test`: DB가 필요 없는 단위 테스트만 호스트에서 돌린다.
 * - `npm run test:db`: 컨테이너 안에서 `RUN_DB_TESTS=1`로 DB 통합 테스트(`*.db.test.ts`)까지 돌린다.
 */
import { configDefaults, defineConfig } from 'vitest/config';
import { WEB_SOURCE_ALIAS } from './vite.config.ts';

const runDatabaseTests = Boolean(process.env.RUN_DB_TESTS);

export default defineConfig({
  resolve: { alias: WEB_SOURCE_ALIAS },
  test: {
    include: ['src/**/*.test.ts', 'web/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...(runDatabaseTests ? [] : ['**/*.db.test.ts'])],
    globalSetup: runDatabaseTests ? ['src/test-support/prepare-test-database.ts'] : [],
    // DB 통합 테스트는 같은 테스트 DB를 비우고 채우므로 파일을 하나씩 돌린다.
    fileParallelism: !runDatabaseTests,
  },
});
