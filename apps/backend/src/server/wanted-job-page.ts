/**
 * 원티드 공고 상세 페이지(`/wd/<id>`)를 Markdown으로 바꾼다(ADR-0013). 결과는 저장하지 않는다.
 *
 * 이 페이지는 Next.js가 서버에서 그려 보내며 공고 내용을 `__NEXT_DATA__`의 `initialData`에 함께 싣는다.
 * defuddle로 화면을 긁는 것보다 이 데이터를 읽는 편이 구조가 바뀌어도 덜 깨진다.
 */
import * as cheerio from 'cheerio';
import type { ReaderView } from '@trendboda/api-types';
import { ReaderFailure } from './original-page.ts';

/** `initialData` 중 쓰는 필드. 글 내용은 "ㆍ"로 시작하는 줄이 이어진 평문이다. */
type WantedJobDetail = {
  position?: string;
  company?: { company_name?: string };
  requirements?: string;
  main_tasks?: string;
  preferred_points?: string;
  hire_rounds?: string;
  benefits?: string;
  intro?: string;
  employment_type?: string;
  is_remote_work?: boolean;
  /** 마감일(`2026-10-31T00:00:00`). 상시 채용이면 비어 있다. */
  due_time?: string | null;
  /** 기업 자체 채용 사이트로 지원하는 공고의 지원 주소. 원티드로 지원하는 공고는 비어 있다. */
  out_link?: string | null;
};

/** 신입이 가장 먼저 보는 순서. 자격 요건 → 주요 업무 → 우대 사항 → 채용 전형 → 복지 → 회사 소개. */
const SECTIONS = [
  ['requirements', '자격 요건'],
  ['main_tasks', '주요 업무'],
  ['preferred_points', '우대 사항'],
  ['hire_rounds', '채용 전형'],
  ['benefits', '혜택 및 복지'],
  ['intro', '회사 소개'],
] as const;

const EMPLOYMENT_LABELS: Record<string, string> = { regular: '정규직', intern: '인턴', contract: '계약직' };

/** 원티드 공고 상세 페이지 주소인지. */
export function isWantedJobUrl(url: string): boolean {
  return /^https:\/\/www\.wanted\.co\.kr\/wd\/\d+/.test(url);
}

/**
 * 글 내용의 "ㆍ" 줄 목록을 Markdown 목록으로 바꾼다. 나머지 줄은 줄바꿈을 지킨 문단이 된다.
 * 줄 앞의 `#`·`>`·숫자 목록 표시는 Markdown 문법으로 읽히지 않게 막는다.
 */
function toMarkdownLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/^[ㆍ·•]/.test(line) ? `- ${line.slice(1).trim()}` : `${line.replace(/^([#>]|\d+[.)])/, '\\$1')}  `))
    .join('\n');
}

/** http(s) 주소만 링크로 쓴다. 다른 스킴(`javascript:` 등)은 버린다. */
function toHttpUrl(value: string | null | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 공고 상세 페이지 HTML에서 공고 내용을 뽑아 Markdown으로 돌려준다.
 *
 * @throws {ReaderFailure} `__NEXT_DATA__`가 없거나 공고 내용이 비었을 때(`empty`)
 */
export function readWantedJob(html: string): ReaderView {
  const nextData = cheerio.load(html)('script#__NEXT_DATA__').html();
  let job: WantedJobDetail | undefined;
  try {
    job = nextData ? (JSON.parse(nextData) as { props?: { pageProps?: { initialData?: WantedJobDetail } } }).props?.pageProps?.initialData : undefined;
  } catch {
    job = undefined;
  }
  const sections = job ? SECTIONS.filter(([key]) => job[key]?.trim()).map(([key, heading]) => `## ${heading}\n\n${toMarkdownLines(job[key] ?? '')}`) : [];
  if (!job || sections.length === 0) throw new ReaderFailure('empty', '원티드 공고 내용을 찾지 못했습니다');

  const deadline = /^\d{4}-\d{2}-\d{2}/.exec(job.due_time ?? '')?.[0];
  const facts = [EMPLOYMENT_LABELS[job.employment_type ?? ''], job.is_remote_work ? '원격 근무' : undefined, deadline ? `마감 ${deadline}` : undefined]
    .filter(Boolean)
    .join(' · ');
  const outLink = toHttpUrl(job.out_link);
  const header = [facts, outLink ? `[기업 채용 사이트에서 지원](${outLink})` : undefined].filter(Boolean).join('\n\n');
  return {
    title: job.position?.trim() || null,
    markdown: [header, ...sections].filter(Boolean).join('\n\n'),
    siteName: '원티드',
    byline: job.company?.company_name?.trim() || null,
    deadline,
  };
}
