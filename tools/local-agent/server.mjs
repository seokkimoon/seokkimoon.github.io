// 신사업 발굴 — 로컬 브리지 서버 (의존성 0, Node 18+)
// 오케스트레이터: 시장·경쟁·규제 3개 리서처 병렬(claude -p) → 종합 에이전트 → REPORT JSON → 리포트 렌더
// 구독(Claude Code) 인증·내장 WebSearch 사용, 종량 API 키 불필요.
// 비동기 작업: POST /generate → {jobId} 즉시 반환, GET /status?id=... 로 폴링.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4178;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const REPORT_HTML = join(__dirname, '..', '..', 'reports', 'report.html');
const INDEX_HTML = join(__dirname, 'public', 'index.html');
const BRIDGE_PASSWORD = process.env.BRIDGE_PASSWORD || '';
const DAILY_LIMIT = parseInt(process.env.BRIDGE_DAILY_LIMIT || '30', 10);
const TIMEOUT = parseInt(process.env.CLAUDE_TIMEOUT || '900000', 10); // 단일 claude 호출 최대 대기(기본 15분)
const usage = { date: '', count: 0 };
const jobs = new Map(); // jobId -> { state, steps, report, error, ts }

const SCHEMA = '{meta:{tag,title,subtitle,foot}, verdict:{badge:"조건부 Go|관망(Watch)|진입 보류(No-go) 중 한국어",text}, kpis:[{label,value,sub}](정확히 4개), scores:{labels:["시장 매력도","경쟁 우호도","규제 용이성","전략적 적합성"],values:[0~5 숫자 4개]}, summaryPoints:[문장 3~5], market:{sizes:{categories:[카테고리 2~3],y2024:[숫자],y2030:[숫자],unit:"예: 억 USD"},cagr:{labels:[3~4],values:[숫자 %]},funnel:[{t,v}](TAM,SAM,SOM 3개),drivers:[문장 4]}, competition:{players:[{n:이름,x:0~10 상용화성숙도,y:0~10 프리미엄,r:8~24 영향력,c:"#hex"}](4~8),forces:[{n,lvl:"높음|중간|낮음",v:0~100}](5개: 신규진입/공급자/구매자/대체재/기존경쟁),incumbents:[문장],players_table:[[기업,포지션,모델,상태,"hi|mid|lo"]]}, regulation:{flow:[{h,d}](4단계),checklist:[[경로,규제관문,핵심점검]](Build,Borrow,Buy)}, opinion:{reco:문장,bbbChart:{criteria:["실행 속도","자본 효율","역량 내재화","리스크 관리"],Build:[0~5 4개],Borrow:[4개],Buy:[4개]},bbb:[{name:"Build",tag,cls:"vt-no",note},{name:"Borrow",tag,cls:"vt-rec",note},{name:"Buy",tag,cls:"vt-opt",note}],nextSteps:[문장]}, sources:{"시장조사":[[제목,url]],"경쟁환경":[[제목,url]],"규제":[[제목,url]]}}';

const ctx = (cfg) => `영역: ${cfg.area}\n전략 관점(렌즈): ${(cfg.lenses || []).join(', ') || '제한 없음'}\n벤치마크 기업: ${(cfg.benchmarks || []).join(', ') || '없음'}\n지역 범위: ${cfg.region || '국내 중심'}`;

const marketPrompt = (cfg) => `당신은 한국 생명보험사 신사업추진파트의 '시장조사 리서처'다. WebSearch/WebFetch로 깊이 조사하라. 한국 1차 출처 우선(통계청·보험연구원(KIRI)·산업연구원·증권사 리포트·글로벌 리서치사). 모든 수치에 출처·연도를 병기하고 최소 8개 이상 출처를 확보하라. 한국어.

${ctx(cfg)}

다음을 빠짐없이 조사해 정보 밀도 높은 한국어 마크다운 리포트로 작성하라:
- 시장 정의와 규모(글로벌/국내, 연도·통화 명시)
- 성장률(CAGR)·향후 5년 전망
- 핵심 성장 동인
- 세그먼트(용도별/고객층별)
- 수요 트렌드
- TAM/SAM/SOM 추정(가정 명시)
끝에 '## 출처' 목록(제목 - URL)을 붙여라.`;

