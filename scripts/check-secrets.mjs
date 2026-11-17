/** Gitleaks로 Git 이력과 현재 source를 검사한다. gitignore된 로컬 인증 파일은 복사하지 않는다. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const scan = (command, path) => {
  const result = spawnSync('gitleaks', [command, '--redact', '--no-banner', '--no-color', path], { stdio: 'inherit' });
  if (result.error) throw new Error('Gitleaks를 실행하지 못했습니다. Gitleaks 8.30.1을 설치하세요.');
  return result.status ?? 2;
};
const snapshot = mkdtempSync(join(tmpdir(), 'trendboda-secrets-'));
try {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    let stat;
    try { stat = lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile()) continue;
    const target = join(snapshot, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  const historyStatus = scan('git', root);
  const workingStatus = scan('dir', snapshot);
  process.exitCode = historyStatus === 0 && workingStatus === 0 ? 0 : Math.max(historyStatus, workingStatus);
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
