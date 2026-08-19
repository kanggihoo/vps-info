"""데이터 스키마 및 공통 타입 정의 모듈."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]


@dataclass
class NewsItem:
    """수집된 뉴스 및 피드 아이템의 표준 데이터 스키마.

    Attributes:
        source: 데이터 출처 채널 식별자 (예: 'hackernews', 'geeknews').
        source_method: 수집 방식 ('official_api', 'official_rss', 'unofficial_rss').
        title: 뉴스/게시글 제목.
        url: 뉴스/게시글 원본 링크 URL.
        external_id: 원본 서비스의 고유 ID (선택 사항).
        author: 작성자 이름/계정 (선택 사항).
        published_at: 발행 일시 (UTC).
        score: 추천수/점수 (선택 사항).
        comments_count: 댓글 수 (선택 사항).
        tags: 관련 태그 목록.
        raw: 원본 서비스에서 수신한 원시 데이터 딕셔너리.
        feed: 세부 피드 분류 (예: 'best', 'show').
    """

    source: str
    source_method: SourceMethod
    title: str
    url: str
    external_id: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    tags: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    feed: str | None = None

    def __post_init__(self) -> None:
        """필드 데이터 유효성을 검증하고 문자열 공백을 정리합니다.

        Raises:
            ValueError: 필수 필드가 비어있거나 올바른 http(s) URL이 아닌 경우.
        """
        self.source = self.source.strip()
        self.title = self.title.strip()
        self.url = self.url.strip()
        if not self.source or not self.title:
            raise ValueError("must not be empty")
        parsed = urlparse(self.url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be an http(s) URL")
