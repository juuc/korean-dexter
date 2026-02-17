# 개발 가이드 (Development Guide)

Korean Dexter 개발자를 위한 가이드입니다.

## 로컬 실행 (Running Locally)

### 인터랙티브 CLI

```bash
# 표준 실행
bun start

# Watch 모드 (코드 변경 시 자동 재시작)
bun dev
```

터미널에서 질문을 입력하면 에이전트가 도구를 호출하며 답변을 생성합니다.

**예시 질문**:
- "삼성전자의 2024년 매출액은?"
- "SK하이닉스 최근 주가 알려줘"
- "현대차와 기아의 영업이익률 비교해줘"

### 헤드리스 모드 (디버깅용)

UI 없이 쿼리를 실행하려면:

```bash
bun run scripts/test-query.ts "삼성전자 2024년 매출액"
```

디버그 로그가 콘솔에 출력되어 도구 호출 과정을 추적할 수 있습니다.

**유용한 경우**:
- CI/CD 파이프라인에서 테스트
- 에이전트 로직 디버깅
- 성능 벤치마킹
- LLM 프롬프트 실험

## 테스트 (Testing)

### 테스트 구조

모든 테스트는 소스 파일과 같은 디렉토리에 `*.test.ts` 패턴으로 작성됩니다.

```
src/
├── agent/
│   ├── prompts.ts
│   └── prompts.test.ts          # 프롬프트 생성 테스트
├── mapping/
│   ├── corp-code-resolver.ts
│   └── corp-code-resolver.test.ts  # 기업 코드 매핑 테스트
├── shared/
│   ├── formatter.ts
│   └── formatter.test.ts        # 숫자 포맷팅 테스트
└── tools/core/opendart/
    ├── client.ts
    ├── client.test.ts           # API 클라이언트 테스트
    ├── tools.ts
    └── tools.test.ts            # 도구 통합 테스트
```

**현재 상태**: 15개 테스트 파일, 375개 테스트 통과

### 테스트 실행

```bash
# 모든 테스트 실행
bun test

# 특정 파일만 테스트
bun test src/shared/formatter.test.ts

# 특정 디렉토리만 테스트
bun test src/tools/core/opendart

# Watch 모드 (파일 변경 시 자동 재실행)
bun test --watch
```

### 주요 테스트 카테고리

| 테스트 파일 | 테스트 대상 |
|------------|------------|
| `agent/prompts.test.ts` | 한국어 프롬프트 생성, 토큰 예산 준수 |
| `mapping/corp-code-resolver.test.ts` | 기업명 → corp_code 변환, 퍼지 매칭 |
| `mapping/jamo.test.ts` | 초성 검색 정확도 |
| `infra/cache.test.ts` | 캐싱 동작, TTL 관리 |
| `infra/rate-limiter.test.ts` | API 호출 속도 제한 |
| `shared/formatter.test.ts` | 조원/억원/만원 포맷팅 |
| `tools/core/opendart/*.test.ts` | OpenDART API 통합, 재무제표 파싱 |
| `tools/core/kis/*.test.ts` | KIS API 통합, 주가 데이터 처리 |
| `tools/error-messages.test.ts` | 한국어 에러 메시지 생성 |
| `utils/tokens.test.ts` | 토큰 카운팅, 한국어 multiplier |

### 테스트 작성 팁

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';

describe('MyFeature', () => {
  beforeEach(() => {
    // 테스트 전 초기화
  });

  test('should handle Korean company names', () => {
    const result = resolver.resolve('삼성전자');
    expect(result).toEqual({
      corpCode: '00126380',
      corpName: '삼성전자',
    });
  });

  test('should format billions correctly', () => {
    const formatted = formatKoreanNumber(1500000000000);
    expect(formatted).toBe('1.5조원');
  });
});
```

## 타입 체크 (Type Checking)

```bash
# 전체 프로젝트 타입 체크
bun run typecheck

# 파일 저장 시 자동 체크 (에디터 설정)
# VSCode: TypeScript Language Features 활성화
```

**중요**: Pre-commit hook이 자동으로 타입 체크를 실행합니다. `any` 타입 사용 시 커밋이 차단됩니다.

## 프로젝트 아키텍처 (Architecture)

### 에이전트 실행 흐름

```
사용자 질문
    ↓
1. 기업명 인식 및 corp_code 변환
   ("삼성전자" → corp_code: "00126380")
    ↓
2. LLM 추론 (도구 선택 및 파라미터 결정)
    ↓
3. 도구 실행 (OpenDART/KIS API 호출)
    ↓
4. 결과 스크래치패드에 기록
    ↓
5. LLM이 결과 종합하여 한국어 답변 생성
    ↓
