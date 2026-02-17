# 아키텍처 (Architecture)

## 개요 (Overview)

Korean Dexter는 한국 주식 시장을 위한 자율 AI 금융 리서치 에이전트입니다. 사용자의 자연어 질문을 분석하여 필요한 금융 데이터를 자동으로 수집하고, 여러 데이터 소스를 종합하여 답변을 제공하는 에이전트 시스템입니다.

**핵심 특징:**
- **자율성**: LLM 기반 추론으로 도구 호출 계획 수립
- **한국 시장 특화**: 연결재무제표 우선, 조원/억원 표기, 한국어 프롬프트
- **다중 데이터 소스**: OpenDART (재무제표, 공시) + KIS API (주가, 시세) + BOK ECOS (경제지표) + KOSIS (국가통계)
- **실시간 터미널 UI**: React Ink 기반 대화형 인터페이스

---

## 시스템 아키텍처 (System Architecture)

```
┌─────────────────────────────────────────────────┐
│                  사용자 (User)                    │
│            "삼성전자 최근 실적 분석해줘"             │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              CLI Layer (React Ink)               │
│  src/components/ + src/cli.tsx                   │
│  ┌─────────────────────────────────────────┐   │
│  │ ModelSelector    WorkingIndicator       │   │
│  │ InputBox         AgentEventView         │   │
│  │ AnswerBox        DebugPanel             │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              Agent Loop (src/agent/)             │
│                                                 │
│  1. Parse query → Resolve company (mapping/)    │
│  2. Plan tool calls (LLM reasoning)             │
│  3. Execute tools (tool-executor.ts)            │
│  4. Update scratchpad (scratchpad.ts)           │
│  5. Self-validate → Synthesize answer           │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ System Prompt (Korean)                  │   │
│  │ Token Budget Manager                    │   │
│  │ Scratchpad (accumulate findings)        │   │
│  │ Validation Loop                         │   │
│  └─────────────────────────────────────────┘   │
└──────┬──────────────────────────────┬───────────┘
       │                              │
       ▼                              ▼
┌──────────────────┐         ┌──────────────────┐
│    OpenDART      │         │     KIS API      │
│ tools/core/      │         │  tools/core/     │
│   opendart/      │         │    kis/          │
│                  │         │                  │
│  - 재무제표       │         │  - 주가/시세      │
│  - 공시정보       │         │  - 거래량         │
│  - 주주현황       │         │  - 투자자 동향    │
│  - 배당내역       │         │  - 시장 지수      │
│                  │         │  - 종목 검색      │
└──────────────────┘         └──────────────────┘
       │                              │
       ▼                              ▼
┌──────────────────┐         ┌──────────────────┐
│   BOK ECOS       │         │     KOSIS        │
│ tools/core/      │         │  tools/core/     │
│   bok/           │         │    kosis/        │
│                  │         │                  │
│  - 기준금리       │         │  - 인구통계       │
│  - 환율          │         │  - 고용통계       │
│  - GDP/CPI      │         │  - 산업동향       │
│  - 통화량(M2)    │         │  - 무역통계       │
└──────────────────┘         └──────────────────┘
       │                              │
       ▼                              ▼
┌─────────────────────────────────────────────────┐
│              Infrastructure (src/infra/)          │
│                                                 │
│  Rate Limiter    Cache         Logger           │
│  (per-API)      (immutable)    (debug)          │
└─────────────────────────────────────────────────┘
```

---

## 에이전트 루프 (Agent Loop)

에이전트 시스템의 핵심 실행 흐름은 다음과 같습니다.

### 1. 시스템 프롬프트 (System Prompt)

`src/agent/prompts.ts`에서 정의된 한국어 시스템 프롬프트가 LLM에 제공됩니다:

```typescript
당신은 한국 주식 시장 전문 금융 리서치 에이전트입니다.
사용 가능한 도구를 활용하여 사용자의 질문에 답변하세요.

[주요 규칙]
- 금액은 항상 조원/억원/만원 단위로 표시
- 재무제표는 연결(CFS) 우선, 없으면 별도(OFS) 사용
- 도구 호출 결과를 스크래치패드에 기록
- 답변 전 자가 검증 수행
```

