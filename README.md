# Korean Dexter (한국형 덱스터)

한국 금융 시장을 위한 자율 AI 금융 리서치 에이전트

[English](#english) | [설치](#설치) | [빠른 시작](#빠른-시작) | [기여하기](CONTRIBUTING.md)

---

## 소개

Korean Dexter는 한국 금융 시장에 특화된 AI 금융 리서치 에이전트입니다. 자연어 질문을 받아 필요한 데이터를 자동으로 수집하고, 분석하여 인사이트를 제공합니다.

**주요 기능:**
- 🏢 **기업 정보 자동 조회**: 기업명 → 종목코드 자동 매핑 (자모 기반 퍼지 매칭)
- 📊 **재무제표 분석**: OpenDART 연동으로 공시 재무제표 실시간 조회
- 💹 **주가 및 시장 데이터**: KIS API로 실시간 주가, 거래량, 투자자별 순매수 조회
- 🤖 **자율 추론**: LLM 기반 계획 수립 및 다단계 도구 실행
- 🇰🇷 **한국어 네이티브**: 프롬프트, 오류 메시지, 도구 설명 모두 한국어 지원
- ⚡ **성능 최적화**: 레이트 리미팅, 캐싱, 토큰 예산 관리
- 🧪 **검증된 품질**: 375개 테스트, 1294개 assertion 통과

---

## 데모

```bash
$ bun start

질문을 입력하세요: 삼성전자 최근 실적 분석해줘

🔍 분석 중...

[1단계] 기업 식별
  - "삼성전자" → 종목코드: 005930, corp_code: 00126380

[2단계] 데이터 수집
  ├─ OpenDART: 2024년 4분기 연결재무제표 조회
  ├─ OpenDART: 최근 공시 내역 조회
  └─ KIS: 현재 주가 및 투자자별 매매동향 조회

[3단계] 분석 및 종합

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 삼성전자 2024년 4분기 실적 분석

【재무 성과】
  매출액:        67.4조원 (전년 동기 대비 -12.5%)
  영업이익:      6.6조원 (전년 동기 대비 -34.2%)
  영업이익률:    9.8%
  당기순이익:    5.7조원 (전년 동기 대비 -30.1%)

【부문별 실적】 (출처: 2024.10.31 사업보고서)
  - 반도체: 메모리 가격 하락으로 영업이익 감소
  - IM(모바일): 플래그십 모델 판매 호조로 수익성 개선
  - CE(가전): 프리미엄 제품군 확대로 양호한 실적 유지

【주가 동향】 (2026.02.17 15:30 기준)
  현재가:        72,500원
  거래량:        18.3백만주
  시가총액:      432.8조원
  외국인 보유율: 56.2%

【최근 공시】
  - 2026.02.10: 주주총회 소집 공고
  - 2026.01.31: 2024년 4분기 실적 공시

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 분석 완료 (소요시간: 3.2초, 토큰: 2,847)
```

---

## 설치

### 필요 조건
- **Bun** v1.0 이상 ([설치 가이드](https://bun.sh))
- **API 키**: OpenDART, KIS, LLM 제공자 중 1개 (Anthropic/OpenAI/Google)

### 설치 단계

```bash
# 1. 저장소 클론
git clone https://github.com/juuc/korean-dexter.git
cd korean-dexter

# 2. 의존성 설치
bun install

# 3. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력

# 4. 타입 체크
bun run typecheck

# 5. 테스트 실행
bun test

# 6. 시작!
bun start
```

---

## API 키 발급 안내

### 🔑 필수 API 키

| 서비스 | 용도 | 발급 링크 | 소요 시간 |
|--------|------|-----------|-----------|
| **OpenDART** | 재무제표, 공시 조회 | [opendart.fss.or.kr](https://opendart.fss.or.kr) | 회원가입 후 즉시 발급 |
| **KIS** | 주가, 거래량, 투자자 매매 | [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com) | 모의투자 계좌 개설 (5-10분) |

### 🤖 LLM 제공자 (택1)

| 제공자 | 추천 이유 | 발급 링크 |
|--------|-----------|-----------|
| **Google Gemini** ⭐ | 무료 티어, 빠른 속도, 한국어 우수 | [aistudio.google.com](https://aistudio.google.com) |
| **Anthropic Claude** | 최고 품질, 긴 컨텍스트 | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI GPT** | 안정적인 성능 | [platform.openai.com](https://platform.openai.com) |

### 📚 상세 가이드
API 키 발급에 어려움이 있다면 [docs/setup-guide.md](docs/setup-guide.md)를 참고하세요.

---

## 빠른 시작

```bash
# 에이전트 실행
bun start

# 개발 모드 (파일 변경 감지)
bun run dev

# 테스트 실행
bun test

# 타입 체크
bun run typecheck
```

### 예시 질문

```
삼성전자 최근 실적 분석해줘
SK하이닉스와 삼성전자 영업이익률 비교해줘
현대차 배당수익률 알려줘
카카오 주가 52주 최고가 대비 현재가 위치는?
```

---

## 사용 가능한 질문 유형

| 카테고리 | 예시 질문 | 사용 데이터 소스 |
|----------|-----------|------------------|
| **재무제표 분석** | "삼성전자 2024년 영업이익은?", "LG화학 부채비율 알려줘" | OpenDART |
| **주가 정보** | "네이버 현재 주가는?", "카카오 52주 최고가 대비 현재가 위치는?" | KIS |
| **투자자 동향** | "외국인이 최근 순매수한 종목은?", "기관 매매동향 보여줘" | KIS |
| **주주 현황** | "삼성전자 최대주주는?", "SK하이닉스 외국인 보유율은?" | OpenDART |
| **배당 정보** | "현대차 배당수익률 알려줘", "삼성전자 배당 이력은?" | OpenDART |
| **기업 비교** | "삼성전자와 SK하이닉스 영업이익률 비교", "매출 성장률 순위" | OpenDART + KIS |

---

## 아키텍처

```
User Question: "삼성전자 최근 실적 분석해줘"
     │
     ├─→ 🔍 Corp Code Resolver (삼성전자 → 00126380)
     │    └─ Jamo-based fuzzy matching with 3-char threshold
     │
     ├─→ 📊 Data Collection (parallel)
     │    ├─ OpenDART: 재무제표 (연결 우선), 공시, 주주현황
     │    └─ KIS: 주가, 거래량, 시가총액, 투자자별 순매수
     │
     ├─→ 🤖 Agent Planning & Reasoning (LLM)
     │    ├─ Self-validation with structured scratchpad
     │    └─ Multi-step tool execution with error recovery
     │
     └─→ ✨ Synthesized Analysis with Citations
          └─ Korean number formatting (조원/억원/만원)
```

**핵심 설계 원칙:**
- **Rate Limiting**: 모든 API 클라이언트에 기본 탑재 (OpenDART 10req/s, KIS 1req/s)
- **Caching**: 불변 데이터 영구 캐싱 (과거 재무제표, 종가 기록)
- **Error Recovery**: 연결재무제표 실패 시 별도재무제표 자동 폴백
- **Korean UX**: 에이전트 프롬프트, 오류 메시지, 도구 설명 모두 한국어

---

## 프로젝트 구조

```
src/
├── agent/              — 핵심 에이전트 루프
│   ├── agent.ts           — 메인 에이전트 루프 (ReAct 패턴)
│   ├── prompts.ts         — 한국어 시스템 프롬프트
│   ├── scratchpad.ts      — 사고 과정 기록 (관찰/추론/발견)
│   ├── tool-executor.ts   — 도구 실행 엔진
│   └── token-counter.ts   — 토큰 예산 관리
├── components/         — React Ink UI 컴포넌트
│   ├── Input.tsx, AnswerBox.tsx, DebugPanel.tsx
│   ├── ModelSelector.tsx, WorkingIndicator.tsx
│   └── AgentEventView.tsx, Intro.tsx
├── tools/              — 금융 API 도구
│   ├── core/
│   │   ├── opendart/      — OpenDART (재무제표, 공시, 주주, 배당)
│   │   └── kis/           — KIS (주가, 거래량, 투자자 동향, 장운영)
│   ├── descriptions/      — LLM용 한국어 도구 설명
│   ├── langchain-tools.ts — LangChain 도구 래퍼
│   └── error-messages.ts  — 한국어 에러 메시지
├── mapping/            — 기업 ID 매핑
│   ├── corp-code-resolver.ts — 기업명 → corp_code 변환
│   └── jamo.ts              — 초성 기반 퍼지 매칭
├── infra/              — 인프라
│   ├── rate-limiter.ts    — API 호출 속도 제한
│   └── cache.ts           — 불변 데이터 영구 캐싱
├── shared/             — 공유 유틸리티
│   ├── formatter.ts       — 한국 숫자 포맷터 (조/억/만원)
│   └── types.ts           — 공통 타입 정의
├── model/              — LLM 제공자 추상화 (Anthropic/OpenAI/Gemini)
├── skills/             — 확장 가능한 스킬 시스템
├── evals/              — 평가 프레임워크 (Phase 3)
├── utils/              — 유틸리티 (config, logger, hangul, tokens)
├── hooks/              — React hooks (useAgentRunner, useModelSelection)
├── cli.tsx             — CLI 진입점
├── index.tsx           — 앱 루트
├── providers.ts        — LLM 제공자 설정
└── theme.ts            — 터미널 컬러 테마
```

---

## 기술 스택

| 범주 | 기술 | 목적 |
|------|------|------|
| **런타임** | Bun v1.0+ | 고성능 JavaScript/TypeScript 런타임 |
| **언어** | TypeScript (strict mode) | 타입 안전성 |
| **UI** | React + Ink | 터미널 기반 인터랙티브 UI |
| **LLM** | LangChain | LLM 오케스트레이션 및 프롬프트 관리 |
| **제공자** | Anthropic Claude / OpenAI GPT / Google Gemini | LLM 추론 엔진 |
| **스키마** | Zod | 런타임 타입 검증 |
| **평가** | LangSmith | LLM 애플리케이션 추적 및 평가 |
| **테스트** | Bun Test / Jest | 단위/통합 테스트 |
| **외부 API** | OpenDART, KIS | 금융 데이터 소스 |

---

## 로드맵

### ✅ Phase 1: Foundation (완료)
- [x] Validate assumptions ([#1](https://github.com/juuc/korean-dexter/issues/1))
- [x] Competitive analysis ([#2](https://github.com/juuc/korean-dexter/issues/2))
- [x] Project scaffold ([#3](https://github.com/juuc/korean-dexter/issues/3))
- [x] Corp Code Resolver ([#4](https://github.com/juuc/korean-dexter/issues/4))
- [x] Cross-API data model ([#5](https://github.com/juuc/korean-dexter/issues/5))
- [x] Rate limiter ([#10](https://github.com/juuc/korean-dexter/issues/10))
- [x] Caching layer ([#11](https://github.com/juuc/korean-dexter/issues/11))

### ✅ Phase 2: Core Agent (완료)
- [x] OpenDART client ([#6](https://github.com/juuc/korean-dexter/issues/6))
- [x] KIS client ([#8](https://github.com/juuc/korean-dexter/issues/8))
- [x] AccountMapper ([#9](https://github.com/juuc/korean-dexter/issues/9))
- [x] System prompt ([#7](https://github.com/juuc/korean-dexter/issues/7))
- [x] Scratchpad recalibration ([#13](https://github.com/juuc/korean-dexter/issues/13))
- [x] Error handling ([#14](https://github.com/juuc/korean-dexter/issues/14))
- [x] CFS/OFS handling ([#15](https://github.com/juuc/korean-dexter/issues/15))

### 🔄 Phase 3: Evaluation & Observability (진행 중)
- [ ] Korean Q&A dataset ([#12](https://github.com/juuc/korean-dexter/issues/12))

### 📋 Phase 4: Extended Data (계획)
- [ ] Demo mode ([#19](https://github.com/juuc/korean-dexter/issues/19))
- [ ] BOK integration ([#16](https://github.com/juuc/korean-dexter/issues/16))
- [ ] KOSIS integration ([#17](https://github.com/juuc/korean-dexter/issues/17))
- [ ] BigKinds integration ([#18](https://github.com/juuc/korean-dexter/issues/18))

---

## 기여하기

Korean Dexter에 기여하고 싶으신가요? [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

---

## 라이선스

이 프로젝트는 [MIT License](LICENSE) 하에 배포됩니다.

---

## Upstream

이 프로젝트는 [virattt/dexter](https://github.com/virattt/dexter)에서 포크되어 한국 금융 시장에 특화되었습니다.

---

<div id="english"></div>

## English

**Korean Dexter** is an autonomous AI financial research agent specialized for the Korean market. It automatically collects and analyzes financial data from Korean sources (OpenDART, KIS) in response to natural language questions.

### What is Korean Dexter?

Korean Dexter extends the original [Dexter](https://github.com/virattt/dexter) project with:
- **Korean market integration**: OpenDART (financial statements), KIS (stock prices)
- **Native Korean support**: Prompts, error messages, and tool descriptions in Korean
- **Intelligent company resolution**: Fuzzy matching for Korean company names → stock codes
- **Financial formatting**: Automatic scaling to 조원 (trillion KRW), 억원 (hundred million), 만원 (ten thousand)
- **Production-ready**: Rate limiting, caching, error recovery, 375 passing tests

### Quick Install

```bash
git clone https://github.com/juuc/korean-dexter.git
cd korean-dexter
bun install
cp .env.example .env
# Edit .env with your API keys
bun start
```

### Required API Keys
- **OpenDART**: [opendart.fss.or.kr](https://opendart.fss.or.kr) (free, instant)
- **KIS**: [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com) (free paper trading account)
- **LLM**: Anthropic/OpenAI/Google (pick one) — **Google Gemini recommended** (free tier)

For detailed setup instructions in Korean, see [설치](#설치) and [API 키 발급 안내](#api-키-발급-안내).

### Tech Stack
Bun, TypeScript, React Ink, LangChain, Zod, LangSmith

### License
MIT © 2026 juuc
