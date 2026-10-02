/**
 * Entry를 복사할 때 만드는 Markdown. 맨 위에 Obsidian 같은 노트 앱이 속성으로 읽는 YAML frontmatter를 붙인다.
 */

type ClipboardEntry = {
  title: string;
  url: string;
  feedTitle: string;
  author: string | null;
  publishedAt: string | null;
  /** 원문 읽기 결과의 마감일. 채용 공고에서만 있다. */
  deadline?: string;
  /** 번역 표시 중이면 번역 전 제목. */
  originalTitle?: string;
  /** 본문 Markdown(원문 읽기 결과) 또는 요약. */
  body: string | null;
  /** 복사한 시각. */
  clippedAt: Date;
};

/** 값이 YAML에서 깨지지 않게 큰따옴표 문자열로 쓴다. JSON 문자열은 YAML 큰따옴표 문자열과 같다. */
const yamlString = (value: string) => JSON.stringify(value);

/** 날짜는 `YYYY-MM-DD`로 줄인다. */
const datePart = (iso: string) => iso.slice(0, 10);

export function buildClipboardMarkdown(entry: ClipboardEntry): string {
  const properties: [string, string | undefined][] = [
    ['title', yamlString(entry.title)],
    ['original_title', entry.originalTitle && yamlString(entry.originalTitle)],
    ['source', yamlString(entry.url)],
    ['feed', yamlString(entry.feedTitle)],
    ['author', entry.author ? yamlString(entry.author) : undefined],
    ['published', entry.publishedAt ? datePart(entry.publishedAt) : undefined],
    ['deadline', entry.deadline],
    ['clipped', datePart(entry.clippedAt.toISOString())],
  ];
  const frontmatter = properties.flatMap(([key, value]) => (value === undefined ? [] : [`${key}: ${value}`]));
  return ['---', ...frontmatter, '---', '', entry.body ?? ''].join('\n').trimEnd() + '\n';
}
