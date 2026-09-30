import { describe, expect, it } from 'vitest';
import { ReaderFailure } from './original-page.ts';
import { isWantedJobUrl, readWantedJob } from './wanted-job-page.ts';

function makePage(initialData: unknown): string {
  const nextData = JSON.stringify({ props: { pageProps: { initialData } } });
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${nextData}</script></body></html>`;
}

describe('isWantedJobUrl', () => {
  it('원티드 공고 상세 주소만 참이다', () => {
    expect(isWantedJobUrl('https://www.wanted.co.kr/wd/389506')).toBe(true);
    expect(isWantedJobUrl('https://www.wanted.co.kr/company/1')).toBe(false);
    expect(isWantedJobUrl('https://example.com/wd/1')).toBe(false);
  });
});

describe('readWantedJob', () => {
  it('공고 내용을 신입이 보는 순서의 Markdown으로 바꾼다', () => {
    const page = makePage({
      position: '백엔드 개발자',
      company: { company_name: '회사' },
      employment_type: 'regular',
      is_remote_work: true,
      out_link: 'https://www.skcareers.com/Recruit/Detail/R262032',
      intro: '회사 소개입니다.',
      main_tasks: 'ㆍ서버를 개발합니다.\nㆍ운영합니다.',
      requirements: 'ㆍ경력: 경력 무관 \n\n# 제목처럼 보이는 줄\nㆍJava 경험',
      preferred_points: '  ',
    });

    const view = readWantedJob(page);

    expect(view).toMatchObject({ title: '백엔드 개발자', siteName: '원티드', byline: '회사' });
    expect(view.markdown).toBe(
      [
        '정규직 · 원격 근무',
        '[기업 채용 사이트에서 지원](https://www.skcareers.com/Recruit/Detail/R262032)',
        '## 자격 요건\n\n- 경력: 경력 무관\n\\# 제목처럼 보이는 줄  \n- Java 경험',
        '## 주요 업무\n\n- 서버를 개발합니다.\n- 운영합니다.',
        '## 회사 소개\n\n회사 소개입니다.  ',
      ].join('\n\n'),
    );
  });

  it('마감일이 있으면 날짜만 뽑아 응답과 본문 맨 위에 준다', () => {
    const view = readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', employment_type: 'intern', due_time: '2026-10-31T00:00:00' }));
    expect(view.deadline).toBe('2026-10-31');
    expect(view.markdown.startsWith('인턴 · 마감 2026-10-31')).toBe(true);
  });

  it('마감일이 없거나 날짜 모양이 아니면 마감을 주지 않는다', () => {
    expect(readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', due_time: null })).deadline).toBeUndefined();
    expect(readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', due_time: '상시' })).deadline).toBeUndefined();
    expect(readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', due_time: '상시' })).markdown).not.toContain('마감');
  });

  it('http(s)가 아닌 지원 주소는 링크로 만들지 않는다', () => {
    const view = readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', out_link: 'javascript:alert(1)' }));
    expect(view.markdown).not.toContain('javascript:');
    expect(view.markdown).not.toContain('지원');
  });

  it('지원 주소가 없으면 링크를 만들지 않는다', () => {
    expect(readWantedJob(makePage({ position: '개발자', main_tasks: 'ㆍ일', out_link: null })).markdown).not.toContain('지원');
  });

  it('공고 내용이 없으면 실패한다', () => {
    expect(() => readWantedJob('<html></html>')).toThrow(ReaderFailure);
    expect(() => readWantedJob(makePage({ position: '개발자' }))).toThrow(ReaderFailure);
  });
});
