/**
 * `drizzle/`의 마이그레이션을 DB에 적용하고 종료한다.
 * Compose의 일회성 `migrate` 서비스가 실행하며, 성공해야 app과 collector가 뜬다.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connectionPool, database } from './database-client.ts';

await migrate(database, { migrationsFolder: './drizzle' });
await connectionPool.end();
console.log('마이그레이션 적용 완료');
