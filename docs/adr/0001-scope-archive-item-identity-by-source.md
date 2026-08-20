# Archive Item의 식별 범위를 Source로 제한한다

같은 URL이라도 서로 다른 Source에서 관찰되면 별도의 Archive Item으로 저장한다. Source마다 외부 ID, 점수, 댓글 수, 순위와 발견 시점이 다르므로 원문 URL만으로 합치지 않으며, 같은 Source 안에서는 외부 ID를 우선하고 없으면 정규화된 URL을 사용해 중복 행을 방지한다. 진짜 원문 콘텐츠 단위의 통합이 필요해지면 Content와 Source별 관찰 모델을 별도로 도입한다.
