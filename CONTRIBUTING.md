# 기여 가이드 (Contributing Guide)

Korean Dexter는 한국 금융시장을 위한 오픈소스 AI 리서치 에이전트입니다. 기여를 환영합니다!

## 개발 환경 설정 (Development Setup)

### 필수 요구사항 (Prerequisites)

- **Bun** v1.0 이상
- **Node.js** v18 이상 (Bun 설치용)
- Git
- 한국 금융 API 키 (OpenDART, KIS - [setup-guide.md](docs/setup-guide.md) 참고)

### 설치 (Installation)

```bash
# 저장소 복제
git clone https://github.com/juuc/korean-dexter.git
cd korean-dexter

# 의존성 설치
bun install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력 (docs/setup-guide.md 참고)

# 테스트 실행
bun test

# 타입 체크
bun run typecheck

# 로컬 실행
bun start
```

## 프로젝트 구조 (Project Structure)

```
src/
├── agent/              # 핵심 에이전트 로직
│   ├── agent.ts        # 메인 에이전트 루프
│   ├── prompts.ts      # 한국어 프롬프트 템플릿
│   ├── scratchpad.ts   # 스크래치패드 (사고 과정 기록)
│   ├── tool-executor.ts # 도구 실행 엔진
│   ├── token-counter.ts # 토큰 예산 관리
│   └── types.ts        # 에이전트 타입 정의
│
├── components/         # React Ink UI 컴포넌트
│   ├── AgentEventView.tsx      # 에이전트 이벤트 표시
│   ├── AnswerBox.tsx           # 최종 답변 렌더링
│   ├── DebugPanel.tsx          # 디버그 패널
│   ├── Input.tsx               # 사용자 입력
│   ├── Intro.tsx               # 환영 화면
│   ├── ModelSelector.tsx       # LLM 모델 선택기
│   └── WorkingIndicator.tsx    # 작업 중 인디케이터
│
├── tools/              # 금융 API 도구
│   ├── core/
│   │   ├── opendart/   # OpenDART API (재무제표, 공시)
│   │   │   ├── client.ts
│   │   │   ├── tools.ts
│   │   │   ├── account-mapper.ts
│   │   │   └── *.test.ts
│   │   └── kis/        # KIS API (주가, 거래량)
│   │       ├── client.ts
│   │       ├── tools.ts
│   │       ├── auth.ts
│   │       ├── market-hours.ts
│   │       └── *.test.ts
│   ├── descriptions/
│   │   └── korean-tools.ts     # LLM용 한국어 도구 설명
│   ├── langchain-tools.ts      # LangChain 도구 래퍼
│   ├── registry.ts             # 도구 레지스트리
│   ├── error-messages.ts       # 한국어 에러 메시지
│   └── types.ts
│
├── mapping/            # 기업 식별자 매핑
│   ├── corp-code-resolver.ts   # 기업명 → corp_code 변환
│   ├── jamo.ts                 # 초성 검색 (퍼지 매칭)
│   └── *.test.ts
│
├── infra/              # 인프라 레이어
│   ├── rate-limiter.ts # API 호출 속도 제한
│   ├── cache.ts        # 캐싱 레이어
│   └── *.test.ts
│
├── shared/             # 공유 유틸리티
│   ├── formatter.ts    # 한국 숫자 포맷팅 (조원/억원/만원)
│   ├── types.ts
│   └── *.test.ts
│
├── model/              # LLM 프로바이더 추상화
│   └── llm.ts
│
├── skills/             # 확장 가능한 스킬 시스템
│   ├── loader.ts
│   ├── registry.ts
│   └── types.ts
│
├── evals/              # 평가 프레임워크 (Phase 3)
│
├── utils/              # 유틸리티
│   ├── config.ts       # 설정 관리
│   ├── env.ts          # 환경 변수 검증
│   ├── logger.ts       # 로깅
│   ├── hangul.ts       # 한글 유틸리티
│   ├── tokens.ts       # 토큰 계산
│   ├── markdown-table.ts
│   └── *.test.ts
│
├── cli.tsx             # CLI 진입점
├── index.tsx           # 앱 루트
├── providers.ts        # LLM 프로바이더 설정
└── theme.ts            # 터미널 색상 테마

scripts/
└── test-query.ts       # 헤드리스 테스트 스크립트

docs/
├── setup-guide.md      # API 키 발급 가이드
├── development.md      # 개발 가이드
└── api-reference.md    # API 레퍼런스
```

## 코딩 컨벤션 (Coding Conventions)

### 타입 안정성 (Type Safety)

