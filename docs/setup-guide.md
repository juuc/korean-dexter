# API 키 설정 가이드

Korean Dexter를 실행하려면 한국 금융 API 키와 LLM 프로바이더 API 키가 필요합니다.

## 필수 API 키

- ✅ **OpenDART API 키** - 재무제표, 공시 데이터
- ✅ **KIS API 키** - 주가, 거래량 데이터
- ✅ **LLM 프로바이더** - Claude, OpenAI, 또는 Gemini 중 하나

## 선택 API 키

- ⭕ **LangSmith API 키** - 평가 및 모니터링 (Phase 3)
- ⭕ **BOK API 키** - 한국은행 경제 통계 (v1.1 예정)
- ⭕ **KOSIS API 키** - 국가통계포털 (v1.1 예정)
- ⭕ **BigKinds API 키** - 뉴스 데이터 (v1.1 예정)

---

## 1. OpenDART API 키 발급

### 1.1 회원가입

1. **OpenDART 사이트 접속**: https://opendart.fss.or.kr
2. 우측 상단 **[회원가입]** 클릭
3. 약관 동의 후 회원 정보 입력

**참고**: 개인 회원 가입 시 한국 전화번호 또는 사업자등록번호가 필요할 수 있습니다.

### 1.2 API 키 발급

1. 로그인 후 상단 메뉴에서 **[인증키 신청/관리]** 클릭
2. **[인증키 신청]** 버튼 클릭
3. 신청 정보 입력:
   - **용도**: 개인 프로젝트 / 연구 / 개발 등
   - **활용 분야**: 금융 데이터 분석
4. 신청 완료 후 즉시 발급 (승인 대기 없음)

### 1.3 API 키 확인

