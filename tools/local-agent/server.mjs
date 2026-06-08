// 신사업 발굴 — 로컬 브리지 서버 (의존성 0, Node 18+)
// 브라우저 폼 → claude -p (Claude Code 헤드리스, 구독 인증, 웹검색 내장) → REPORT JSON → 리포트 렌더
// 종량 API 키 불필요. 사전조건: `claude` CLI 설치 + 구독 로그인(`claude` 실행 후 /login).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4178;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const REPORT_HTML = join(__dirname, '..', '..', 'reports', 'report.html');
const INDEX_HTML = join(__dirname, 'public', 'index.html');
const BRIDGE_PASSWORD = process.env.BRIDGE_PASSWORD || '';
const DAILY_LIMIT = parseInt(process.env.BRIDGE_DAILY_LIMIT || '30', 10);
const usage = { date: '', count: 0 };

const SCHEMA = '{meta:{tag,title,subtitle,foot}, verdict:{badge:"조건부 Go|관망(Watch)|진입 보류(No-go) 중 한국어",text}, kpis:[{label,value,sub}](정확히 4개), scores:{labels:["시장 매력도","경쟁 우호도","규제 용이성","전략적 적합성"],values:[0~5 숫자 4개]}, summaryPoints:[문장 3~5], market:{sizes:{categories:[카테고리 2~3],y2024:[숫자],y2030:[숫자],unit:"예: 억 USD"},cagr:{labels:[3~4],values:[숫자 %]},funnel:[{t,v}](TAM,SAM,SOM 3개),drivers:[문장 4]}, competition:{players:[{n:이름,x:0~10 상용화성숙도,y:0~10 프리미엄,r:8~24 영향력,c:"#hex"}](4~8),forces:[{n,lvl:"높음|중간|낮음",v:0~100}](5개: 신규진입/공급자/구매자/대체재/기존경쟁),incumbents:[문장],players_table:[[기업,포지션,모델,상태,"hi|mid|lo"]]}, regulation:{flow:[{h,d}](4단계),checklist:[[경로,규제관문,핵심점검]](Build,Borrow,Buy)}, opinion:{reco:문장,bbbChart:{criteria:["실행 속도","자본 효율","역량 내재화","리스크 관리"],Build:[0~5 4개],Borrow:[4개],Buy:[4개]},bbb:[{name:"Build",tag,cls:"vt-no",note},{name:"Borrow",tag,cls:"vt-rec",note},{name:"Buy",tag,cls:"vt-opt",note}],nextSteps:[문장]}, sources:{"시장조사":[[제목,url]],"경쟁환경":[[제목,url]],"규제":[[제목,url]]}}';

const SYS = "당신은 한국 생명보험사 신사업추진파트의 '발굴 에이전트'입니다. WebSearch/WebFetch 도구로 시장규모·성장률·동인, 경쟁 플레이어·다이내믹스, 규제(특히 생명보험사 진입요건: 보험업법 부수/겸영업무·자회사 출자 §115·건강증진형 보험 가이드라인)를 조사한 뒤, 생보사 진입 관점의 진입 초기의견(시장매력도·경쟁강도·규제난이도·전략적 적합성 → Go/Watch/No-go)으로 종합합니다. 한국 1차 출처를 우선하고 수치엔 출처·연도를 반영하세요. 규제는 1차 의견이며 최종 법무·컴플라이언스 검토가 필요합니다.";

function buildPrompt(cfg) {
  const lenses = (cfg.lenses || []).join(', ') || '제한 없음';
  const bench = (cfg.benchmarks || []).join(', ') || '없음';
  return `${SYS}

아래 신사업 영역을 WebSearch로 조사해 진입 리포트를 만들어줘. 모든 텍스트는 한국어.
영역: ${cfg.area}
전략 관점(렌즈): ${lenses}
벤치마크 기업: ${bench}
지역 범위: ${cfg.region || '국내 중심'}

조사를 마치면, 아래 스키마에 정확히 맞는 JSON 객체 "하나만" 출력해줘. 코드펜스/설명/서론 없이 순수 JSON만, 마지막 출력이 그 JSON이어야 함.
스키마: ${SCHEMA}`;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--allowedTools', 'WebSearch,WebFetch'];
    const cp = spawn(CLAUDE_BIN, args, { cwd: __dirname });
    let out = '', err = '';
    cp.stdout.on('data', d => (out += d));
    cp.stderr.on('data', d => (err += d));
    cp.on('error', e => reject(new Error('claude 실행 실패(설치/PATH 확인): ' + e.message)));
    cp.on('close', code => {
      if (!out) return reject(new Error('claude 종료코드 ' + code + ': ' + (err.slice(0, 400) || '출력 없음')));
      resolve(out);
    });
  });
}

function extractReport(raw) {
  let text = raw;
  try { const env = JSON.parse(raw); if (env && typeof env.result === 'string') text = env.result; } catch (e) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('출력에서 REPORT JSON을 찾지 못했습니다');
  return JSON.parse(m[0]);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(INDEX_HTML));
  }
  if (req.method === 'GET' && req.url.startsWith('/report.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(REPORT_HTML));
  }
  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      try {
        const cfg = JSON.parse(body || '{}');
        if (BRIDGE_PASSWORD && cfg.password !== BRIDGE_PASSWORD) {
          res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: '접속 암호가 올바르지 않습니다.' }));
        }
        const today = new Date().toISOString().slice(0, 10);
        if (usage.date !== today) { usage.date = today; usage.count = 0; }
        if (DAILY_LIMIT > 0 && usage.count >= DAILY_LIMIT) {
          res.writeHead(429, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: '오늘 사용 한도(' + DAILY_LIMIT + '건)를 초과했습니다. 내일 다시 시도하세요.' }));
        }
        if (!cfg.area) throw new Error('영역(area)이 비었습니다');
        usage.count++;
        console.log('[generate] 영역:', cfg.area, '— claude -p 실행 중… (' + usage.count + '/' + DAILY_LIMIT + ')');
        const raw = await runClaude(buildPrompt(cfg));
        const report = extractReport(raw);
        console.log('[generate] 완료');
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, report }));
      } catch (e) {
        console.error('[generate] 오류:', e.message);
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('\n  신사업 발굴 — 로컬 브리지');
  console.log('  → http://localhost:' + PORT);
  console.log('  (Claude Code 구독 인증 + 내장 WebSearch 사용 · 종량 API 키 불필요)');
  console.log('  접속 암호: ' + (BRIDGE_PASSWORD ? '설정됨 ✅' : '없음 ⚠️ (외부 공개 시 BRIDGE_PASSWORD 환경변수로 꼭 설정)'));
  console.log('  일일 사용 한도: ' + (DAILY_LIMIT > 0 ? DAILY_LIMIT + '건' : '제한 없음'));
  console.log('  사전조건: claude CLI 설치 + 구독 로그인(claude 실행 후 /login)\n');
});