### 2. 토큰 예산 관리 (Token Budget Management)

한국어 텍스트는 영어 대비 약 2배의 토큰을 소비합니다. 이를 고려하여:

- **기본 예산**: 4000 토큰
- **스크래치패드 압축**: 3500 토큰 초과 시 요약
- **도구 설명 최적화**: 한국어 도구 설명을 간결하게 유지

`src/agent/token-counter.ts` 참조.

### 3. 스크래치패드 패턴 (Scratchpad Pattern)

에이전트는 여러 도구 호출을 통해 수집한 정보를 스크래치패드에 누적합니다:

```typescript
interface Scratchpad {
  thoughts: string[];      // 추론 과정
  observations: string[];  // 도구 실행 결과
  findings: string[];      // 핵심 발견사항
}
```

**흐름:**
1. 도구 호출 → 결과를 `observations`에 추가
2. LLM이 결과 분석 → `thoughts`에 추론 기록
3. 중요 정보 추출 → `findings`에 저장
4. 다음 도구 호출 계획 또는 최종 답변 생성

### 4. 자가 검증 (Self-Validation)

최종 답변 생성 전, 에이전트는 다음을 확인합니다:

- [ ] 질문의 모든 부분에 답변했는가?
- [ ] 데이터 출처가 명확한가? (날짜, 보고서명)
- [ ] 금액 표기가 올바른가? (조원/억원)
- [ ] 연결/별도 구분이 명확한가?

검증 실패 시 추가 도구 호출 또는 답변 재작성.

### 5. 최종 답변 합성 (Final Answer Synthesis)

스크래치패드의 정보를 바탕으로 구조화된 답변 생성:

```markdown
[답변]
- 핵심 지표 요약
- 상세 분석
- 출처 표기

[출처]
- OpenDART 사업보고서 (2024년 12월 31일)
- KIS API 주가 데이터 (2025-01-15)
- BOK ECOS 기준금리 (2025-01-15)
- KOSIS 경제활동인구조사 (2024년)
```

---

## 도구 시스템 (Tool System)

### 도구 레지스트리 (Tool Registry)

`src/tools/registry.ts`에서 모든 도구를 중앙 관리:

```typescript
export const toolRegistry = {
  // OpenDART 도구
  'get_financial_statements': getFinancialStatementsTool,
  'get_company_info': getCompanyInfoTool,

  // KIS API 도구
  'get_stock_price': getStockPriceTool,
  'get_historical_prices': getHistoricalPricesTool,
  'get_market_index': getMarketIndexTool,

  // BOK ECOS 도구
  'get_economic_indicator': getEconomicIndicatorTool,
  'get_key_statistics': getKeyStatisticsTool,
  'search_bok_tables': searchBokTablesTool,

  // KOSIS 도구
  'get_kosis_data': getKosisDataTool,
  'search_kosis_tables': searchKosisTablesTool,
};
```

### LangChain 도구 래퍼 (Tool Wrappers)

`src/tools/langchain-tools.ts`에서 LangChain의 `Tool` 인터페이스로 감싸서 에이전트에 제공:

```typescript
export const koreanFinancialTools = [
  new DartFinancialStatementsTool(),
  new KisStockPriceTool(),
  // ...
];
```

### 한국어 도구 설명 (Korean Tool Descriptions)

`src/tools/descriptions/korean-tools.ts`에서 LLM이 이해하기 쉬운 한국어 설명 제공:

```typescript
{
  name: 'get_financial_statements',
  description: `
    기업의 재무제표를 조회합니다.
    - 연결재무제표(CFS) 우선, 없으면 별도재무제표(OFS)
    - 매개변수: corp_code (8자리), year (YYYY), report_type (11011: 사업보고서)
  `,
  parameters: { ... }
}
```

### 한국어 에러 메시지 (Error Messages)

`src/tools/error-messages.ts`에서 사용자 친화적인 한국어 에러 메시지:

```typescript
export const ErrorMessages = {
  CORP_CODE_NOT_FOUND: '해당 기업을 찾을 수 없습니다. 정확한 기업명을 입력해주세요.',
  RATE_LIMIT_EXCEEDED: 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
  MARKET_CLOSED: '장 마감 시간입니다. 실시간 데이터는 다음 영업일에 제공됩니다.',
};
```

