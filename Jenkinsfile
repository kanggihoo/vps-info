// VPS Jenkins가 main push마다 실행한다. Job 정의는 vps-infra/jenkins/jobs.groovy에 있다.
// 이미지는 VPS에서 빌드한다(ADR-0001). PostgreSQL과 nginx는 vps-infra가 소유한다.
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        timestamps()
    }

    stages {
        // 단위 테스트. DB가 필요 없고 배포 이미지와 같은 lockfile로 설치한다.
        stage('Test') {
            steps {
                sh 'docker build --target test -t vps-info-test . && docker run --rm vps-info-test'
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
        always {
            sh 'rm -f .env'
        }
    }
}
