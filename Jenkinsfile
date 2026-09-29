// VPS Jenkins가 main push마다 실행한다. Job 정의는 vps-infra/jenkins/jobs.groovy에 있다.
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
                    name="vps-info-test-$BUILD_NUMBER"
                    docker build --target test -t vps-info-test .
                    status=0
                    docker run --name "$name" -e JUNIT_OUTPUT_DIR=/app/test-results vps-info-test || status=$?
                    rm -rf test-results
                    docker cp "$name:/app/test-results" test-results || true
                    docker rm "$name" >/dev/null
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
        stage('Decrypt') {
            steps {
                withCredentials([file(credentialsId: 'sops-age-key', variable: 'SOPS_AGE_KEY_FILE')]) {
                    sh 'umask 077 && sops decrypt secrets/env.prod.sops.env > .env'
                }
            }
        }

        // migrate가 성공한 뒤 app과 collector가 뜨고, --wait가 app healthcheck까지 기다린다.
        stage('Deploy') {
            steps {
                sh 'docker compose up -d --build --wait --wait-timeout 180 && docker compose ps -a'
            }
        }
    }

    post {
        // 평문 .env를 workspace에 남기지 않는다.
        // notifyMattermost는 vps-infra가 JCasC로 등록한 implicit 라이브러리에 있다.
        always {
            sh 'rm -f .env'
            notifyMattermost()
        }
    }
}
