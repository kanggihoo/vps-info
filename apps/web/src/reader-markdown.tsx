/**
 * 원문에서 뽑은 본문(Markdown)을 그린다(ADR-0011).
 *
 * 본문에는 원문 페이지의 HTML(`<img>`, `<table>`, `<details>` 등)이 섞여 온다. GitHub README가 특히 그렇다.
 * HTML을 모두 버리면 README가 망가지므로 `rehype-raw`로 살리고, `rehype-sanitize`의 기본 허용 목록(GitHub의 README 렌더링 규칙)으로 거른다.
 * HN이 링크하는 페이지는 누구나 만든 곳이라 `<script>`·이벤트 속성·인라인 `<svg>`·`<iframe>`이 이 앱에서 실행되면 안 된다.
 *
 * Entry 대화의 답(`AnswerMarkdown`)은 다른 규칙으로 그린다(ADR-0015 결정 7). 원문의 인젝션에 넘어간 답이
 * `![](https://…/?q=비밀)` 하나로 화면을 열자마자 바깥에 요청을 보낼 수 있으므로, HTML을 버리고 이미지를 그리지 않는다.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

/** 본문의 링크는 새 탭에서 연다. 펼친 화면을 잃지 않게 하려는 것이다. */
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** Entry 대화의 답을 그린다. HTML은 버리고(`skipHtml`), 이미지는 그리지 않는다. 링크는 눌러야만 열린다. */
export function AnswerMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words prose-a:underline-offset-2 prose-pre:rounded-md">
      <ReactMarkdown skipHtml disallowedElements={['img']} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function ReaderMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-sm max-w-none wrap-anywhere prose-a:underline-offset-2 prose-img:h-auto prose-img:max-w-full prose-img:rounded-md prose-pre:rounded-md prose-pre:whitespace-pre-wrap [&_table]:table-fixed [&_table]:w-full">
      <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
