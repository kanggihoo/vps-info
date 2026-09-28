# ADR-0009: Ranked Feed는 Entry를 Stream Feed와 함께 쓰고, 순위는 Rank Snapshot으로 따로 쌓는다

- 상태: 수용
- 결정일: 2026-09-28
- 관련: ADR-0002, ADR-0004, ADR-0006

## 배경

Hacker News Best, GitHub Trending처럼 정보원이 순위표를 주는 Feed가 있다. 이런 Feed는 새 글이 쌓이는 것보다
순위가 바뀌는 것이 정보다. 그런데 지금 구조는 모든 Feed를 시간순 목록으로만 다룬다.

- 수집은 처음 본 항목만 저장하고 이미 있는 Entry는 건드리지 않는다(`apps/backend/src/collector/fetch-attempt.ts:60`의 `onConflictDoNothing`).
  그래서 몇 위였는지, 점수가 어떻게 변했는지는 버려진다.
- 점수는 `entry.extra`에 들어가는데(`hackernews-handler.ts:40`), 처음 본 순간의 값에서 멈춘다.
- Read Cursor(`db/schema.ts:24`)는 First Seen 순서를 기준으로 한다. 순위표에서는 새로 들어온 글이 어느 자리에 나타날지 정해져 있지 않아서,
  "Cursor 뒤가 새 글"이라는 규칙이 맞지 않는다.
- 가져올 개수가 Handler 안의 상수여서(`hackernews-handler.ts:10`의 `TOP_STORY_COUNT = 30`) Feed마다 다르게 정할 수 없고, 바꾸려면 배포해야 한다.

## 결정

1. **Feed 종류**: Feed는 Stream Feed와 Ranked Feed 둘로 나눈다. 종류는 Feed 선언(`kind: 'ranked'`, 생략하면 Stream)에서 정하며 Handler가 정하지 않는다.
2. **Rank**: 정보원이 준 목록 안의 위치다. Handler가 돌려준 배열의 순서가 곧 Rank이며, 점수로 다시 정렬하지 않는다.
3. **저장**: Entry는 두 종류가 함께 쓴다. Ranked Feed는 성공한 Fetch Attempt마다 `rank_snapshot`에 Rank마다 한 행
   (`fetch_attempt_id`, `entry_id`, `rank`, `metrics`)을 쌓는다. 순위가 직전과 같아도 저장한다.
4. **변하는 값과 변하지 않는 값**: `EntryDraft`에 `metrics`(점수, 댓글 수, 오늘 스타 수 등)를 둔다. Handler가 무엇이 변하는 값인지 나눠서 돌려준다.
   `extra`는 변하지 않는 값과 처음 봤을 때의 값만 담는다. Stream Feed는 `metrics`를 저장하지 않는다.
5. **비교 기준**: 순위 변동은 직전에 성공한 Rank Snapshot과 비교한다. 직전에 없던 Entry 중 이번에 처음 발견한 것은 NEW,
   예전에 발견한 것은 재진입이다. 직전에 있다가 없어진 Entry는 빠짐이다. 첫 Snapshot은 비교할 대상이 없으므로 NEW만 표시한다.
6. **읽기 상태**: Ranked Feed에는 Read Cursor가 없다. Opened At과 Bookmark는 Entry에 붙으므로 두 종류가 똑같이 쓴다.
   Feed 목록에는 안 읽음 수 대신 최신 Snapshot의 NEW 수를 다른 모양으로 보여 준다. 이 수는 열어 봐도 줄지 않는다.
7. **개수(`rank_limit`)**: Ranked Feed가 가져올 개수는 수집 주기와 같은 운영 값이다. 선언의 `rankLimit`은 처음 한 번만 DB `feed.rank_limit`에 넣고,
   이후에는 DB가 원본이다(ADR-0004 결정 3에 항목이 하나 는다). 코어는 `rankLimit`을 Handler context로 넘기고, 돌려받은 목록을 앞에서부터 그 개수로 자른다.
   개수가 고정된 정보원의 Handler는 이 값을 무시해도 된다.
8. **화면**: Ranked Feed는 최신 Rank Snapshot 하나를 순위순으로 보여 준다. 수집한 개수를 모두 보여 주고, 변동·NEW·재진입과 최신 `metrics`를 표시하며,
   빠진 Entry는 아래에 접어 둔다. 지난 Snapshot은 고를 수 없다.

## 검토한 대안들

