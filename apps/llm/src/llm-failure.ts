/** Entry 대화가 실패한 이유를 담은 오류. HTTP 응답의 `reason`으로 그대로 나간다. */
import type { ConversationFailureReason } from '@trendboda/api-types';

export class LlmFailure extends Error {
  readonly reason: ConversationFailureReason;

  constructor(reason: ConversationFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}
