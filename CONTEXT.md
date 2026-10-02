# Trendboda

Trendboda는 여러 외부 정보원에서 링크와 메타데이터를 주기적으로 수집해 보관하고,
정보원별로 새 글과 순위 변동을 읽을 수 있게 하는 컨텍스트다.

## Language

**Feed**:
한 정보원에서 주기적으로 수집하는 항목 목록 하나. 수집의 단위이자 화면에서 사용자가 고르는 대상이다.
한 사이트가 여러 Feed를 가질 수 있다(Hacker News의 best와 show, Trendshift의 기간·언어별 순위, YouTube 관심 채널 각각).
주제로 분류하지 않는다. 종류는 Stream Feed와 Ranked Feed 둘뿐이다.
RSS 제공 여부와 무관하다 — 어떻게 가져오는지는 Feed의 성질이 아니다.
_Avoid_: Source, Channel, Provider, Subscription

**Feed Group**:
한 정보원이 주는 여러 목록의 Feed를 화면에서 한 줄로 묶은 것. 각 Feed는 기간·언어·구역 같은 축 위의 한 점이다
(Trendshift의 주간·Python 목록, Hacker News의 Best와 Show).
묶는 것은 보여 주는 방식뿐이다. 수집, Rank Snapshot, Read Cursor는 여전히 Feed마다 따로다.
묶인 Feed는 종류가 모두 같고, 정보원이 다르면 주제가 같아도 묶지 않는다. 목록이 하나뿐인 정보원은 Group 없이 Feed 하나다.
_Avoid_: Site, Source, Category

**Feed Navigation Order**:
화면에서 개별 Feed와 Feed Group의 줄을 배치하는 순서. Stream과 Ranked 각 구역 안에서 정하며, Feed Group은 한 줄로 움직이고 모든 기기에서 같은 순서를 쓴다.
_Avoid_: Rank, Feed Rank, Sidebar Order

**Stream Feed**:
새 Entry가 나타난 순서대로 쌓아 읽는 Feed. RSS처럼 새 글이 계속 올라오는 정보원이 여기에 해당한다.
_Avoid_: Timeline, Chronological Feed

**Ranked Feed**:
정보원이 매기는 순위표를 읽는 Feed. 수집할 때마다 순위를 남기고, 직전 수집과 비교한 순위 변동으로 본다.
Feed의 종류는 Feed를 선언할 때 정하며, 어떤 Handler를 쓰는지와 무관하다.
_Avoid_: Leaderboard, Chart, Top List

**Rank**:
Ranked Feed에서 정보원이 준 목록 안의 위치. 점수 같은 값으로 다시 계산하지 않는다.
_Avoid_: Position, Order, Score

**Rank Snapshot**:
Ranked Feed를 한 번 수집해 성공했을 때 본 순위표. Entry마다 Rank와 그 시점의 수치(점수, 댓글 수 등)를 담는다.
순위가 직전과 같아도 성공할 때마다 하나씩 생긴다. 순위 변동은 직전 Rank Snapshot과 비교한 결과다.
직전에 없던 Entry 중 이번에 처음 발견한 것은 NEW, 예전에 발견한 것은 재진입이다. 직전에 있다가 없어진 Entry는 빠짐이다.
_Avoid_: Ranking, Standing, Leaderboard

**Entry**:
Feed에서 발견된 항목 하나. 링크와 메타데이터를 보관하며 원문 본문 자체를 의미하지 않는다.
화면에서 원문 페이지의 본문을 그때그때 가져와 보여 줄 수 있지만, 그 본문은 저장하지 않으며 Entry의 일부가 아니다.
제목·요약의 한국어 번역은 Entry에 딸려 저장한다.
같은 내용이라도 Feed가 다르면 별도의 Entry다.
_Avoid_: Archive Item, Article, Post, News, Content

**Handler**:
한 종류의 Feed를 수집하는 방법. 정보원에서 가져온 것을 Entry 목록으로 돌려주는 데까지가
책임이며, 재시도·타임아웃·중복 판정·저장은 Handler의 일이 아니다.
하나의 Handler가 파라미터만 다른 여러 Feed에 쓰인다.
_Avoid_: Collector, Adapter, Parser, Scraper

**Dedup Key**:
두 Entry가 같은 것인지 판정하는 기준값. 정보원이 고유 식별자를 주면 그 값이고
(Hacker News item id, YouTube video id, 모델 id 등), 주지 않으면 정규화한 URL에서 유도한다.
판정 범위는 같은 Feed 안으로 한정된다. 따라서 같은 글이 두 Feed에 올라오면 Entry는 두 개다.
_Avoid_: GUID, Hash, Unique Key

**First Seen**:
Entry를 처음 수집한 시각. Stream Feed에서 Entry의 정렬 축이자 Read Cursor의 기준 축이다.
정보원이 주는 게시 시각은 표시용 메타데이터일 뿐 순서를 정하지 않는다.
오래전에 게시된 글이 오늘 Feed에 새로 나타나면 그 글은 오늘의 새 Entry다.
예외로, Feed가 게시일 하한을 선언했다면 그보다 먼저 게시된 항목은 Entry가 되지 않는다(과거 글 전체를 한꺼번에 주는 정보원용).
_Avoid_: Created At, Collected At

**Read Cursor**:
Stream Feed마다 "여기까지 훑었다"를 나타내는 지점. 이보다 새로운 Entry가 안 읽음이다.
최신 쪽으로만 이동하며, 제목만 보고 넘긴 Entry도 지나간 이상 훑은 것으로 친다.
Entry가 지나갔다는 것은 스크롤되어 화면 위쪽 밖으로 나갔다는 뜻이다. 화면에 보이기만 한 Entry는 아직 지나가지 않았다.
연 Entry(Opened At이 있는 Entry)가 있으면 그 Entry와 그보다 오래된 Entry도 지나간 것으로 친다 — 아래 Entry를 열었다면 위 Entry는 이미 훑었다.
Ranked Feed에는 없다 — 순위표에서는 새로 들어온 Entry가 어느 자리에 나타날지 정해져 있지 않다.
_Avoid_: Read Flag, Last Read, Watermark

**Opened At**:
Entry를 처음 열어본 시각. 앱에서 Entry를 골라 펼치거나 원문 링크를 열면 찍힌다.
Read Cursor가 지나갔을 뿐인 Entry와 실제로 읽은 Entry를 가르는 유일한 기준이다.
_Avoid_: Read At, Visited

**Bookmark**:
나중에 다시 보려고 명시적으로 표시한 Entry. Read Cursor·Opened At과 달리
사용자가 직접 남기는 유일한 읽기 상태다.
새 Entry는 Feed별로만 읽지만, Bookmark는 여러 Feed의 것을 한곳에 모아 본다.
_Avoid_: Favorite, Star, Saved

**Fetch Attempt**:
한 Feed를 한 번 수집하려 한 시도. 성공한 시도와 실패한 시도를 모두 포함하며,
언제 시도했고 어떤 결과였는지를 남긴다. 그 시도로 저장된 Entry 자체를 의미하지 않는다.
실패 뒤의 재시도도 각각 별개의 Fetch Attempt다.
_Avoid_: Job Run, Batch Run, Collection Log, Fetch Result
