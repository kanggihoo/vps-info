# Collector를 one-shot Batch Run으로 실행한다

Collector는 선택된 Job을 한 차례 수행하고 종료하며 스케줄링은 외부 실행기가 담당한다. 동시에 겹치는 Batch Run은 PostgreSQL advisory lock으로 막고, Archive Item의 중복 행은 별도로 `UNIQUE(source, dedup_key)`와 UPSERT가 방지한다. 각 Job의 실패는 다른 Job과 격리하며, 일부만 성공한 Batch Run은 `PARTIAL`로 기록하고 성공한 Job의 Archive Item은 유지한다.
