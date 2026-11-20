// VPS Jenkins multibranch job이 main만 빌드해 배포한다. Job 정의는 vps-infra/jenkins/casc/jobs.groovy에 있다.
// PR 검증은 GitHub Actions(.github/workflows/ci.yml)가 한다(vps-infra ADR 0018). main의 Test는 배포 직전 재검증이다.
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
        // 타입·lint·secret·Floor·단위 테스트·변경 Coverage. DB 통합 테스트는 로컬 check:full에서 실행한다.
        // 결과 XML은 docker cp로 꺼낸다. Jenkins가 docker.sock을 쓰므로 -v 경로는 호스트 기준으로
        // 해석되는데, workspace는 Jenkins named volume 안에 있어 bind mount로는 가리킬 수 없다.
        stage('Test') {
            steps {
                sh '''
                    set -eu
                    # multibranch는 브랜치(PR)마다 BUILD_NUMBER가 따로 올라가므로 JOB_BASE_NAME까지 넣어야 겹치지 않는다.
                    # 브랜치 이름의 /는 %2F로 오므로 docker 이름에 쓸 수 있는 문자만 남긴다.
                    branch="$(printf %s "$JOB_BASE_NAME" | tr -c 'A-Za-z0-9_.-' '-' | tr 'A-Z' 'a-z')"
                    name="vps-info-test-$branch-$BUILD_NUMBER"
                    docker build --target test -t "$name" .
                    status=0
                    base="origin/main"
                    # docs 등 빌드 문맥에서 제외한 tracked 파일도 검사할 커밋과 일치시킨다.
                    # .git은 이미지에 넣지 않고 임시 검사 컨테이너에만 복사한다.
                    docker create --name "$name" -e CHECK_BASE="$base" -e JUNIT_OUTPUT_DIR=/app/test-results "$name" npm run check:task >/dev/null
                    git archive --format=tar HEAD | docker cp - "$name:/app"
                    docker cp .git "$name:/app/.git"
                    docker start -a "$name" || status=$?
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
        // 배포 stage는 main에서만 돈다. Job이 main만 발견하지만, 다른 브랜치가 빌드되더라도 운영 secret을 만지거나 배포하지 않게 남긴다.
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

        // 마이그레이션이 바뀌면 배포된 DB의 스키마로 Liam ERD를 만든다(scripts/erd.sh, docs/guides/erd.md).
        // 수동 빌드(Build Now)는 항상 실행한다. ERD는 부가 기능이라 실패해도 배포 결과는 SUCCESS로 두고 이 stage만 실패로 표시한다.
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
                    sh './scripts/erd.sh'
                }
            }
        }
    }

    post {
        // 평문 .env를 workspace에 남기지 않는다.
        // notifyMattermost는 vps-infra가 JCasC로 등록한 implicit 라이브러리에 있다.
        always {
            sh 'rm -f .env'
            // main 빌드는 CD로 알린다. PR 검증(CI) 알림은 GitHub Actions workflow가 보낸다(vps-infra ADR 0018).
            notifyMattermost(kind: 'CD')
        }
    }
}
