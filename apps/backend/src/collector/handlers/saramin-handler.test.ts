import { describe, expect, it } from 'vitest';
import { parseDeadline, parseSearchResultPage } from './saramin-handler.ts';

const NOW = new Date('2026-09-30T03:00:00Z');

const HTML = `
<div class="item_recruit" value="55160824">
  <div class="area_job">
    <h2 class="job_tit"><a title="[메이플스타] 플랫폼 엔지니어" href="/zf_user/jobs/relay/view?rec_idx=55160824"><span>[메이플스타] 플랫폼 엔지니어</span></a></h2>
    <div class="job_date"><span class="date">~ 10/30(금)</span></div>
    <div class="job_condition"><span><a>경기</a> <a>용인시 기흥구</a></span><span>경력무관</span><span>학력무관</span><span>정규직</span></div>
    <div class="job_sector"><b><a>백엔드/서버개발</a></b>, <a>웹개발</a> <span class="job_day">등록일 26/09/30</span></div>
  </div>
  <div class="area_corp"><strong class="corp_name"><a href="/company"> (주)스타픽시스튜디오 </a></strong></div>
</div>
<div class="item_recruit" value="1"><div class="area_job"><h2 class="job_tit"><a href="/x"></a></h2></div></div>
<div class="item_recruit" value="2">
  <div class="area_job">
    <h2 class="job_tit"><a title="프론트엔드 개발자" href="/y"></a></h2>
    <div class="job_sector"><a>웹개발</a> <a>프론트엔드</a></div>
  </div>
</div>`;

describe('parseSearchResultPage', () => {
  it('검색 결과의 공고를 EntryDraft로 바꾼다', () => {
    const drafts = parseSearchResultPage(HTML, NOW);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55160824',
      title: '[메이플스타] 플랫폼 엔지니어',
      externalId: '55160824',
      author: '(주)스타픽시스튜디오',
      publishedAt: new Date('2026-09-29T15:00:00Z'),
      extra: { location: '경기 용인시 기흥구', career: '경력무관', deadline: '2026-10-30', tags: ['백엔드/서버개발', '웹개발'] },
    });
  });
});

describe('parseDeadline', () => {
  it('마감 표기를 날짜나 상시로 바꾼다', () => {
    expect(parseDeadline('~ 10/30(금)', NOW)).toEqual({ deadline: '2026-10-30' });
    expect(parseDeadline('오늘마감', NOW)).toEqual({ deadline: '2026-09-30' });
    expect(parseDeadline('내일마감', NOW)).toEqual({ deadline: '2026-10-01' });
    expect(parseDeadline('상시채용', NOW)).toEqual({ alwaysOpen: true });
    expect(parseDeadline('채용시', NOW)).toEqual({ alwaysOpen: true });
    expect(parseDeadline('', NOW)).toEqual({});
  });

  it('연도가 넘어가는 마감일은 다음 해로 본다', () => {
    expect(parseDeadline('~ 01/05(화)', new Date('2026-12-20T00:00:00Z'))).toEqual({ deadline: '2027-01-05' });
    expect(parseDeadline('~ 12/31(목)', new Date('2026-12-20T00:00:00Z'))).toEqual({ deadline: '2026-12-31' });
  });
});