- **절대 금지**: `any` 타입 사용
- **절대 금지**: 타입 단언 남용 (`as any`, `as unknown as`)
- TypeScript strict mode 필수
- 타입 에러는 타입 시스템으로 해결

### 불변성 (Immutability)

객체를 절대 변경하지 마세요. 항상 새 객체를 생성하세요.

```typescript
// ❌ 잘못된 예
user.name = name;
return user;

// ✅ 올바른 예
return { ...user, name };
```

### 언어 사용 (Language)

- **코드와 주석**: 영어
- **금융 레이블**: 한국어 (`매출액`, `영업이익`, `당기순이익`)
- **에이전트 프롬프트**: 한국어 (`src/agent/prompts.ts`)
- **도구 설명**: 한국어 (`src/tools/descriptions/korean-tools.ts`)
- **에러 메시지**: 한국어 (`src/tools/error-messages.ts`)

### 한국 금융 데이터 규칙

1. **금액 표시**: 항상 `조원/억원/만원` 단위 사용, 절대 raw WON 사용 금지
   ```typescript
   // ✅ 올바른 예
   formatKoreanNumber(1500000000000); // "1.5조원"

   // ❌ 잘못된 예
   "1500000000000원"
   ```

2. **재무제표 우선순위**: 연결재무제표(CFS) 우선, 없으면 별도재무제표(OFS) 사용

3. **기업 코드**: OpenDART는 8자리 `corp_code` 사용, 종목코드 아님
   ```typescript
   // corp_code: "00126380" (삼성전자)
   // ticker: "005930" (별개의 식별자)
   ```

4. **API 클라이언트 필수사항**:
   - Rate limiting 내장 (from day 1)
   - 불변 데이터 영구 캐싱 (과거 재무제표, 종가 데이터)

### 파일 구조

- 파일당 200-400줄 권장, 800줄 최대
- 타입별이 아닌 기능/도메인별로 구성
- 테스트 파일은 소스 파일과 동일 디렉토리 (`*.test.ts` 패턴)

## 새 도구 추가하기 (Adding a New Tool)

한국 금융 API를 추가하려면 다음 단계를 따르세요:

### 1단계: 도구 디렉토리 생성

```bash
mkdir -p src/tools/core/{api-name}
cd src/tools/core/{api-name}
```

### 2단계: API 클라이언트 구현 (`client.ts`)

```typescript
import { RateLimiter } from '@/infra/rate-limiter';
import { cache } from '@/infra/cache';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1분
});

export class MyAPIClient {
  constructor(private apiKey: string) {}

  async getData(params: Params): Promise<Data> {
    await limiter.acquire();

    const cacheKey = `myapi:${JSON.stringify(params)}`;
    const cached = await cache.get<Data>(cacheKey);
    if (cached) return cached;

    const response = await fetch(/* ... */);
    const data = await response.json();

    // 불변 데이터는 영구 캐싱
    await cache.set(cacheKey, data, { ttl: Infinity });

    return data;
  }
}
```

### 3단계: LangChain 도구 정의 (`tools.ts`)

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const createMyAPITools = (client: MyAPIClient) => [
  new DynamicStructuredTool({
    name: 'my_api_get_data',
    description: '영어로 작성 (LangChain 표준)',
    schema: z.object({
      param1: z.string().describe('Parameter description'),
    }),
    func: async ({ param1 }) => {
      const data = await client.getData({ param1 });
      return JSON.stringify(data, null, 2);
    },
  }),
];
```

### 4단계: 도구 레지스트리에 추가 (`src/tools/langchain-tools.ts`)

```typescript
import { createMyAPITools } from './core/myapi/tools';
import { MyAPIClient } from './core/myapi/client';

export const createLangChainTools = (): StructuredTool[] => {
  const tools: StructuredTool[] = [];

  // 기존 도구들...

  if (config.myapiApiKey) {
    const client = new MyAPIClient(config.myapiApiKey);
    tools.push(...createMyAPITools(client));
  }

  return tools;
};
```

### 5단계: 한국어 도구 설명 추가 (`src/tools/descriptions/korean-tools.ts`)

```typescript
export const KOREAN_TOOL_DESCRIPTIONS: Record<string, string> = {
  // 기존 도구들...

  my_api_get_data: `
**my_api_get_data**: MyAPI에서 데이터를 조회합니다.

**사용 시기**:
- 사용자가 XYZ 정보를 요청할 때

**입력**:
- param1: 파라미터 설명

**출력**: JSON 형태의 데이터

**예시**:
\`\`\`json
{"param1": "value"}
\`\`\`
  `.trim(),
};
```

### 6단계: 환경 변수 검증 추가 (`src/utils/env.ts`)

```typescript
export const config = {
  // 기존 설정...
  myapiApiKey: process.env.MYAPI_API_KEY,
};

