/**
 * 화면 테스트 공통 설정. vitest.config.ts의 setupFiles가 모든 테스트 파일보다 먼저 읽는다.
 *
 * findBy*·waitFor의 기본 대기 시간 1초는 CI에서 coverage 계측과 병렬 실행이 겹치면 넘어간다.
 * 코드는 맞는데 렌더가 늦어 실패하는 일을 막으려고 5초로 늘린다. 조건이 맞으면 바로 끝나므로
 * 통과하는 테스트는 느려지지 않고, 진짜 실패만 결과가 늦게 나온다.
 */
import { configure } from '@testing-library/dom';

configure({ asyncUtilTimeout: 5000 });