---

## 회사 코드 매핑 (Company Code Mapping)

### Corp Code Resolver

OpenDART API는 주식 코드가 아닌 8자리 `corp_code`를 사용합니다. 사용자가 "삼성전자"라고 입력하면 `00126380`으로 변환해야 합니다.

**위치**: `src/mapping/corp-code-resolver.ts`

```typescript
interface CorpCodeMapping {
  corp_name: string;      // "삼성전자주식회사"
  corp_code: string;      // "00126380"
  stock_code: string;     // "005930"
  modify_date: string;    // "20250115"
}
```

### 자모 분해 기반 퍼지 매칭 (Jamo Fuzzy Matching)

사용자가 "삼성" 또는 "ㅅㅅ"만 입력해도 "삼성전자"를 찾을 수 있도록 초성 검색 지원:

```typescript
// "삼성전자" → ["ㅅㅅㅈㅈ"]
function decomposeToJamo(text: string): string {
  // 한글 자모 분해 로직
}

// "삼성" 검색 → "삼성전자", "삼성물산", "삼성중공업" 매칭
```

**위치**: `src/mapping/jamo.ts`

### 부트스트랩 (Bootstrap)

OpenDART에서 제공하는 `CORPCODE.zip` 파일을 다운로드하여 로컬 DB 구축:

```bash
bun run scripts/bootstrap-corp-codes.ts
```

**출력**: `data/corp-codes.json` (15,000+ 기업 매핑 데이터)

---

## 인프라 (Infrastructure)

### Rate Limiter

각 API별로 독립적인 Rate Limiter 설정:

```typescript
// OpenDART: 10,000 req/day
const dartLimiter = new RateLimiter({
  tokensPerInterval: 10000,
  interval: 'day'
});

// KIS API: 1 req/sec
const kisLimiter = new RateLimiter({
  tokensPerInterval: 1,
  interval: 'second'
});
```

**위치**: `src/infra/rate-limiter.ts`

### Cache

**영구 캐싱 (Immutable Data)**:
- 과거 재무제표 (2023년 사업보고서 등)
- 종가 확정된 과거 주가 데이터

**TTL 캐싱 (Recent Data)**:
- 실시간 주가: 60초 TTL
- 최근 공시: 300초 TTL

```typescript
interface CacheEntry {
  key: string;
  value: any;
  ttl?: number;        // undefined = 영구 캐싱
  createdAt: number;
}
```

**위치**: `src/infra/cache.ts`

### Logger

디버깅용 상세 로깅:

```typescript
logger.debug('Tool execution', {
  tool: 'get_financial_statements',
  params: { corp_code: '00126380', year: '2024' },
  duration: 234,
  cached: false
});
```

**출력**: `logs/dexter-YYYY-MM-DD.log`

---

## LLM 프로바이더 추상화 (LLM Provider Abstraction)

### 통합 인터페이스

`src/model/llm.ts`에서 모든 LLM 프로바이더를 통합:

```typescript
export interface LLMProvider {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
  stream(prompt: string, options?: LLMOptions): AsyncIterable<string>;
}

export class UnifiedLLM implements LLMProvider {
  private provider: 'anthropic' | 'openai' | 'gemini';

  constructor(provider: string) {
    this.provider = provider;
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    switch (this.provider) {
      case 'anthropic':
        return this.generateAnthropic(prompt, options);
      case 'openai':
        return this.generateOpenAI(prompt, options);
      case 'gemini':
        return this.generateGemini(prompt, options);
    }
  }
}
```

### 런타임 모델 선택

UI에서 사용자가 프로바이더 변경 가능:

```
┌─ Model ──────────────────┐
│ ● Claude 3.5 Sonnet      │
│ ○ GPT-4                  │
│ ○ Gemini 1.5 Pro         │
└──────────────────────────┘
```