1. **[인증키 신청/관리]** 페이지에서 발급된 키 확인
2. 40자 길이의 영문/숫자 조합 (예: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

### 1.4 사용 제한

| 구분 | 일일 요청 한도 | 비고 |
|------|---------------|------|
| 일반 회원 | 약 1,000건 | 개발/테스트 충분 |
| 인증 회원 | 약 10,000건 | 사업자등록번호 인증 필요 |

**Rate Limiting**: Korean Dexter는 자동으로 속도 제한을 관리하므로 걱정하지 않아도 됩니다.

### 1.5 .env 설정

```bash
OPENDART_API_KEY=your_api_key_here
```

---

## 2. KIS API 키 발급

### 2.1 회원가입

1. **KIS Developers 사이트 접속**: https://apiportal.koreainvestment.com
2. 우측 상단 **[회원가입]** 클릭
3. 약관 동의 후 회원 정보 입력

### 2.2 모의투자 계좌 개설

1. 로그인 후 **[모의투자]** 메뉴 클릭
2. **[모의투자 신청]** 클릭
3. 계좌 정보 입력 후 개설 (즉시 개설)
4. 모의투자 계좌번호 확인 (8자리-2자리 형식, 예: `12345678-01`)

**참고**: 실제 거래 계좌가 아닌 모의투자 계좌를 사용합니다.

### 2.3 앱 등록 및 API 키 발급

1. 좌측 메뉴에서 **[API 신청]** 클릭
2. **[앱 등록]** 클릭
3. 앱 정보 입력:
   - **앱 이름**: Korean Dexter (또는 원하는 이름)
   - **앱 설명**: AI 금융 리서치 에이전트
   - **서비스 구분**: 모의투자
4. 등록 완료 후 **APP KEY**와 **APP SECRET** 발급

### 2.4 API 키 확인

**[APP KEY]** (32자리):
```
PSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**[APP SECRET]** (40자리):
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2.5 사용 제한

| 구분 | 제한 |
|------|------|
| 요청 속도 | 초당 최대 20건 |
| 일일 한도 | 제한 없음 (모의투자) |
| 토큰 유효기간 | 24시간 (자동 갱신) |

**토큰 관리**: Korean Dexter는 자동으로 토큰을 발급받고 갱신하므로 수동 관리가 필요 없습니다. 토큰은 `~/.kis-token.json`에 저장됩니다.

### 2.6 .env 설정

```bash
KIS_APP_KEY=your_app_key_here
KIS_APP_SECRET=your_app_secret_here
KIS_PAPER_TRADING=true
```

**중요**: `KIS_PAPER_TRADING=true`로 설정하여 모의투자 모드를 활성화하세요.

---

## 3. LLM 프로바이더 설정

최소 하나의 LLM 프로바이더 API 키가 필요합니다. **Google Gemini (무료)**를 추천합니다.

### 3.1 Google Gemini (추천 - 무료)

#### 3.1.1 API 키 발급

1. **Google AI Studio 접속**: https://aistudio.google.com
2. 구글 계정으로 로그인
3. 좌측 메뉴에서 **[Get API key]** 클릭
4. **[Create API key]** 버튼 클릭
5. 프로젝트 선택 또는 새 프로젝트 생성
6. API 키 복사 (39자리, 예: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)

#### 3.1.2 사용 제한

| 구분 | 무료 한도 |
|------|----------|
| 일일 요청 | 1,500건 |
| 분당 요청 | 15건 |
| 모델 | Gemini 1.5 Pro |

개인 사용 및 개발에 충분한 수준입니다.

#### 3.1.3 .env 설정

```bash
GOOGLE_API_KEY=your_api_key_here
```

### 3.2 Anthropic Claude (유료)

#### 3.2.1 API 키 발급

1. **Anthropic Console 접속**: https://console.anthropic.com
2. 계정 생성 및 로그인
3. **[API Keys]** 메뉴 클릭
4. **[Create Key]** 버튼 클릭
5. 키 이름 입력 후 생성
6. API 키 복사 (108자리, 예: `sk-ant-api03-...`)

#### 3.2.2 요금

| 모델 | 입력 (1M tokens) | 출력 (1M tokens) |
|------|------------------|------------------|
| Claude 3.5 Sonnet | $3 | $15 |
| Claude 3 Haiku | $0.25 | $1.25 |

**예상 비용**: 질문당 평균 $0.01~0.05 (한국어 텍스트는 토큰 소비 2배)

#### 3.2.3 .env 설정

```bash
ANTHROPIC_API_KEY=your_api_key_here
```

### 3.3 OpenAI GPT-4 (유료)

#### 3.3.1 API 키 발급

1. **OpenAI Platform 접속**: https://platform.openai.com
2. 계정 생성 및 로그인
3. 우측 상단 프로필 → **[View API keys]** 클릭
4. **[Create new secret key]** 버튼 클릭
5. 키 이름 입력 후 생성
6. API 키 복사 (51자리, 예: `sk-proj-...`)

**참고**: 결제 정보 등록이 필요합니다.

#### 3.3.2 요금

| 모델 | 입력 (1M tokens) | 출력 (1M tokens) |
|------|------------------|------------------|
| GPT-4 Turbo | $10 | $30 |
| GPT-4o | $5 | $15 |

#### 3.3.3 .env 설정

```bash
OPENAI_API_KEY=your_api_key_here
```

---

## 4. 선택 API 키 (Optional)

### 4.1 LangSmith (평가 및 모니터링)

**Phase 3 평가 프레임워크**에서 사용됩니다. 현재는 선택 사항입니다.

1. **LangSmith 접속**: https://smith.langchain.com
2. 계정 생성 및 로그인
3. **[Settings]** → **[API Keys]** 클릭
4. **[Create API Key]** 버튼 클릭
5. API 키 복사

```bash
LANGCHAIN_API_KEY=your_api_key_here
```

### 4.2 BOK, KOSIS, BigKinds (v1.1 예정)

이 API들은 **v1.1 릴리스**에서 지원될 예정입니다. 현재는 설정하지 않아도 됩니다.

- **BOK (한국은행)**: https://ecos.bok.or.kr
- **KOSIS (통계청)**: https://kosis.kr
- **BigKinds (뉴스)**: https://www.bigkinds.or.kr

---

## 5. 환경 변수 설정

### 5.1 .env 파일 생성

```bash
# 프로젝트 루트에서
cp .env.example .env
```

### 5.2 .env 파일 편집

```bash
# 필수 - OpenDART
OPENDART_API_KEY=your_opendart_key_here

# 필수 - KIS
KIS_APP_KEY=your_kis_app_key_here
KIS_APP_SECRET=your_kis_app_secret_here
KIS_PAPER_TRADING=true

# 필수 - LLM 프로바이더 (하나 이상 선택)
GOOGLE_API_KEY=your_google_key_here
# ANTHROPIC_API_KEY=your_anthropic_key_here
# OPENAI_API_KEY=your_openai_key_here

# 선택 - LangSmith (평가용)
# LANGCHAIN_API_KEY=your_langchain_key_here

# 선택 - v1.1 예정
# BOK_API_KEY=
# KOSIS_API_KEY=
# BIGKINDS_API_KEY=
```

### 5.3 환경 변수 검증

Korean Dexter를 실행하면 자동으로 필수 환경 변수를 검증합니다:

```bash
bun start
```

누락된 API 키가 있으면 다음과 같은 에러 메시지가 표시됩니다:

```
❌ 필수 환경 변수가 설정되지 않았습니다:
   - OPENDART_API_KEY
   - KIS_APP_KEY

docs/setup-guide.md를 참고하여 API 키를 발급받으세요.
```

---

## 6. 문제 해결 (Troubleshooting)

### 6.1 OpenDART API 에러

#### 에러: "API 인증키가 유효하지 않습니다"

**원인**: API 키가 잘못되었거나 만료됨

**해결**:
1. OpenDART 사이트에서 API 키 재확인
2. `.env` 파일에 올바르게 복사했는지 확인
3. 공백이나 줄바꿈이 포함되지 않았는지 확인

#### 에러: "일일 요청 한도 초과"

**원인**: 하루 요청 한도 (1,000건 또는 10,000건) 초과

**해결**:
1. 다음 날까지 대기
2. 인증 회원으로 업그레이드 (사업자등록번호 인증)

#### 에러: "해당 기업의 재무제표가 없습니다"

**원인**: 요청한 연도의 재무제표가 공시되지 않음

**해결**:
1. 최근 3개 회계연도만 조회
2. 상장 폐지된 기업은 데이터가 없을 수 있음

### 6.2 KIS API 에러

#### 에러: "APP KEY가 유효하지 않습니다"

**원인**: APP KEY 또는 APP SECRET가 잘못됨

**해결**:
1. KIS Developers 사이트에서 앱 정보 재확인
2. `.env` 파일에 정확히 복사
3. `KIS_PAPER_TRADING=true` 설정 확인

#### 에러: "토큰 발급 실패"

**원인**: 모의투자 계좌가 없거나 API 권한이 없음

**해결**:
1. KIS Developers에서 모의투자 계좌 개설 확인
2. 앱이 모의투자 서비스로 등록되었는지 확인

#### 에러: "접근토큰 유효기간 만료"

**원인**: 24시간 후 토큰 만료 (자동 갱신 실패)

**해결**:
1. `~/.kis-token.json` 파일 삭제
2. Korean Dexter 재실행 (자동으로 새 토큰 발급)

```bash
rm ~/.kis-token.json
bun start
```

### 6.3 LLM 프로바이더 에러

#### 에러: "API 키가 유효하지 않습니다"

**원인**: LLM API 키가 잘못되었거나 만료됨

**해결**:
1. 각 프로바이더 콘솔에서 API 키 재확인
2. `.env` 파일에 올바르게 설정
3. API 키 형식 확인:
   - Google: `AIza...` (39자리)
   - Anthropic: `sk-ant-api03-...` (108자리)
   - OpenAI: `sk-proj-...` (51자리)

#### 에러: "Rate limit exceeded"

**원인**: API 호출 한도 초과

**해결**:
1. **Google Gemini**: 분당 15건 제한, 잠시 대기
2. **Anthropic/OpenAI**: 결제 정보 확인, 한도 상향

#### 에러: "Insufficient quota"

**원인**: 크레딧 부족 (Anthropic/OpenAI)

**해결**:
1. 결제 정보 확인 및 크레딧 충전
2. Google Gemini로 전환 (무료)

### 6.4 기업 코드 해결 에러

#### 에러: "기업을 찾을 수 없습니다"

**원인**: 기업명 오타 또는 미등록 기업

**해결**:
1. 정확한 기업명 사용 (예: "삼성전자", "SK하이닉스")
2. 초성 검색 사용 (예: "삼전" → "삼성전자")
3. 상장사만 조회 가능 (비상장사는 데이터 없음)

### 6.5 API 키 검증 스크립트

모든 API 키가 올바르게 설정되었는지 확인하려면:

```bash
# 환경 변수 로드 테스트
bun run -e 'console.log(process.env.OPENDART_API_KEY ? "✓ OpenDART" : "✗ OpenDART")'
bun run -e 'console.log(process.env.KIS_APP_KEY ? "✓ KIS" : "✗ KIS")'
bun run -e 'console.log(process.env.GOOGLE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ? "✓ LLM" : "✗ LLM")'
```

---

## 7. 빠른 시작

모든 API 키를 발급받고 `.env` 파일을 설정했다면:

```bash
# 1. 의존성 설치
bun install

# 2. 환경 변수 확인
cat .env

# 3. 테스트 실행
bun test

# 4. Korean Dexter 실행
bun start
```

**첫 질문 예시**:
```
삼성전자의 2024년 매출액은?
```

정상적으로 작동하면 에이전트가 OpenDART API를 호출하여 재무제표를 조회하고 답변을 생성합니다.

---

## 추가 도움말

- **개발 가이드**: [docs/development.md](development.md)
- **기여 가이드**: [CONTRIBUTING.md](../CONTRIBUTING.md)
- **GitHub Issues**: https://github.com/juuc/korean-dexter/issues

문제가 해결되지 않으면 GitHub Issues에 질문을 남겨주세요!
