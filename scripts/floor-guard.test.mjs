/** 임시 Git 저장소에서 Floor guard의 차단·누락 방지·redaction 계약을 검사한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const guard = resolve('scripts/floor-guard.mjs');
function repository(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'floor-guard-test-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  const write = (path, text) => writeFileSync(join(cwd, path), text);
  try {
    git('init', '-b', 'main'); git('config', 'user.name', 'Guard Test'); git('config', 'user.email', 'guard@example.invalid');
    write('app.ts', 'export const value = 1;\n');
    write('app.test.ts', 'expect(value).toBe(1);\n');
    write('CONSTRAINTS.md', '| Coverage | >= 80% |\n');
    git('add', '.'); git('commit', '-m', 'baseline');
    const check = (base = 'HEAD') => spawnSync(process.execPath, [guard, '--base', base], { cwd, encoding: 'utf8' });
    run({ git, write, check, cwd });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('변경이 없으면 0, 비교할 수 없는 base는 2', () => repository(({ check }) => {
  assert.equal(check().status, 0);
  assert.equal(check('missing-ref').status, 2);
}));
test('staged suppression과 untracked stub을 탐지하고 내용은 출력하지 않는다', () => repository(({ write, git, check }) => {
  write('app.ts', '// @ts-ignore sensitive-marker\nexport const value = 1;\n'); git('add', 'app.ts');
  write('new.ts', 'throw new Error("Not implemented sensitive-marker");\n');
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /silenced-checker/);
  assert.match(result.stderr, /unfinished-work/);
  assert.ok(!result.stderr.includes('sensitive-marker'));
}));
test('test skip·파일 삭제·assertion 제거를 탐지한다', () => {
  repository(({ write, check }) => { write('new.test.ts', 'it.skip("example", () => {});\n'); assert.match(check().stderr, /test-made-easier/); });
  repository(({ cwd, check }) => { rmSync(join(cwd, 'app.test.ts')); assert.match(check().stderr, /test-deleted/); });
  repository(({ write, check }) => { write('app.test.ts', 'const value = 1;\n'); assert.match(check().stderr, /assertion-removed/); });
});
test('coverage 완화와 새 예외는 실패하고 강화는 통과한다', () => {
  repository(({ write, check }) => { write('CONSTRAINTS.md', '| Coverage | >= 50% |\n'); assert.match(check().stderr, /threshold-loosened/); });
  repository(({ write, check }) => { write('CONSTRAINTS.md', '| Coverage | >= 90% |\n'); assert.equal(check().status, 0); });
  repository(({ write, check }) => { write('CONSTRAINTS.md', '| Coverage | >= 80% |\n| W1 | temporary |\n'); assert.match(check().stderr, /new-exception/); });
});