const compPrompt = (cfg) => `당신은 한국 생명보험사 신사업추진파트의 '경쟁환경 리서처'다. WebSearch/WebFetch로 깊이 조사하라. 출처는 DART 공시·IR·신뢰도 있는 언론·기업 공식. 수치엔 출처·연도, 최소 8개 출처. 한국어.

${ctx(cfg)}

다음을 빠짐없이 조사해 정보 밀도 높은 한국어 마크다운 리포트로 작성하라:
- 주요 플레이어 맵(국내·해외): 비즈니스 모델·점유율·상태
- 경쟁 다이내믹스(Porter 5 Forces)
- 향후 시나리오
- 경쟁사 진입 동향(타 보험사·통신·요양 등)
- 생명보험사 관점 시사점(유력 제휴 후보 등)
끝에 '## 출처' 목록(제목 - URL)을 붙여라.`;

const regPrompt = (cfg) => `당신은 한국 생명보험사 신사업추진파트의 '규제 리서처'다. 핵심 과제: 업계 규제 + 생명보험사 진입요건. WebSearch/WebFetch로 조사. 1차 출처 우선(금융위·금감원·국가법령정보 law.go.kr·식약처·KIRI). 한국어.

${ctx(cfg)}

다음을 빠짐없이 조사해 한국어 마크다운 리포트로 작성하라:
- 제품/업 자체 규제(해당 시 인허가·분류 등)
- 데이터·개인정보 규제(해당 시)
- 생명보험사 진입 규제: 보험업법 부수업무(제11조의2)/겸영업무(제11조), 자회사 출자·소유(제109·115조), 금융위·금감원 인허가, 건강증진형 보험상품 가이드라인 등
- Build/Borrow/Buy 경로별 규제 관문 체크리스트
'본 내용은 1차 의견이며 최종 법무·컴플라이언스 검토가 필요'함을 명시하라.
끝에 '## 출처' 목록(제목 - URL)을 붙여라.`;

const synthPrompt = (cfg, m, c, r) => `당신은 한국 생명보험사 신사업추진파트의 '진입의견 종합 에이전트'다. 아래 3개 도메인 리서치(시장/경쟁/규제)를 종합해 생보사 진입 관점의 진입 초기의견으로 정리하라. 시장매력도·경쟁강도·규제난이도·전략적 적합성을 평가하고 Go/Watch/No-go 권고와 Build/Borrow/Buy 방향을 도출하라.

반드시 아래 스키마에 "정확히" 맞는 JSON 객체 하나만 출력하라(코드펜스/설명/서론 없이, 순수 JSON). 모든 텍스트 한국어. 수치·출처는 도메인 리서치에서 그대로 인용해 채워라(특히 sources는 각 도메인의 '출처' 목록에서 가져와라).
스키마: ${SCHEMA}

${ctx(cfg)}

===== 시장 리서치 =====
${m}

===== 경쟁 리서치 =====
${c}

===== 규제 리서치 =====
${r}`;

function runClaudeText(prompt) {
  return new Promise((resolve, reject) => {
    // 프롬프트는 stdin으로 전달(인자 길이 한계·이스케이프 문제 회피).
    // Windows에서는 claude가 claude.cmd 이므로 cmd.exe /c 로 실행해 ENOENT 방지(shell:true 미사용 → 경고 없음).
    const args = ['-p', '--output-format', 'json', '--allowedTools', 'WebSearch,WebFetch'];
    const isWin = process.platform === 'win32';
    const cmd = isWin ? (process.env.ComSpec || 'cmd.exe') : CLAUDE_BIN;
    const cmdArgs = isWin ? ['/c', CLAUDE_BIN, ...args] : args;
    const cp = spawn(cmd, cmdArgs, { cwd: __dirname });
    let out = '', err = '', done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => {
      try { cp.kill(); } catch (e) {}
      finish(reject, new Error('시간 초과(' + Math.round(TIMEOUT / 60000) + '분 경과). 네트워크/claude 로그인 상태를 확인하세요.'));
    }, TIMEOUT);
    cp.stdout.on('data', d => (out += d));
    cp.stderr.on('data', d => (err += d));
    cp.on('error', e => finish(reject, new Error('claude 실행 실패(설치/PATH 확인): ' + e.message)));
    cp.on('close', code => {
      if (!out) return finish(reject, new Error('claude 종료코드 ' + code + ': ' + (err.slice(0, 400) || '출력 없음')));
      let text = out;
      try { const env = JSON.parse(out); if (env && typeof env.result === 'string') text = env.result; } catch (e) {}
      finish(resolve, text);
    });
    cp.stdin.on('error', () => {}); // EPIPE 무시
    cp.stdin.write(prompt);
    cp.stdin.end();
  });
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('종합 결과에서 REPORT JSON을 찾지 못했습니다');
  return JSON.parse(m[0]);
}

