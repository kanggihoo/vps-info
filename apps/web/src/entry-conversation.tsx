/**
 * 펼친 Entry 하나에 대한 대화(ADR-0015). 요약 버튼은 이 대화의 첫 질문을 미리 정해 둔 것이다.
 *
 * 첫 질문에는 원문 본문이 함께 간다. 원문 읽기로 받아 둔 본문이 있으면 그것을, 없으면 그때 받아 보낸다.
 * 대화 기록은 `llm` 서비스가 메모리에 들고 있고, 화면은 세션 id만 기억한다. 저장하지 않으므로 다른 Entry로 옮기면 사라진다.
 * 엔진·모델을 바꾸면 부모가 `key`로 새로 만들어 새 대화가 된다. 세션은 엔진에 묶여 있기 때문이다.
 */
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import type { ConversationFailureReason } from '@trendboda/api-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from 'cn';
import { ApiError, apiClient } from './api-client.ts';
import { AnswerMarkdown } from './reader-markdown.tsx';
import type { LlmChoice } from './use-llm-choice.ts';

/** 요약 버튼이 보내는 첫 질문. */
const SUMMARY_QUESTION = '이 글의 핵심을 한국어로 3~5줄로 요약해 줘.';

/** 실패 이유별 안내. */
const CONVERSATION_FAILURE_MESSAGES: Record<ConversationFailureReason, string> = {
  'llm-disabled': '서버에 llm 서비스가 설정되지 않아 대화할 수 없습니다.',
  'llm-unreachable': 'llm 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.',
  'llm-unavailable': '이 엔진의 인증 정보가 서버에 없습니다. 다른 엔진을 고르세요.',
  'conversation-expired': '대화가 끊겼습니다. 다시 시도하면 새 대화로 묻습니다.',
  'llm-timeout': '답을 제때 받지 못했습니다. 다시 시도하세요.',
  'llm-failed': '답을 받지 못했습니다. 사용 한도를 넘었을 수 있습니다.',
};

type Turn = {
  question: string;
  answer?: string;
  failure?: ConversationFailureReason;
  /** `llm` 서비스가 재시작되어 이 질문부터 새 대화로 물었는지. 앞의 대화는 엔진이 모른다. */
  restarted?: boolean;
};

type EntryConversationProps = {
  entryId: number;
  choice: LlmChoice;
  /** 드롭다운에 보이는 엔진·모델 이름(`Claude · Sonnet`). */
  choiceTitle: string;
  /** 첫 질문에 넣을 원문 본문. 가져오지 못하면 `null`이고 제목·요약만으로 묻는다. */
  loadOriginal: () => Promise<string | null>;
};

export function EntryConversation({ entryId, choice, choiceTitle, loadOriginal }: EntryConversationProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState('');

  const updateLastTurn = (change: Partial<Turn>) => setTurns((current) => current.map((turn, index) => (index === current.length - 1 ? { ...turn, ...change } : turn)));

  const askEngine = async (question: string, resumedSessionId: string | null) =>
    apiClient.sendConversationTurn(entryId, {
      question,
      sessionId: resumedSessionId,
      ...choice,
      original: resumedSessionId ? null : await loadOriginal(),
    });

  const ask = async (question: string) => {
    setPending(true);
    setTurns((current) => [...current, { question }]);
    try {
      let view;
      try {
        view = await askEngine(question, sessionId);
      } catch (error) {
        // 세션이 사라졌으면 한 번만 새 대화로 다시 묻는다.
        if (!(error instanceof ApiError && error.reason === 'conversation-expired' && sessionId)) throw error;
        updateLastTurn({ restarted: true });
        view = await askEngine(question, null);
      }
      setSessionId(view.sessionId);
      updateLastTurn({ answer: view.answer });
    } catch (error) {
      console.error(error);
      const reason = error instanceof ApiError ? (error.reason as ConversationFailureReason | undefined) : undefined;
      if (reason === 'conversation-expired') setSessionId(null);
      updateLastTurn({ failure: reason ?? 'llm-failed' });
    } finally {
      setPending(false);
    }
  };

  const submitDraft = (event?: FormEvent) => {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft('');
    void ask(question);
  };

  /** Enter로 보내고 Shift+Enter로 줄을 바꾼다. 한글을 조합하는 중의 Enter는 글자를 확정하는 키라 보내지 않는다. */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  };

  /** 실패한 마지막 질문을 지우고 다시 묻는다. */
  const retryLastTurn = () => {
    const last = turns.at(-1);
    if (!last) return;
    setTurns((current) => current.slice(0, -1));
    void ask(last.question);
  };

  return (
    <section aria-label="Entry 대화" className="mt-8 border-t pt-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-entry-title text-foreground">대화</h3>
        <span className="text-caption text-muted-foreground">{choiceTitle}</span>
      </div>
      {turns.length === 0 && <p className="text-caption text-muted-foreground">이 Entry에 대해 물어보세요. 첫 질문에 원문 본문이 함께 들어갑니다.</p>}
      <ol className="flex flex-col gap-5">
        {turns.map((turn, index) => (
          <li key={index} className="flex flex-col gap-2">
            <p className="text-body-sm-medium whitespace-pre-wrap break-words text-foreground">{turn.question}</p>
            {turn.restarted && <p className="text-caption text-muted-foreground">대화가 끊겨 이 질문부터 새 대화로 물었습니다.</p>}
            {turn.answer !== undefined ? (
              <AnswerMarkdown markdown={turn.answer} />
            ) : turn.failure ? (
              <div className="flex flex-wrap items-center gap-3">
                <p role="alert" className="text-caption text-destructive">
                  {CONVERSATION_FAILURE_MESSAGES[turn.failure]}
                </p>
                {index === turns.length - 1 && (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={retryLastTurn} disabled={pending}>
                    다시 시도
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="답을 기다리는 중">
                {['w-full', 'w-5/6', 'w-2/3'].map((width) => (
                  <Skeleton key={width} className={cn('h-3.5 rounded-xs', width)} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <form className="mt-5 flex flex-col gap-2" onSubmit={submitDraft}>
        <Textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요. Enter로 보내고 Shift+Enter로 줄을 바꿉니다."
          aria-label="질문"
          maxLength={4000}
          className="min-h-20 rounded-lg text-body-sm"
        />
        <div className="flex justify-end gap-2">
          {turns.length === 0 && (
            <Button type="button" variant="outline" className="rounded-full" disabled={pending} onClick={() => void ask(SUMMARY_QUESTION)}>
              요약
            </Button>
          )}
          <Button type="submit" className="rounded-full" disabled={pending || !draft.trim()}>
            보내기
          </Button>
        </div>
      </form>
    </section>
  );
}
