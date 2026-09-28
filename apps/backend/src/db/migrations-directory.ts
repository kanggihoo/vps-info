/** 마이그레이션 SQL 위치(`apps/backend/drizzle`). 실행 위치(cwd)와 관계없이 이 파일 기준으로 찾는다. */
import { resolve } from 'node:path';

export const MIGRATIONS_DIRECTORY = resolve(import.meta.dirname, '../../drizzle');
