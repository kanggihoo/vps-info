/**
 * pi-ai의 `CredentialStore`를 JSON 파일 하나로 구현한다(ADR-0018).
 *
 * 파일 모양은 pi-ai CLI(`pi-ai login`)가 쓰는 `auth.json`과 같다: `{ [providerId]: Credential }`.
 * 그래서 로그인은 CLI로 하고, 이 저장소는 그 파일을 읽고 토큰 갱신 결과를 되돌려 쓴다.
 * 읽을 때마다 파일을 다시 읽으므로 서비스가 떠 있는 동안 로그인해도 재시작 없이 반영된다.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';

export class FileCredentialStore implements CredentialStore {
  readonly #path: string;
  /** 쓰기를 한 줄로 세운다. 토큰 갱신이 겹쳐 같은 refresh 토큰을 두 번 쓰지 않게 한다. ponytail: 프로세스 하나만 쓴다고 본다(ADR-0018). 여럿이면 파일 락이 필요하다. */
  #writes: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  #readAll(): Record<string, Credential> {
    return existsSync(this.#path) ? (JSON.parse(readFileSync(this.#path, 'utf8')) as Record<string, Credential>) : {};
  }

  /** 쓰다 죽어도 반쪽 파일이 남지 않게 바꿔치기로 쓴다. */
  #writeAll(credentials: Record<string, Credential>): void {
    const temporaryPath = `${this.#path}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    renameSync(temporaryPath, this.#path);
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#writes.then(task);
    this.#writes = result.catch(() => {});
    return result;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.#readAll()[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.#readAll()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
  }

  modify(providerId: string, change: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined> {
    return this.#enqueue(async () => {
      const credentials = this.#readAll();
      const next = await change(credentials[providerId]);
      if (next === undefined) return credentials[providerId];
      this.#writeAll({ ...this.#readAll(), [providerId]: next });
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.#enqueue(async () => {
      const { [providerId]: _removed, ...rest } = this.#readAll();
      this.#writeAll(rest);
    });
  }
}
