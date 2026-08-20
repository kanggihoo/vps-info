# Project Instructions

코드를 작성하거나 변경하기 전에 다음 문서를 확인한다.

- [CONTEXT.md](./CONTEXT.md): 프로젝트의 도메인 용어를 따른다.
- [docs/adr/](./docs/adr/): 관련 아키텍처 결정을 따른다.
- [Python conventions](./docs/conventions/python.md): Python 코드를 작성하거나 리팩터링할 때 따른다.
- [TypeScript conventions](./docs/conventions/typescript.md): TypeScript 코드를 작성하거나 리팩터링할 때 따른다.
- [Synchronization backlog](./docs/synchronization-backlog.md): 알려진 코드·문서 불일치를 확인한다.

사용자가 반복 적용 가능한 코드 구조나 스타일 변경을 요청하면 코드와 해당 언어 convention 문서를 함께 갱신한다. 특정 기능에만 해당하는 일회성 지시는 convention으로 기록하지 않는다.

변경으로 도메인 용어나 아키텍처 결정이 달라지면 `CONTEXT.md` 또는 관련 ADR도 함께 갱신한다.
