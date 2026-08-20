# Signal Archive

Signal Archive는 외부 기술·뉴스 Source에서 링크와 메타데이터를 수집하고, Source별 관찰 맥락과 실행 이력을 함께 보관하는 컨텍스트다.

## Language

**Archive Item**:
특정 Source에서 발견되어 공통 형태로 정규화되고 보관되는 링크와 메타데이터의 단위. 같은 URL이어도 Source가 다르면 별도의 Archive Item이다.
_Avoid_: News, News Item, Content, Post

**Source**:
Archive Item을 발견하고 수집한 외부 서비스 또는 피드의 출처. URL이 가리키는 원문 게시자와는 구분되며, Archive Item의 중복 판단과 점수·댓글·순위의 해석 범위가 된다.
_Avoid_: Channel, Publisher, Origin

**Job**:
하나의 Source 또는 Source 내 특정 피드에서 Archive Item을 수집하고 저장하는 처리 단위. 각 Job은 실행 이력에서 구분할 수 있는 안정적인 키를 가진다.
_Avoid_: Collection Job, Channel

**Job Run**:
특정 Job이 한 번 수행된 실행 이력. 시작·종료 시각, 상태, 처리 건수와 제한된 오류 요약을 포함하며, 수집된 Archive Item 자체를 의미하지 않는다.
_Avoid_: Job Result, Archive Item, Outbox Event

**Batch Run**:
Collector가 선택된 Job들을 한 묶음으로 수행한 전체 실행 이력. 각 Job Run을 자식으로 가지며 전체 성공, 부분 성공 또는 실패 상태를 나타낸다.
_Avoid_: Collection Run, Fetch All

**Partial Batch**:
하나 이상의 Job Run이 성공하고 하나 이상의 Job Run이 실패한 Batch Run. 성공한 Job이 저장한 Archive Item은 유지된다.
_Avoid_: Partial Job, Warning
