import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Credential } from '@earendil-works/pi-ai';
import { FileCredentialStore } from './file-credential-store.ts';

const oauth = (access: string): Credential => ({ type: 'oauth', access, refresh: 'refresh', expires: 0 });

describe('FileCredentialStore', () => {
  it('pi-ai CLI가 쓴 파일을 읽고, 다른 provider를 건드리지 않고 고쳐 쓴다', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'llm-auth-')), 'auth.json');
    writeFileSync(path, JSON.stringify({ openai: oauth('old'), other: oauth('keep') }));
    const store = new FileCredentialStore(path);

    await store.modify('openai', async () => oauth('new'));

    expect(await store.read('openai')).toMatchObject({ access: 'new' });
    expect(JSON.parse(readFileSync(path, 'utf8')).other).toMatchObject({ access: 'keep' });
  });

  it('동시에 고쳐도 차례로 처리해 뒤의 쓰기가 앞의 결과를 본다', async () => {
    const store = new FileCredentialStore(join(mkdtempSync(join(tmpdir(), 'llm-auth-')), 'auth.json'));
    const seen: (string | undefined)[] = [];
    const refresh = (access: string) =>
      store.modify('openai', async (current) => {
        seen.push(current?.type === 'oauth' ? current.access : undefined);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return oauth(access);
      });

    await Promise.all([refresh('first'), refresh('second')]);

    expect(seen).toEqual([undefined, 'first']);
    expect(await store.read('openai')).toMatchObject({ access: 'second' });
  });
});
