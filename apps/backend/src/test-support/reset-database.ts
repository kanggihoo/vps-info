/** DB 통합 테스트용 도구. 테스트마다 빈 DB에서 시작하도록 모든 테이블을 비운다. */
import { sql } from 'drizzle-orm';
import { database } from '../db/database-client.ts';

/** 모든 테이블을 비우고 id 번호도 1부터 다시 시작하게 한다. */
export async function resetDatabase(): Promise<void> {
  await database.execute(sql`truncate table fetch_attempt, entry, feed restart identity cascade`);
}
