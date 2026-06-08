# 신사업 발굴 — 로컬 브리지 (구독 실행, 종량 API 불필요)

브라우저 폼에서 영역을 입력하면, **본 PC의 Claude Code(`claude -p`)** 가 구독 인증으로
시장·경쟁·규제를 **내장 웹검색**으로 리서치하고 인터랙티브 리포트로 렌더합니다.
**Anthropic 종량 API 키가 필요 없습니다.**

## 동작 방식
```
브라우저 폼  →  로컬 서버(server.mjs)  →  claude -p (구독 인증 + 내장 WebSearch)
                                            → REPORT JSON  →  reports/report.html 렌더
```

## 사전 조건
1. **Node.js 18+**
2. **Claude Code CLI** 설치 후 **구독 로그인**
   ```bash
   npm install -g @anthropic-ai/claude-code   # 설치(이미 있으면 생략)
   claude                                      # 실행 → /login 으로 구독(Pro/Max) 로그인
   ```
   > 로그인이 종량 API 키가 아니라 **구독 계정**으로 되어 있어야 구독 한도로 청구됩니다.

## 실행
레포 루트에서:
```bash
node tools/local-agent/server.mjs
```
그러면 콘솔에 주소가 뜹니다 → 브라우저로 **http://localhost:4178** 접속 →
영역·옵션 선택 → **리서치 생성**.

- 포트 변경: `PORT=5000 node tools/local-agent/server.mjs`
- claude 실행파일 경로 지정: `CLAUDE_BIN=/path/to/claude node tools/local-agent/server.mjs`

## 요금
- 리서치는 `claude -p`(헤드리스)로 실행되며 **월별 Agent SDK 크레딧**(구독에 포함, Pro 약 $20 / Max 약 $100~200 상당)에서 차감됩니다. **별도 충전 불필요**, 매월 리셋.
- 이 월 크레딧을 **초과하면** 종량제 API로 넘어갑니다(그때는 API 결제 필요).
- 정확한 정책·금액은 https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan 에서 확인.

## 참고
- 결과 품질은 프롬프트/스키마(`server.mjs`의 `SCHEMA`·`SYS`)를 조정해 튜닝할 수 있습니다.
- 리포트 렌더러는 공개 사이트와 동일한 `reports/report.html`(데이터 구동형)을 재사용합니다.
- 이 도구는 **로컬 전용**입니다. 사내 공유가 필요하면 사내망 서버에 올리고 접근제어를 두세요(공개 인터넷 노출 금지).
