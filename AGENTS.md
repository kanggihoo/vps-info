# Project Instructions

코드를 작성하거나 변경하기 전에 다음 문서를 확인한다.

- [CONTEXT.md](./CONTEXT.md): 프로젝트의 도메인 용어를 따른다.
- [docs/adr/](./docs/adr/): 관련 아키텍처 결정을 따른다.
- [TypeScript conventions](./docs/conventions/typescript.md): 코드를 작성하거나 리팩터링할 때 따른다.
- [ADR template](./docs/adr/TEMPLATE.md): ADR을 새로 작성할 때 이 형식을 따른다.
- [Decisions later](./docs/adr/decisions-later.md): 아직 결정하지 않은 항목을 확인한다.
- [Handoff](./docs/handoff.md): 지금 진행 상황, 정해야 할 것, 남은 작업을 확인한다.
- [등록된 Feed](./docs/feeds.md): 지금 수집하는 Feed 목록. Feed 선언을 바꾸면 이 문서도 고친다.
- [새 Feed 추가하기](./docs/guides/adding-a-feed.md): Feed나 Handler를 추가·수정할 때 이 절차를 따른다.

사용자가 반복 적용 가능한 코드 구조나 스타일 변경을 요청하면 코드와 convention 문서를 함께 갱신한다. 특정 기능에만 해당하는 일회성 지시는 convention으로 기록하지 않는다.

변경으로 도메인 용어나 아키텍처 결정이 달라지면 `CONTEXT.md` 또는 관련 ADR도 함께 갱신한다.
