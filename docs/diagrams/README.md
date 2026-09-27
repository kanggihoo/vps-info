# 다이어그램

[archify](https://github.com/tt-a1i/archify)로 만든 다이어그램이다. `.json`이 원본이고 `.html`은 그 결과물이다.
구조가 바뀌면 `.json`을 고친 뒤 다시 만든다. HTML을 직접 고치지 않는다.

| 다이어그램 | 보여 주는 것 |
|---|---|
| [system-architecture.html](./system-architecture.html) | 구성요소와 연결: 정보원 → collector → PostgreSQL ← app ← nginx ← 브라우저 |
| [feed-collection-lifecycle.html](./feed-collection-lifecycle.html) | Feed 하나의 수집 주기: 대기 → running → 판정 → success/failed → 재시도 (ADR-0004, ADR-0005) |
| [fetch-attempt-sequence.html](./fetch-attempt-sequence.html) | Fetch Attempt 1회의 호출 순서: 루프 → Fetch Attempt → Handler → HTTP 클라이언트 → 정보원, 그리고 DB 저장 (ADR-0006) |

## 다시 만들기

archify 스킬 디렉터리에서 실행한다. 종류는 `architecture`, `lifecycle`, `sequence` 중 하나다.

```bash
node bin/archify.mjs validate <종류> <원본.json> --quality showcase --json
node bin/archify.mjs deliver <종류> <원본.json> <결과.html> --quality showcase --json
```
