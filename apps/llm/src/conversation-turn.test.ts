import { describe, expect, it, vi } from 'vitest';
import type { LlmTurnRequest } from '@trendboda/api-types';
import { type Engine, runConversationTurn } from './conversation-turn.ts';

vi.spyOn(console, 'log').mockImplementation(() => {});

/** 받은 입력을 기록하고, 첫 턴이면 새 세션 id를 주는 가짜 엔진. */
function makeFakeEngine(sessionId: string) {
  const inputs: { model: string; prompt: string; sessionId: string | null }[] = [];
  const engine: Engine = {
    isAvailable: () => true,
    runTurn: async ({ model, prompt, sessionId: resumed }) => {
      inputs.push({ model, prompt, sessionId: resumed });
      return { sessionId: resumed ?? sessionId, answer: '답' };
    },
  };
  return { engine, inputs };
}

const firstTurn: LlmTurnRequest = {
  question: '요약해 줘',
  sessionId: null,
  engine: 'claude',
  model: 'sonnet',
  entry: { title: '제목', url: 'https://example.com', summary: null, original: null },
};

describe('runConversationTurn', () => {
  it('이어 가는 턴은 요청이 아니라 세션을 만든 엔진·모델로 보내고 질문만 넘긴다', async () => {
    const claude = makeFakeEngine('claude-session');
    const codex = makeFakeEngine('codex-session');
    const engines = { claude: claude.engine, codex: codex.engine };

    await runConversationTurn(firstTurn, engines);
    await runConversationTurn({ question: '더 자세히', sessionId: 'claude-session', engine: 'codex', model: 'gpt-6-sol', entry: null }, engines);

    expect(codex.inputs).toEqual([]);
    expect(claude.inputs[0].prompt).toContain('<entry>');
    expect(claude.inputs[1]).toEqual({ model: 'sonnet', prompt: '더 자세히', sessionId: 'claude-session' });
  });

  it('모르는 세션 id는 만료된 대화로 알린다', async () => {
    const { engine } = makeFakeEngine('x');
    await expect(runConversationTurn({ ...firstTurn, sessionId: 'unknown', entry: null }, { claude: engine, codex: engine })).rejects.toMatchObject({
      reason: 'conversation-expired',
    });
  });

  it('인증 정보가 없는 엔진은 부르지 않는다', async () => {
    const { engine, inputs } = makeFakeEngine('x');
    const unavailable = { ...engine, isAvailable: () => false };
    await expect(runConversationTurn(firstTurn, { claude: unavailable, codex: engine })).rejects.toMatchObject({ reason: 'llm-unavailable' });
    expect(inputs).toEqual([]);
  });
});
