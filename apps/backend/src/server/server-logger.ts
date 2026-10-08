/** 서버 요청 로그 설정. 로그 형식은 docs/conventions/logging.md를 따른다. */

/**
 * Fastify(pino) 로거 설정.
 *
 * pino는 기본으로 레벨을 숫자(`"level":30`)로 쓰는데, 운영 로그를 모으는 Loki·Grafana는 숫자를 레벨로
 * 알아보지 못해 모두 unknown으로 보인다. 레벨을 이름(`"level":"info"`)으로 쓴다.
 */
export const SERVER_LOGGER_OPTIONS = {
  formatters: {
    level: (label: string) => ({ level: label }),
  },
};