async function orchestrate(jobId, cfg) {
  const j = jobs.get(jobId);
  const tag = jobId.slice(0, 8);
  const logged = async (name, key, prompt) => {
    const t = Date.now();
    console.log('[' + tag + '] ' + name + ' 조사 시작...');
    const r = await runClaudeText(prompt);
    j.steps[key] = '완료';
    console.log('[' + tag + '] ' + name + ' 완료 (' + Math.round((Date.now() - t) / 1000) + '초)');
    return r;
  };
  try {
    j.steps.market = j.steps.competition = j.steps.regulation = '조사 중';
    const [m, c, r] = await Promise.all([
      logged('시장', 'market', marketPrompt(cfg)),
      logged('경쟁', 'competition', compPrompt(cfg)),
      logged('규제', 'regulation', regPrompt(cfg)),
    ]);
    j.steps.synth = '종합 중';
    console.log('[' + tag + '] 종합 시작...');
    const text = await runClaudeText(synthPrompt(cfg, m, c, r));
    j.report = extractJson(text);
    j.steps.synth = '완료';
    j.state = 'done';
    console.log('[' + jobId.slice(0, 8) + '] 완료:', cfg.area);
  } catch (e) {
    j.state = 'error';
    j.error = String(e.message || e);
    console.error('[' + jobId.slice(0, 8) + '] 오류:', j.error);
  }
}

const JSONH = { 'content-type': 'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(INDEX_HTML));
  }
  if (req.method === 'GET' && req.url.startsWith('/report.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(REPORT_HTML));
  }
  if (req.method === 'GET' && req.url.startsWith('/status')) {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const j = jobs.get(id);
    res.writeHead(j ? 200 : 404, JSONH);
    return res.end(JSON.stringify(j ? { state: j.state, steps: j.steps, error: j.error, report: j.state === 'done' ? j.report : null } : { error: 'no job' }));
  }
  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body || '{}');
        if (BRIDGE_PASSWORD && cfg.password !== BRIDGE_PASSWORD) {
          res.writeHead(401, JSONH);
          return res.end(JSON.stringify({ ok: false, error: '접속 암호가 올바르지 않습니다.' }));
        }
        const today = new Date().toISOString().slice(0, 10);
        if (usage.date !== today) { usage.date = today; usage.count = 0; }
        if (DAILY_LIMIT > 0 && usage.count >= DAILY_LIMIT) {
          res.writeHead(429, JSONH);
          return res.end(JSON.stringify({ ok: false, error: '오늘 사용 한도(' + DAILY_LIMIT + '건)를 초과했습니다. 내일 다시 시도하세요.' }));
        }
        if (!cfg.area) {
          res.writeHead(400, JSONH);
          return res.end(JSON.stringify({ ok: false, error: '영역을 입력하세요.' }));
        }
        usage.count++;
        const jobId = randomUUID();
        jobs.set(jobId, { state: 'running', steps: { market: '대기', competition: '대기', regulation: '대기', synth: '대기' }, report: null, error: null, ts: Date.now() });
        console.log('[' + jobId.slice(0, 8) + '] 시작:', cfg.area, '(' + usage.count + '/' + DAILY_LIMIT + ') — 3 리서처 병렬');
        orchestrate(jobId, cfg); // 비동기 실행
        res.writeHead(200, JSONH);
        res.end(JSON.stringify({ ok: true, jobId }));
      } catch (e) {
        res.writeHead(500, JSONH);
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('\n  신사업 발굴 — 로컬 브리지 (오케스트레이터: 3 리서처 병렬 + 종합)');
  console.log('  → http://localhost:' + PORT);
  console.log('  (Claude Code 구독 인증 + 내장 WebSearch · 종량 API 키 불필요)');
  console.log('  접속 암호: ' + (BRIDGE_PASSWORD ? '설정됨 ✅' : '없음 ⚠️ (외부 공개 시 BRIDGE_PASSWORD 환경변수로 꼭 설정)'));
  console.log('  일일 사용 한도: ' + (DAILY_LIMIT > 0 ? DAILY_LIMIT + '건' : '제한 없음') + ' · 1건당 claude -p 4회(병렬3+종합)');
  console.log('  사전조건: claude CLI 설치 + 구독 로그인(claude 실행 후 /login)\n');
});
