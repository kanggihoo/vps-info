-- Ranked Feed로 바뀐 HN의 수집 주기를 6시간으로 바꾼다(ADR-0009).
-- 이전 기본값(60분)일 때만 바꿔서, 운영 중에 따로 바꾼 값은 덮어쓰지 않는다(ADR-0004).
-- 새 DB에서는 Feed 행이 아직 없어 0건이 바뀌고, 수집기가 선언 값(360분)으로 넣는다.
UPDATE "feed" SET "interval_minutes" = 360
WHERE "id" IN ('hn-best', 'hn-show') AND "interval_minutes" = 60;