**환경 변수**:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`

---

## 한국 시장 특화 설계 (Korean Market Design Decisions)

### 1. 연결재무제표 우선 (CFS over OFS)

한국 상장사는 **연결재무제표**(Consolidated Financial Statements)와 **별도재무제표**(Separate Financial Statements)를 모두 공시합니다. 대부분의 분석에서는 **연결재무제표**가 더 중요합니다.

**로직**:
```typescript
async function getFinancialStatements(corpCode: string, year: string) {
  // 1. 연결재무제표 시도 (reprt_code: 11011, fs_div: CFS)
  let data = await fetchDartAPI({ corp_code: corpCode, bsns_year: year, fs_div: 'CFS' });

  // 2. 연결재무제표가 없으면 별도재무제표 (fs_div: OFS)
  if (!data || data.length === 0) {
    data = await fetchDartAPI({ corp_code: corpCode, bsns_year: year, fs_div: 'OFS' });
    console.warn(`[CFS not found] Using OFS for ${corpCode}`);
  }

  return data;
}
```

### 2. 한국어 숫자 표기법 (Korean Number Formatting)

한국 금융 시장에서는 원(WON) 단위를 그대로 표기하지 않고 **조원**(trillion), **억원**(100 million), **만원**(10 thousand) 단위로 표기합니다.

**변환 로직**:
```typescript
function formatKoreanCurrency(amount: number): string {
  if (amount >= 1_000_000_000_000) {
    return `${(amount / 1_000_000_000_000).toFixed(2)}조원`;
  } else if (amount >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(0)}억원`;
  } else if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(0)}만원`;
  } else {
    return `${amount}원`;
  }
}

// 예시
formatKoreanCurrency(3_500_000_000_000);  // "3.50조원"
formatKoreanCurrency(123_000_000);        // "123억원"
```

**위치**: `src/shared/formatter.ts`

### 3. 토큰 예산 재조정 (Token Budget Recalibration)

한국어 텍스트는 영어 대비 약 **2배**의 토큰을 소비합니다:

- 영어: "Samsung Electronics" → 2 토큰
- 한국어: "삼성전자주식회사" → 4 토큰

이를 고려하여 기본 토큰 예산을 **4000 토큰**으로 설정하고, 스크래치패드는 **3500 토큰 초과 시** 요약합니다.

**참고**: `src/agent/token-counter.ts`

### 4. 한국어 에이전트 프롬프트 (Korean Agent Prompts)

금융 용어는 한국어가 더 자연스럽고 정확합니다:

- "당기순이익" (Net Income for the Period)
- "영업활동현금흐름" (Cash Flow from Operating Activities)
- "자본총계" (Total Equity)

**시스템 프롬프트 예시**:
```
당신은 한국 주식 시장 전문 금융 리서치 에이전트입니다.