최종 답변 출력
```

### 핵심 컴포넌트

#### Agent Loop (`src/agent/agent.ts`)

ReAct 패턴 구현:
1. **Reasoning**: LLM이 다음 액션 결정
2. **Action**: 도구 호출
3. **Observation**: 결과 관찰
4. 수렴할 때까지 반복

#### Scratchpad (`src/agent/scratchpad.ts`)

에이전트의 사고 과정을 기록:
- 도구 호출 히스토리
- 관찰 결과
- 중간 추론

토큰 예산 관리로 컨텍스트 윈도우 초과 방지.

#### Tool Executor (`src/agent/tool-executor.ts`)

도구 호출을 안전하게 실행:
- 에러 핸들링
- Rate limiting 준수
- 한국어 에러 메시지 반환

#### Token Counter (`src/agent/token-counter.ts`)

한국어 텍스트는 영어보다 약 2배의 토큰을 소비하므로 예산을 동적으로 조정합니다.

```typescript
// 한국어 multiplier 적용
const koreanTokens = baseTokens * KOREAN_TEXT_MULTIPLIER; // 2.0
```

### 데이터 흐름

```
UI Layer (React Ink)
    ↓
Agent Layer (ReAct loop)
    ↓
Tools Layer (LangChain tools)
    ↓
API Clients (OpenDART/KIS)
    ↓
Infra Layer (Rate limiter + Cache)
    ↓
External APIs
```

## 디버깅 (Debugging)

### DebugPanel 컴포넌트

인터랙티브 CLI에서 `d` 키를 눌러 디버그 패널을 토글할 수 있습니다.

**표시 정보**:
- 현재 LLM 모델
- 도구 호출 히스토리
- 스크래치패드 내용
- 토큰 사용량
- API 호출 로그

### Logger 유틸리티

```typescript
import { logger } from '@/utils/logger';

logger.debug('Corp code resolved', { corpCode, corpName });
logger.info('API call successful');
logger.warn('Rate limit approaching');
logger.error('API call failed', { error });
```

로그는 콘솔과 파일(`logs/app.log`)에 모두 기록됩니다.

### 헤드리스 디버깅

```bash
# 상세 로그와 함께 실행
DEBUG=* bun run scripts/test-query.ts "질문"

# 특정 모듈만 디버그
DEBUG=opendart:* bun run scripts/test-query.ts "질문"
```

### 일반적인 디버깅 시나리오

| 문제 | 디버깅 방법 |
|------|-----------|
| 기업명 인식 실패 | `mapping/corp-code-resolver.test.ts` 실행, 초성 매칭 확인 |
| API 호출 실패 | `tools/core/{api}/client.test.ts` 실행, API 키 확인 |
| 금액 포맷팅 오류 | `shared/formatter.test.ts` 실행, 스케일 로직 확인 |
| 토큰 예산 초과 | `agent/token-counter.ts` 로그 확인, multiplier 조정 |
| 재무제표 데이터 없음 | OpenDART API 응답 확인, CFS/OFS fallback 동작 확인 |

## 토큰 예산 (Token Budget)

### 한국어 텍스트의 특성

한국어는 UTF-8로 인코딩되며, 영어보다 약 **2배의 토큰**을 소비합니다.

```typescript
// 영어: "Samsung Electronics" ≈ 3 tokens
// 한국어: "삼성전자" ≈ 6 tokens
```

### 토큰 예산 관리

`src/agent/token-counter.ts`에서 스크래치패드 크기를 동적으로 조정:

```typescript
const MAX_SCRATCHPAD_TOKENS = 4000; // Claude-3.5 기준
const KOREAN_TEXT_MULTIPLIER = 2.0;

// 한국어 컨텍스트는 절반 크기로 제한
const effectiveLimit = MAX_SCRATCHPAD_TOKENS / KOREAN_TEXT_MULTIPLIER;
```

### 토큰 절약 전략

1. **간결한 도구 출력**: JSON 응답을 필요한 필드만 추출
2. **스크래치패드 요약**: 오래된 관찰은 요약하여 저장
3. **효율적인 프롬프트**: 한국어 설명은 핵심만 포함

## LLM 프로바이더 (LLM Providers)

### 지원 모델

Korean Dexter는 3가지 프로바이더를 지원합니다:

| 프로바이더 | 모델 | 환경 변수 | 추천 용도 |
|----------|------|----------|----------|
| **Anthropic** | Claude 3.5 Sonnet | `ANTHROPIC_API_KEY` | 복잡한 재무 분석 |
| **OpenAI** | GPT-4 Turbo | `OPENAI_API_KEY` | 일반적인 질문 |
| **Google** | Gemini 1.5 Pro | `GOOGLE_API_KEY` | 무료 개발/테스트 |

### 모델 선택

#### CLI에서 선택

```bash
bun start
# → 시작 화면에서 방향키로 모델 선택
```

#### 코드에서 설정

```typescript
// src/providers.ts
export const getDefaultModel = (): LLMProvider => {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
    };
  }
  // fallback...
};
```

### 모델별 특성

**Claude 3.5 Sonnet** (추천):
- 한국어 이해도 우수
- 금융 용어 정확도 높음
- Function calling 안정적
- 비용: 중간

**GPT-4 Turbo**:
- 빠른 응답 속도
- 한국어 지원 양호
- 비용: 높음

**Gemini 1.5 Pro**:
- 무료 사용 가능 (일일 한도)
- 한국어 지원 양호
- Function calling 지원
- 비용: 무료 (제한적)

### 모델 전환

```typescript
// src/model/llm.ts
export const createLLM = (provider: LLMProvider) => {
  switch (provider.provider) {
    case 'anthropic':
      return new ChatAnthropic({
        modelName: 'claude-3-5-sonnet-20241022',
        temperature: 0,
      });
    case 'openai':
      return new ChatOpenAI({
        modelName: 'gpt-4-turbo',
        temperature: 0,
      });
    case 'google':
      return new ChatGoogleGenerativeAI({
        modelName: 'gemini-1.5-pro',
        temperature: 0,
      });
  }
};
```

## 주요 설계 결정 (Key Design Decisions)

### 1. 연결재무제표(CFS) 우선

**결정**: 연결재무제표를 우선 조회, 없으면 별도재무제표로 fallback

**이유**:
- 대부분의 상장사는 자회사를 포함한 연결재무제표를 공시
- 투자자는 일반적으로 연결 기준 실적을 중시
- OpenDART API는 CFS와 OFS를 구분하여 제공

**구현** (`src/tools/core/opendart/tools.ts`):
```typescript
// 1. Try consolidated (CFS) first
const cfs = await client.getFinancials({ corpCode, year, fs: 'CFS' });
if (cfs.length > 0) return cfs;

