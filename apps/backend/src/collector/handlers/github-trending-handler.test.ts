import { describe, expect, it } from 'vitest';
import { parseTrendingPage } from './github-trending-handler.ts';

/** 실제 Trending 페이지에서 한 줄만 남기고 줄인 HTML. */
const TRENDING_HTML = `
<article class="Box-row">
  <a href="/login?return_to=%2Fowner%2Frepo"><span>Star</span></a>
  <h2 class="h3 lh-condensed"><a href="/owner/repo"><span>owner /</span> repo</a></h2>
  <p class="col-9"> The open-source app
    for agents </p>
  <div class="f6">
    <span><span itemprop="programmingLanguage">TypeScript</span></span>
    <a href="/owner/repo/stargazers"> 89,072</a>
    <a href="/owner/repo/forks"> 15,598</a>
    <span class="d-inline-block float-sm-right"> 2,527 stars today </span>
  </div>
</article>`;

describe('parseTrendingPage', () => {
  it('저장소 이름·설명·언어·스타 수를 뽑는다', () => {
    expect(parseTrendingPage(TRENDING_HTML)).toEqual([
      expect.objectContaining({
        url: 'https://github.com/owner/repo',
        title: 'owner/repo',
        externalId: 'owner/repo',
        summary: 'The open-source app for agents',
        extra: { language: 'TypeScript' },
        metrics: { score: 2527, starsInPeriod: 2527, stars: 89072 },
      }),
    ]);
  });
});