[재무 데이터 해석 시 주의사항]
- "당기순이익"은 지배주주 순이익을 의미합니다.
- "영업이익"은 매출액에서 매출원가와 판관비를 뺀 값입니다.
- "EBITDA"는 영업이익 + 감가상각비로 계산합니다.
```

### 5. 장 마감 인식 (Market Hours Awareness)

KIS API는 실시간 데이터를 제공하지만, **장 마감 후**에는 데이터가 업데이트되지 않습니다.

```typescript
function isMarketOpen(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // 주말 제외
  if (day === 0 || day === 6) return false;

  // 평일 09:00 ~ 15:30
  if (hour >= 9 && hour < 15) return true;
  if (hour === 15 && now.getMinutes() <= 30) return true;

  return false;
}
```

장 마감 시 에러 메시지:
```
"장 마감 시간입니다. 실시간 데이터는 다음 영업일 09:00부터 제공됩니다."
```

---

## 디렉토리 구조 (Directory Structure)

```
korean-dexter/
├── src/
│   ├── agent/              # 에이전트 코어 로직
│   │   ├── agent.ts           # 메인 에이전트 루프
│   │   ├── prompts.ts         # 한국어 시스템 프롬프트
│   │   ├── scratchpad.ts      # 사고 과정 기록
│   │   ├── tool-executor.ts   # 도구 실행 엔진
│   │   └── token-counter.ts   # 토큰 예산 관리
│   ├── tools/              # 도구 정의
│   │   ├── core/
│   │   │   ├── opendart/      # OpenDART 도구
│   │   │   └── kis/           # KIS API 도구
│   │   ├── descriptions/      # 한국어 도구 설명
│   │   ├── langchain-tools.ts
│   │   └── error-messages.ts
│   ├── mapping/            # 회사 코드 매핑
│   │   ├── corp-code-resolver.ts
│   │   └── jamo.ts            # 초성 기반 퍼지 매칭
│   ├── model/              # LLM 추상화
│   │   └── llm.ts
│   ├── infra/              # 인프라
│   │   ├── rate-limiter.ts
│   │   └── cache.ts
│   ├── shared/             # 공유 유틸리티
│   │   └── formatter.ts       # 한국어 숫자 포맷팅
│   ├── components/         # React Ink UI 컴포넌트
│   ├── hooks/              # React hooks
│   ├── skills/             # 확장 가능한 스킬 시스템
│   ├── evals/              # 평가 프레임워크
│   │   ├── dataset/           # 50개 Q&A 데이터셋
│   │   ├── fixtures/          # 결정론적 리플레이 시스템
│   │   ├── scorers/           # 수치/LLM 채점기
│   │   ├── components/        # 평가 터미널 UI
│   │   └── run.ts             # 평가 러너
│   ├── utils/              # config, logger, hangul, tokens
│   ├── cli.tsx             # CLI 진입점
│   └── index.tsx           # 앱 루트
├── scripts/
│   └── bootstrap-corp-codes.ts
└── docs/                   # 문서
```

---

## 데이터 흐름 예시 (Example Data Flow)

**사용자 질문**: "삼성전자 최근 실적 분석해줘"

1. **CLI Layer** (React Ink)
   - 사용자 입력 수신
   - 에이전트 루프 시작

2. **Agent Loop**
   - 시스템 프롬프트 + 사용자 질문 → LLM
   - LLM 추론: "삼성전자의 최근 재무제표와 주가가 필요하다"

3. **Corp Code Resolution**
   - "삼성전자" → `corp_code: 00126380`, `stock_code: 005930`

4. **Tool Execution** (병렬)
   - `get_financial_statements(corp_code=00126380, year=2024, fs_div=CFS)`
   - `get_stock_price(stock_code=005930)`

5. **Scratchpad Update**
   ```
   [관찰]
   - 2024년 매출액: 258조원 (연결기준)
   - 영업이익: 45조원
   - 현재 주가: 73,000원

   [추론]
   - 전년 대비 매출 3% 증가
   - 영업이익률 17.4% 유지
   ```

6. **Self-Validation**
   - ✅ 재무 데이터 확보
   - ✅ 주가 데이터 확보
   - ✅ 출처 명확

7. **Final Answer**
   ```
   [삼성전자 최근 실적 분석]

   1. 재무 실적 (2024년 사업보고서, 연결기준)
      - 매출액: 258조원 (전년 대비 +3%)
      - 영업이익: 45조원 (영업이익률 17.4%)
      - 당기순이익: 32조원

   2. 주가 (2025-01-15 종가 기준)
      - 현재가: 73,000원

   [출처]
   - OpenDART 사업보고서 (2024년 12월 31일)
   - KIS API 주가 데이터 (2025-01-15)
   ```

---

## 확장성 고려사항 (Scalability Considerations)

### 1. 새로운 데이터 소스 추가

새로운 API를 추가하려면 (BOK ECOS, KOSIS 구현 패턴 참고):

1. `src/tools/core/{api}/` 디렉토리 생성 (`types.ts`, `client.ts`, `tools.ts`, `tools.test.ts`)
2. Client 클래스 구현 (`ClientLike` 인터페이스 + rate limiter + two-tier cache)
3. `src/tools/descriptions/{api}-tools.ts`에 한국어 설명 추가
4. `src/tools/langchain-tools.ts`에 LangChain 도구 팩토리 + 조건부 등록
5. `src/utils/env.ts`에 API key 체크 함수 추가
6. `src/infra/rate-limiter.ts`의 `API_RATE_LIMITS`에 설정 추가

### 2. 새로운 LLM 프로바이더 추가

`src/model/llm.ts`에서 `UnifiedLLM` 클래스 확장:

```typescript
case 'cohere':
  return this.generateCohere(prompt, options);
```

### 3. 멀티턴 대화 지원

현재는 단일 질문-답변 구조이지만, 대화 히스토리를 추가하려면:

```typescript
interface ConversationHistory {
  role: 'user' | 'assistant';
  content: string;
}

