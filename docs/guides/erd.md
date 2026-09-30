# DB 스키마 ERD

`https://erd.kkh-hub.tech/vps-info/`에서 볼 수 있다(공용 Basic Auth). 인프라 쪽 결정은 vps-infra의 ADR 0013을 본다.

## 만들어지는 과정

Jenkinsfile의 `ERD` stage가 `Deploy` 뒤에서 실행된다.

1. 배포된 DB에서 `pg_dump --schema-only`로 스키마를 뽑는다(`drizzle` 기록 스키마는 뺀다).
2. Liam ERD CLI(`--format postgres`)로 정적 파일을 만든다.
3. nginx가 서빙하는 볼륨 `vps_erd_site`의 `/vps-info/`를 교체한다. nginx reload는 필요 없다.

`apps/backend/drizzle/**`가 바뀐 빌드에서만 실행된다. 수동 빌드(Build Now)는 항상 실행하므로,
처음 채우거나 ERD stage가 실패한 뒤 다시 만들 때 쓴다. ERD가 실패해도 배포는 성공으로 남고 그 stage만 실패로 표시된다.

## 테이블·컬럼 설명

설명은 DB의 `COMMENT`로 남기고, ERD에는 그 값이 표시된다. `schema.ts`의 JSDoc은 ERD에 나오지 않는다.

- 테이블이나 컬럼을 추가하는 마이그레이션에는 `COMMENT ON` 문도 함께 넣는다.
- `npm run db:generate`가 만든 SQL 끝에 `--> statement-breakpoint`로 구분해 덧붙이면 된다.
- 설명만 따로 바꿀 때는 `npx drizzle-kit generate --custom --name=<이름>`으로 빈 마이그레이션을 만들어 채운다(`0007_table_comments.sql` 참고).
