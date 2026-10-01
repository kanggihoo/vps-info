// VPS Jenkins multibranch job이 PR과 main을 빌드한다. Job 정의는 vps-infra/jenkins/casc/jobs.groovy에 있다.
// PR은 Test만 돌려 GitHub status로 보고하고(병합 조건), main은 Test 뒤에 배포까지 한다.
// 이미지는 VPS에서 빌드한다(ADR-0001). PostgreSQL과 nginx는 vps-infra가 소유한다.
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        timestamps()
        ansiColor('xterm')
    }

    stages {
        // 단위 테스트. DB가 필요 없고 배포 이미지와 같은 lockfile로 설치한다.
        // 결과 XML은 docker cp로 꺼낸다. Jenkins가 docker.sock을 쓰므로 -v 경로는 호스트 기준으로
        // 해석되는데, workspace는 Jenkins named volume 안에 있어 bind mount로는 가리킬 수 없다.
        stage('Test') {
            steps {
                sh '''
                    set -eu
                    # multibranch는 브랜치(PR)마다 BUILD_NUMBER가 따로 올라가므로 JOB_BASE_NAME까지 넣어야 겹치지 않는다.
                    name="vps-info-test-$JOB_BASE_NAME-$BUILD_NUMBER"
                    docker build --target test -t "$name" .
                    status=0
                    docker run --name "$name" -e JUNIT_OUTPUT_DIR=/app/test-results "$name" || status=$?
                    rm -rf test-results
                    docker cp "$name:/app/test-results" test-results || true
                    docker rm "$name" >/dev/null
                    docker rmi "$name" >/dev/null || true
                    exit "$status"
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'test-results/*.xml'
                }
            }
        }

        // 운영 접속 정보를 SOPS로 복호화한다. key는 JCasC가 등록한 sops-age-key credential이다.
        // 배포 stage는 main에서만 돈다. PR 빌드가 운영 secret을 만지거나 배포하면 안 된다.
        stage('Decrypt') {
            when { branch 'main' }
            steps {
                withCredentials([file(credentialsId: 'sops-age-key', variable: 'SOPS_AGE_KEY_FILE')]) {
                    sh 'umask 077 && sops decrypt secrets/env.prod.sops.env > .env'
                }
            }
        }

        // migrate가 성공한 뒤 app과 collector가 뜨고, --wait가 app healthcheck까지 기다린다.
        stage('Deploy') {
            when { branch 'main' }
            steps {
                sh 'docker compose up -d --build --wait --wait-timeout 180 && docker compose ps -a'
            }
        }

        // 마이그레이션이 바뀌면 배포된 DB의 스키마로 Liam ERD를 만들어 nginx가 서빙하는 볼륨에 넣는다.
        // 수동 빌드(Build Now)는 항상 실행한다. 처음 채우거나 실패한 뒤 다시 만들 때 쓴다.
        // ERD는 부가 기능이라 실패해도 배포 결과는 SUCCESS로 두고 이 stage만 실패로 표시한다.
        // 입력을 schema.ts가 아니라 pg_dump로 받는 이유: COMMENT(테이블·컬럼 설명)가 ERD에 나온다.
        // Jenkins workspace가 named volume 안이라 bind mount를 못 쓰므로 docker cp로 주고받는다.
        stage('ERD') {
            when {
                allOf {
                    branch 'main'
                    anyOf {
                        changeset 'apps/backend/drizzle/**'
                        triggeredBy 'UserIdCause'
                    }
                }
            }
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh '''
                        set -eu
                        set -a; . ./.env; set +a
                        build="vps-info-erd-build-$BUILD_NUMBER"
                        pub="vps-info-erd-pub-$BUILD_NUMBER"
                        trap 'docker rm -f "$build" "$pub" >/dev/null 2>&1 || true; rm -rf schema.sql erd-dist' EXIT

                        # drizzle 스키마는 마이그레이션 기록 테이블이라 ERD에서 뺀다.
                        docker exec vps-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
                            --schema-only --no-owner --no-privileges --exclude-schema=drizzle > schema.sql

                        docker create --name "$build" -w /tmp node:22-slim \
                            npx -y @liam-hq/cli@0.7.24 erd build --format postgres --input schema.sql --output-dir dist >/dev/null
                        docker cp schema.sql "$build:/tmp/schema.sql"
                        docker start -a "$build"
                        docker cp "$build:/tmp/dist" erd-dist

                        # 숨김 폴더에 먼저 복사한 뒤 바꿔치기해서 복사 도중의 파일을 nginx가 내보내지 않게 한다.
                        docker create --name "$pub" -v vps_erd_site:/erd alpine:3.24 \
                            sh -c 'chmod -R a+rX /erd/.vps-info.new && rm -rf /erd/vps-info && mv /erd/.vps-info.new /erd/vps-info' >/dev/null
                        docker cp erd-dist "$pub:/erd/.vps-info.new"
                        docker start -a "$pub"
                    '''
                }
            }
        }
    }

    post {
        // 평문 .env를 workspace에 남기지 않는다.
        // notifyMattermost는 vps-infra가 JCasC로 등록한 implicit 라이브러리에 있다.
        always {
            sh 'rm -f .env'
            // PR 빌드는 CI, main 빌드는 CD로 알린다(ADR 0014). CHANGE_ID는 PR 빌드에만 있다.
            script {
                if (env.CHANGE_ID) {
                    notifyMattermost(kind: 'CI', fields: ['PR': "[#${env.CHANGE_ID}](${env.CHANGE_URL})"])
                } else if (env.BRANCH_NAME == 'main') {
                    notifyMattermost(kind: 'CD')
                }
            }
        }
    }
}