const history: ConversationHistory[] = [];
```

---

## 성능 최적화 (Performance Optimization)

1. **병렬 도구 호출**: 독립적인 도구는 `Promise.all()`로 병렬 실행
2. **캐시 우선**: 불변 데이터는 영구 캐싱
3. **스트리밍 응답**: LLM 스트리밍으로 사용자 대기 시간 단축
4. **Rate Limiter**: API 호출 실패 방지

---

## 보안 고려사항 (Security Considerations)

1. **API 키 관리**: `.env` 파일에 보관, 절대 커밋 금지
2. **입력 검증**: SQL Injection 등 방지 (현재 API 호출만 있어 해당 없음)
3. **Rate Limiting**: DoS 방지
4. **에러 메시지**: 내부 정보 노출 방지

---

## 테스트 전략 (Testing Strategy)

현재 **375개** 테스트 통과:

1. **단위 테스트**: 각 도구별 입력/출력 검증
2. **통합 테스트**: 에이전트 루프 전체 흐름
3. **E2E 테스트**: 실제 API 호출 포함 (CI에서는 mock)

```bash
bun test                    # 전체 테스트
bun test src/tools/dart     # OpenDART 도구만
bun test src/agent          # 에이전트 로직만
```

---

## 기여 가이드 (Contributing)

아키텍처 변경 시 고려사항:

1. **한국 시장 특화 유지**: 조원/억원 표기, 연결재무제표 우선 등
2. **토큰 효율성**: 한국어 텍스트 길이 고려
3. **캐시 전략**: 불변 데이터는 영구 캐싱
4. **타입 안전성**: `any` 사용 금지, 엄격한 타입 체크

---

## 참고 자료 (References)

- [OpenDART API 문서](https://opendart.fss.or.kr/guide/main.do)
- [KIS API 문서](https://apiportal.koreainvestment.com/)
- [LangChain 공식 문서](https://js.langchain.com/)
- [React Ink 문서](https://github.com/vadimdemedes/ink)

---

## 평가 프레임워크 (Evaluation Framework)

### 개요

Korean Dexter는 에이전트 품질을 측정하기 위한 이중 채점 평가 시스템을 포함합니다.

```
User Question → Agent (with fixtures or live APIs) → Answer
                                                      ↓
                                            ┌─────────────────┐
                                            │  Scoring Router  │
                                            └────────┬────────┘
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                                 ▼
                          Numerical Scorer                    LLM-as-Judge
                     (조원/억원/만원 파싱,                  (5점 척도 루브릭,
                      허용 오차 비교)                       환각 감지)
                                    │                                 │
                                    └────────────────┬────────────────┘
                                                     ▼
                                              LangSmith 로깅
```

### 주요 컴포넌트

| 컴포넌트 | 파일 | 설명 |
|----------|------|------|
| **데이터셋** | `evals/dataset/finance_agent.csv` | 50개 검증 질문 (7 카테고리, 10+ 기업) |
| **Fixture 시스템** | `evals/fixtures/` | API 응답 녹화/재생으로 결정론적 평가 |
| **수치 채점기** | `evals/scorers/numerical.ts` | 한국어 금액 역파싱 + 허용 오차 비교 |
| **LLM 채점기** | `evals/run.ts` | 5점 척도 (0/0.25/0.5/0.75/1.0) + 환각 감지 |
| **터미널 UI** | `evals/components/` | 실시간 진행률, 3단계 결과 표시 (✓/△/✗) |

### 채점 라우팅

CSV의 `scoring_method` 컬럼에 따라 자동 라우팅:

- `numerical` → 수치 채점기 (조원/억원/만원/배/% 파싱, 허용 오차 비교)
- `llm_judge` → LLM-as-Judge (GPT-5.2, 5점 루브릭)

### CLI 명령어

```bash
bun run eval                                    # Fixture 모드 (기본)
bun run eval:live                               # 실시간 API 모드
bun run eval --sample 10                        # 랜덤 10개 샘플
bun run eval --category quantitative_retrieval  # 카테고리 필터링
bun run eval:record                             # 새 fixture 녹화
```
