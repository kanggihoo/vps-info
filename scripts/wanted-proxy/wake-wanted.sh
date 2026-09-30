#!/bin/bash
# 맥이 켜져 있을 때 VPS의 원티드 Feed를 지금 수집하도록 깨운다.
# 원티드 Feed의 주기는 DB에서 525600분(1년)이라 VPS는 스스로 시도하지 않는다. 깨우면 collector가 30초 안에 수집한다.
# 이미 곧 돌 Feed(next_run_at이 지났거나 지금 이전)는 건드리지 않는다. 연결이 안 되면 그냥 실패하고 다음 때 다시 한다.
exec ssh -o BatchMode=yes -o ConnectTimeout=15 vps \
  "docker exec vps-postgres psql -U postgres -d vps_info -qc \"update feed set next_run_at = now() where id like 'wanted-%' and next_run_at > now()\""
