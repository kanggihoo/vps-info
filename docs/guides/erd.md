# DB 스키마 ERD

`https://erd.kkh-hub.tech/vps-info/`에서 볼 수 있다(공용 Basic Auth). 인프라 쪽 결정은 vps-infra의 ADR 0013을 본다.

## 만들어지는 과정

배포 스크립트(`scripts/deploy.sh`)가 컨테이너를 올린 뒤 `scripts/erd.sh`를 실행한다(ADR-0020).

1. 배포된 DB에서 `pg_dump --schema-only`로 스키마를 뽑는다(`drizzle` 기록 스키마는 뺀다).
2. Liam ERD CLI(`--format postgres`)로 정적 파일을 만든다.
3. nginx가 서빙하는 볼륨 `vps_erd_site`의 `/vps-info/`를 교체한다. nginx reload는 필요 없다.

직전 배포 이후 `apps/backend/drizzle/**`가 바뀐 배포에서만 실행된다. 처음 채우거나 실패한 뒤 다시 만들 때는
Actions에서 `CI` workflow를 main으로 `erd` 옵션을 켜고 실행한다(VPS에서는 `scripts/deploy.sh <sha> erd`).
ERD가 실패해도 배포는 성공으로 남고, Actions 화면에 경고로 표시된다.

## 테이블·컬럼 설명

설명은 DB의 `COMMENT`로 남기고, ERD에는 그 값이 표시된다. `schema.ts`의 JSDoc은 ERD에 나오지 않는다.

- 테이블이나 컬럼을 추가하는 마이그레이션에는 `COMMENT ON` 문도 함께 넣는다.
- `npm run db:generate`가 만든 SQL 끝에 `--> statement-breakpoint`로 구분해 덧붙이면 된다.
- 설명만 따로 바꿀 때는 `npx drizzle-kit generate --custom --name=<이름>`으로 빈 마이그레이션을 만들어 채운다(`0007_table_comments.sql` 참고).
