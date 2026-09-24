/** drizzle-kit 설정. `npm run db:generate`가 스키마를 읽어 `drizzle/`에 마이그레이션 SQL을 만든다. */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
