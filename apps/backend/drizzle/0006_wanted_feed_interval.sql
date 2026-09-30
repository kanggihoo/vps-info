-- 원티드 직무군 Feed의 수집 주기를 6시간에서 12시간으로 늘린다. 채용 공고는 천천히 올라오고, Handler가 매번 열린 공고 전체를 받아 주기를 늘려도 놓치는 공고가 없다.
-- 이전 값(360분)일 때만 바꿔서, 운영 중에 따로 바꾼 값은 덮어쓰지 않는다(ADR-0004).
-- 새 DB에서는 Feed 행이 아직 없어 0건이 바뀌고, 수집기가 선언 값(720분)으로 넣는다.
UPDATE "feed" SET "interval_minutes" = 720
WHERE "id" IN ('wanted-backend', 'wanted-web', 'wanted-ai-data', 'wanted-infra', 'wanted-qa-manager', 'wanted-app')
  AND "interval_minutes" = 360;
