/**
 * DB 통합 테스트 전에 한 번 실행된다(Vitest globalSetup).
 * `POSTGRES_DB` 이름의 테스트 DB가 없으면 만들고, 마이그레이션을 적용한다.
 * 운영·개발 DB와 섞이지 않도록 이름이 `_test`로 끝나지 않으면 멈춘다.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { MIGRATIONS_DIRECTORY } from '../db/migrations-directory.ts';

export default async function prepareTestDatabase(): Promise<void> {
  const testDatabaseName = process.env.POSTGRES_DB ?? '';
  if (!testDatabaseName.endsWith('_test')) {
    throw new Error(`테스트 DB 이름은 _test로 끝나야 합니다: "${testDatabaseName}"`);
  }
  const connection = {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  };

  // CREATE DATABASE는 다른 DB에 붙어서 해야 하므로 기본 DB인 postgres에 접속한다.
  const adminClient = new pg.Client({ ...connection, database: 'postgres' });
  await adminClient.connect();
  const existing = await adminClient.query('select 1 from pg_database where datname = $1', [testDatabaseName]);
  if (existing.rowCount === 0) await adminClient.query(`create database "${testDatabaseName}"`);
  await adminClient.end();

  const testPool = new pg.Pool({ ...connection, database: testDatabaseName });
  await migrate(drizzle(testPool), { migrationsFolder: MIGRATIONS_DIRECTORY });
  await testPool.end();
}