### Ranked Feed용 항목 테이블을 따로 둔다 (`ranked_item`)

- 장점: 두 종류가 각자의 구조를 가져서 테이블마다 규칙이 단순하다.
- 단점: Bookmark 모아 보기가 두 테이블을 합쳐야 하고, Opened At·Dedup Key 처리가 두 벌이 된다. Handler가 결과를 두 모양으로 돌려줘야 한다.
- 기각 사유: 두 종류가 실제로 다른 것은 읽는 방식과 순위 기록 유무뿐이다. 글 하나는 어느 쪽에서든 같은 Entry다.

### 순위와 점수를 `entry.extra`에 덮어쓴다

- 장점: 테이블을 추가하지 않는다.
- 단점: Entry 하나에 값이 하나만 남아서 직전과 비교할 수 없다.
- 기각 사유: 변동을 보려면 수집마다의 기록이 필요하다.

### 모든 Feed가 Rank Snapshot을 쌓는다

- 장점: Feed 종류를 나눌 필요가 없다.
- 단점: RSS 목록의 위치는 순위가 아니어서 의미 없는 기록만 쌓인다.
- 기각 사유: 순위를 가진 정보원은 일부뿐이다.

### 직전과 순위가 같으면 Snapshot을 저장하지 않는다

- 장점: 저장량이 준다.
- 단점: 순위는 그대로이고 점수만 바뀐 경우를 놓친다. 비교 기준이 "직전 수집"에서 "직전에 순위가 바뀐 수집"으로 달라진다.
- 기각 사유: Feed 하나에 하루 수백 행 수준이라 아낄 이유가 없다. 정보원이 실제로 얼마나 자주 바뀌는지 재는 데에도 모든 기록이 필요하다.

### 비교 기준을 "마지막으로 본 때"나 "24시간 전"으로 둔다

- 장점: 변동의 의미가 사용자 기준이거나 수집 주기와 무관하게 일정하다.
- 단점: "마지막으로 본 때"는 Feed마다 읽기 상태가 하나 더 필요하다. "24시간 전"은 가장 가까운 Snapshot을 찾는 조회가 필요하다.
- 기각 사유: 직전 수집과 비교하는 것이 가장 단순하다. 변동의 폭은 수집 주기로 조정한다.

### 가져올 개수를 코드(Handler 파라미터)나 환경변수에 둔다

- 장점: 코드에 두면 원본이 한 곳이고 Handler 계약(ADR-0006)이 그대로다.
- 단점: 코드는 바꿀 때마다 배포해야 한다. 환경변수는 Feed마다 변수가 늘고, 값을 바꾸면 재시작해야 한다.
- 기각 사유: 개수는 쌓인 Snapshot을 보면서 조정하는 값이라 수집 주기와 같은 취급이 맞다.

## 이유

변동을 보려면 수집할 때마다의 순위가 남아 있어야 하고, 그 기록은 "글"과 성격이 다르다. 글은 한 번 발견되면 그대로지만, 순위와 점수는 수집마다 새 값이 생긴다.
그래서 글은 기존 Entry로 두고, 순위만 Snapshot으로 분리했다. 이렇게 하면 Dedup Key, Opened At, Bookmark를 비롯한 기존 규칙이 Ranked Feed에서도 그대로 동작한다.
대신 화면과 API는 Feed 종류에 따라 두 갈래가 되고, Read Cursor가 Stream Feed에만 해당하는 개념이 된다.

## 결과

- `rank_snapshot`은 Ranked Feed 하나에 하루 `rank_limit × 수집 횟수` 행씩 늘어난다(100개, 6시간 주기면 400행).
- `rank_limit`을 늘리면 다음 Snapshot에서 늘어난 순위만큼 NEW가 한꺼번에 뜨고, 줄이면 그만큼 빠짐이 뜬다. 드문 일이라 따로 처리하지 않는다.
- 변동 표시의 시간 폭은 수집 주기에 따라 달라진다. 주기를 바꾸면 "▲3"의 의미도 바뀐다.
- 기존 Feed를 Ranked로 바꾸면 그 Feed의 Read Cursor는 더 이상 쓰이지 않는다. 기존 Entry는 남고, 첫 Snapshot부터 순위표로 보인다.
- 수집 주기와 마찬가지로, 선언의 `rankLimit`을 바꿔도 이미 있는 Feed에는 반영되지 않는다. 기존 Feed의 개수는 DB에서 바꾼다.
