import { describe, expect, it, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai/providers/faux';
import type { LlmTurnRequest } from '@trendboda/api-types';
import { runConversationTurn } from './conversation-turn.ts';

vi.spyOn(console, 'log').mockImplementation(() => {});

/** `anthropic`·`openai` 자리에 대본대로 답하는 가짜 provider를 넣은 모델 모음. */
function makeModels() {
  const anthropic = fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-test' }] });
  const openai = fauxProvider({ provider: 'openai', models: [{ id: 'gpt-test' }] });
  const models = createModels();
  models.setProvider(anthropic.provider);
  models.setProvider(openai.provider);
  return { models, anthropic, openai };
}

const firstTurn: LlmTurnRequest = {
  question: '요약해 줘',
  sessionId: null,
  engine: 'anthropic',
  model: 'claude-test',
  entry: { title: '제목', url: 'https://example.com', summary: null, original: null },
};

describe('runConversationTurn', () => {
  it('이어 가는 턴은 요청이 아니라 세션을 만든 엔진·모델로, 앞의 대화와 함께 보낸다', async () => {
    const { models, anthropic, openai } = makeModels();
    anthropic.setResponses([fauxAssistantMessage([fauxText('첫 답')]), fauxAssistantMessage([fauxText('둘째 답')])]);

    const first = await runConversationTurn(firstTurn, models);
    const second = await runConversationTurn({ question: '더 자세히', sessionId: first.sessionId, engine: 'openai', model: 'gpt-test', entry: null }, models);

    expect(first.answer).toBe('첫 답');
    expect(second).toEqual({ sessionId: first.sessionId, answer: '둘째 답' });
    expect(openai.state.callCount).toBe(0);
    expect(anthropic.state.callCount).toBe(2);
  });

  it('실패한 턴은 대화 기록에 남기지 않는다', async () => {
    const { models, anthropic } = makeModels();
    anthropic.setResponses([fauxAssistantMessage([fauxText('첫 답')])]);
    const first = await runConversationTurn(firstTurn, models);

    // 대본이 비면 faux provider는 stopReason이 error인 답을 준다.
    await expect(runConversationTurn({ ...firstTurn, sessionId: first.sessionId, question: '실패할 질문', entry: null }, models)).rejects.toMatchObject({
      reason: 'llm-failed',
    });

    let sentMessages: unknown[] = [];
    anthropic.setResponses([(context) => ((sentMessages = context.messages), fauxAssistantMessage([fauxText('셋째 답')]))]);
    await runConversationTurn({ ...firstTurn, sessionId: first.sessionId, question: '다시', entry: null }, models);
    expect(JSON.stringify(sentMessages)).not.toContain('실패할 질문');
  });

  it('모르는 세션 id는 만료된 대화로 알린다', async () => {
    const { models } = makeModels();
    await expect(runConversationTurn({ ...firstTurn, sessionId: 'unknown', entry: null }, models)).rejects.toMatchObject({ reason: 'conversation-expired' });
  });

  it('인증 정보가 없는 엔진은 부르지 않는다', async () => {
    const anthropic = fauxProvider({ provider: 'anthropic', models: [{ id: 'claude-test' }] });
    const models = createModels();
    models.setProvider({ ...anthropic.provider, auth: { apiKey: { name: '키 없음', resolve: async () => undefined } } });
    await expect(runConversationTurn(firstTurn, models)).rejects.toMatchObject({ reason: 'llm-unavailable' });
    expect(anthropic.state.callCount).toBe(0);
  });
});
