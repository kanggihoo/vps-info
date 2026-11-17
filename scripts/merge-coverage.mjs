/** workspace별 lcov 경로를 repo 상대 경로로 합친다. 테스트는 다시 실행하지 않는다. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const workspaces = ['apps/backend', 'apps/web', 'apps/llm'];
const reports = workspaces.map((workspace) => readFileSync(`${workspace}/coverage/lcov.info`, 'utf8')
  .replace(/^SF:(.+)$/gm, (_, path) => `SF:${workspace}/${path}`));
mkdirSync('coverage', { recursive: true });
writeFileSync('coverage/lcov.info', reports.join('\n'));
console.log('coverage/lcov.info: merged backend, web, llm');
