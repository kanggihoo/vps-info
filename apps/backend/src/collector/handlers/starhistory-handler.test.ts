import { describe, expect, it } from 'vitest';
import { parseStarHistoryHome } from './starhistory-handler.ts';

/** 실제 홈 순위표 한 줄의 모양. 변동 칸은 `movement`로 바꾼다. 마우스 올림 설명 사이에는 React 주석이 들어간다. */
function makeRow(rank: number, name: string, gained: number, movement: string): string {
  const [, repo] = name.split('/');
  return (
    `<li class="relative group"><a href="/${name.toLowerCase()}" class="flex"><span class="w-6">${rank}</span>` +
    `<span class="w-4 text-center">${movement}</span><img src="https://github.com/x.png"/><span class="truncate">${repo}</span>` +
    `<span class="flex-1"></span><span class="accent-text">+${(gained / 1000).toFixed(1)}k</span></a>` +
    `<span class="tooltip">${name}<!-- --> <!-- -->+${gained.toLocaleString('en-US')}</span></li>`
  );
}

const html = `<html><body><ol>${[
  makeRow(1, 'debpalash/VoiceStudio', 8835, '<span class="text-gray-300">–</span>'),
  makeRow(2, 'Panniantong/Agent-Reach', 6249, '<span class="text-green-600" title="Up 3">▲</span>'),
  makeRow(3, 'NVIDIA/OpenShell', 5358, '<span class="text-red-500" title="Down 10">▼</span>'),
  makeRow(4, 'morluto/rea', 5839, '<span class="text-green-600" title="New to top 20">N</span>'),
].join('')}</ol></body></html>`;

describe('parseStarHistoryHome', () => {
  it('순위표를 순서대로 읽고 정확한 저장소 이름과 주간 증가 스타를 metrics에 넣는다', () => {
    const drafts = parseStarHistoryHome(html);
    expect(drafts.map((draft) => draft.title)).toEqual(['debpalash/VoiceStudio', 'Panniantong/Agent-Reach', 'NVIDIA/OpenShell', 'morluto/rea']);
    expect(drafts[0]).toMatchObject({
      url: 'https://github.com/debpalash/VoiceStudio',
      externalId: 'debpalash/VoiceStudio',
      author: 'debpalash',
      metrics: { starsGained: 8835 },
    });
  });

  it('사이트가 보여 주는 지난주 대비 변동을 부호 있는 칸 수와 신규 여부로 남긴다', () => {
    const [stayed, up, down, added] = parseStarHistoryHome(html).map((draft) => draft.metrics);
    expect(stayed).toMatchObject({ rankChange: undefined, isNewToTop: undefined });
    expect(up).toMatchObject({ rankChange: 3 });
    expect(down).toMatchObject({ rankChange: -10 });
    expect(added).toMatchObject({ rankChange: undefined, isNewToTop: true });
  });

  it('순위표가 없거나 한 줄의 형식이 다르면 예외를 던진다', () => {
    expect(() => parseStarHistoryHome('<html><body></body></html>')).toThrow('순위표를 찾지 못했다');
    expect(() => parseStarHistoryHome('<ol><li><a href="/a/b"><span>x</span></a><span>이상한 설명</span></li></ol>')).toThrow('읽지 못했다');
  });
});
