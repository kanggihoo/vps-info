/** PostgreSQL 연결. 접속 정보는 `POSTGRES_*` 환경변수에서 읽는다. */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

/**
 * 환경변수 값을 읽는다. 값이 없으면 시작 단계에서 바로 멈추도록 예외를 던진다.
 *
 * @param name - 환경변수 이름
 */
function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}가 비어 있습니다`);
  return value;
}

/** 프로세스 전체가 함께 쓰는 커넥션 풀. 종료할 때 `connectionPool.end()`로 닫는다. */
export const connectionPool = new pg.Pool({
  host: readRequiredEnv('POSTGRES_HOST'),
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: readRequiredEnv('POSTGRES_DB'),
  user: readRequiredEnv('POSTGRES_USER'),
  password: readRequiredEnv('POSTGRES_PASSWORD'),
});

/** 스키마를 알고 있는 Drizzle 인스턴스. */
export const database = drizzle(connectionPool, { schema });