export const checkRequiredEnvVars = (): void => {
  const required = [
    'OPENDART_API_KEY',
    'KIS_APP_KEY',
    'KIS_APP_SECRET',
    'MYAPI_API_KEY', // 추가
  ];

  // 검증 로직...
};
```

### 7단계: 테스트 작성

```typescript
// src/tools/core/myapi/client.test.ts
import { describe, test, expect } from 'bun:test';
import { MyAPIClient } from './client';

describe('MyAPIClient', () => {
  test('should fetch data', async () => {
    const client = new MyAPIClient('test-key');
    const data = await client.getData({ param1: 'test' });
    expect(data).toBeDefined();
  });

  test('should use cache for repeated requests', async () => {
    // 캐싱 로직 테스트
  });

  test('should respect rate limits', async () => {
    // Rate limiting 테스트
  });
});
```

### .env.example 업데이트

```bash
MYAPI_API_KEY=
```

## 테스트 (Testing)

### 테스트 실행

```bash
# 모든 테스트 실행
bun test

# 특정 파일 테스트
bun test src/tools/core/myapi/client.test.ts

# Watch 모드
bun test --watch
```

### 테스트 작성 가이드

- 테스트 파일은 소스 파일과 같은 디렉토리에 `*.test.ts` 패턴으로 작성
- 현재 15개 테스트 파일에 375개 테스트 통과 중
- 주요 테스트 대상:
  - API 클라이언트 (성공/실패 케이스)
  - Rate limiting 동작
  - 캐싱 로직
  - 한국어 포맷팅
  - 기업 코드 매핑
  - 에이전트 프롬프트 생성

### 무엇을 테스트할까?

✅ **테스트 필수**:
- API 응답 파싱
- 에러 핸들링
- Rate limiting
- 캐싱 동작
- 한국어 숫자 포맷팅
- 기업명 → corp_code 변환

❌ **테스트 불필요**:
- React Ink UI 컴포넌트 (수동 테스트)
- 외부 API 실제 호출 (모킹 사용)

## 커밋 메시지 (Commit Messages)

### 형식

```
<type>: <description>
```

### 타입 (Types)

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `docs`: 문서 변경
- `test`: 테스트 추가/수정
- `chore`: 빌드/도구 변경
- `perf`: 성능 개선
- `ci`: CI 설정 변경

### 예시

```bash
feat: KIS API 실시간 주가 조회 도구 추가
fix: OpenDART 연결재무제표 null 처리
refactor: 한국어 숫자 포맷터 단순화
docs: API 키 발급 가이드 추가
test: 기업 코드 매퍼 테스트 케이스 추가
chore: Bun v1.2로 업그레이드
```

## PR 프로세스 (Pull Request Process)

### 1. Fork & Clone

```bash
# GitHub에서 Fork
git clone https://github.com/YOUR-USERNAME/korean-dexter.git
cd korean-dexter
```

### 2. 브랜치 생성

```bash
git checkout -b feature/my-new-tool
```

### 3. 구현

- 코딩 컨벤션 준수
- 테스트 작성
- 타입 체크 통과

### 4. 테스트

```bash
bun test
bun run typecheck
```

### 5. 커밋 & 푸시

```bash
git add src/tools/core/myapi
git commit -m "feat: MyAPI 도구 추가"
git push origin feature/my-new-tool
```

### 6. Pull Request 생성

GitHub에서 PR 생성 시 다음 체크리스트 확인:

#### PR 체크리스트

- [ ] 모든 테스트 통과 (`bun test`)
- [ ] 타입 체크 통과 (`bun run typecheck`)
- [ ] `any` 타입 사용하지 않음
- [ ] 한국어 금액 포맷팅 올바름 (조원/억원/만원)
- [ ] 재무제표 우선순위 준수 (연결 → 별도)
- [ ] API 클라이언트에 rate limiting 포함
- [ ] 불변 데이터 캐싱 구현
- [ ] 한국어 도구 설명 추가
- [ ] 테스트 커버리지 충분
- [ ] 커밋 메시지 형식 준수
- [ ] 문서 업데이트 (필요 시)

### 코드 리뷰

- 리뷰어 피드백에 응답
- 요청된 변경사항 수정
- 리뷰 승인 후 머지

## 질문이 있나요?

- **이슈**: [GitHub Issues](https://github.com/juuc/korean-dexter/issues)
- **디스커션**: [GitHub Discussions](https://github.com/juuc/korean-dexter/discussions)

감사합니다! 🙏