// 2. Fallback to separate (OFS)
return await client.getFinancials({ corpCode, year, fs: 'OFS' });
```

### 2. 한국어 숫자 포맷팅

**결정**: 모든 금액을 조원/억원/만원 단위로 표시

**이유**:
- 한국 사용자는 "1.5조원"에 익숙함
- "1500000000000원"은 가독성이 떨어짐
- 금융 뉴스/보고서도 동일한 단위 사용

**구현** (`src/shared/formatter.ts`):
```typescript
export const formatKoreanNumber = (value: number): string => {
  const trillion = 1_000_000_000_000;
  const billion = 100_000_000;
  const tenThousand = 10_000;

  if (Math.abs(value) >= trillion) {
    return `${(value / trillion).toFixed(1)}조원`;
  }
  if (Math.abs(value) >= billion) {
    return `${(value / billion).toFixed(0)}억원`;
  }
  return `${(value / tenThousand).toFixed(0)}만원`;
};
```

### 3. Rate Limiting 내장

**결정**: 모든 API 클라이언트에 rate limiting 내장

**이유**:
- OpenDART: 하루 1,000~10,000 요청 제한
- KIS: 초당 20 요청 제한
- API 차단 방지 필수

**구현** (`src/infra/rate-limiter.ts`):
```typescript
export class RateLimiter {
  private queue: Array<() => void> = [];
  private requestCount = 0;

  async acquire(): Promise<void> {
    if (this.requestCount >= this.maxRequests) {
      await this.waitForWindow();
    }
    this.requestCount++;
  }
}
```

### 4. 불변 데이터 영구 캐싱

**결정**: 과거 재무제표와 종가 데이터는 영구 캐싱

**이유**:
- 2023년 재무제표는 절대 변경되지 않음
- 어제 종가는 불변 데이터
- 반복 조회 시 API 호출 불필요

**구현** (`src/infra/cache.ts`):
```typescript
// Historical data: permanent cache
await cache.set(cacheKey, data, { ttl: Infinity });

// Real-time data: short TTL
await cache.set(cacheKey, data, { ttl: 60000 }); // 1분
```

### 5. 기업명 퍼지 매칭

**결정**: 초성 검색 + Levenshtein distance로 기업명 매칭

**이유**:
- 사용자는 "삼전", "삼성", "삼성전자" 등 다양하게 입력
- 오타 허용 필요 ("삼섬전자" → "삼성전자")
- OpenDART는 정확한 corp_code 필요

**구현** (`src/mapping/jamo.ts`):
```typescript
export const fuzzyMatch = (input: string, target: string): number => {
  const jamoScore = matchJamo(input, target);
  const levenScore = levenshteinDistance(input, target);
  return (jamoScore + levenScore) / 2;
};
```

### 6. 한국어 프롬프트

**결정**: 에이전트 프롬프트와 도구 설명을 한국어로 작성

**이유**:
- 한국 금융 용어를 정확히 이해
- 한국어 질문에 한국어 사고 과정이 자연스러움
- LLM의 한국어 이해도 충분히 높음

**구현** (`src/agent/prompts.ts`):
```typescript
export const SYSTEM_PROMPT = `
당신은 한국 금융시장 전문 리서치 에이전트입니다.
...
`.trim();
```

## 다음 단계

- [API 키 발급 가이드](setup-guide.md)
- [기여 가이드](../CONTRIBUTING.md)
- [API 레퍼런스](api-reference.md)
