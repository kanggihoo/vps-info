# Python Conventions

- Python 3.12 이상을 기준으로 작성하고 타입 힌트를 사용한다.
- 외부 입력과 API 경계는 Pydantic 모델로 검증한다.
- 데이터베이스 스키마 변경은 Alembic migration으로 관리한다.
- 공개 모듈·클래스·함수와 설명이 필요한 복잡한 로직에는 Google 스타일 docstring을 작성한다. 코드만으로 명확한 단순 함수에는 형식적인 docstring을 추가하지 않는다.
- docstring과 주석 본문은 한글로 작성한다. `Args:`, `Returns:`, `Raises:`, `Yields:` 같은 Google 스타일 섹션 이름과 식별자·타입은 영문 그대로 둔다.
- 테스트는 pytest로 작성하며 기본 테스트는 실제 외부 네트워크에 의존하지 않는다.
- 변경 후 `uv run pytest -q`로 검증한다.
