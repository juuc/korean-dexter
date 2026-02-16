---
title: "Fork Dexter & Project Scaffold"
issue: 3
phase: 1-foundation
priority: critical
status: done
type: infra
created: 2026-02-16
depends_on: ["[[phase-1-foundation/01-assumptions]]", "[[phase-1-foundation/02-competitive-analysis]]", "[[phase-1-foundation/20-user-persona]]"]
blocks: ["[[phase-1-foundation/04-corp-resolver]]", "[[phase-1-foundation/05-data-model]]", "[[phase-1-foundation/10-rate-limiter]]", "[[phase-1-foundation/11-cache]]", "[[phase-2-core/06-opendart]]", "[[phase-2-core/08-kis]]"]
tags: [infra, setup, architecture]
estimated_effort: large
---

# Issue #3: Fork Dexter & Project Scaffold

## Problem

Bootstrap Korean Dexter by forking virattt/dexter, removing US-specific code, and creating the directory structure for Korean market tools.

## Fork Strategy

**Source**: https://github.com/virattt/dexter
**Pinned Commit**: [TBD - identify stable commit after reviewing repo]

### What to Keep

1. **Agent Core** (`src/agent/`):
   - `agent.ts` - Main agent loop
   - `scratchpad.ts` - Memory management
   - `token-counter.ts` - Token tracking
   - `types.ts` - Core event types

2. **Eval Framework** (`src/evals/`):
   - Eval runner structure
   - LLM-as-judge pattern
   - (Replace US eval dataset with Korean dataset)

3. **UI Components** (`src/components/`):
   - React Ink CLI interface
   - Spinner, console output
   - (Adapt for Korean text display)

4. **Utils**:
   - Logging
   - Error handling
   - (Add Korean-specific utils)

### What to Remove

1. **US Financial Tools** (`src/tools/financial-datasets/`):
   - All US market data tools
   - SEC filing tools
   - US stock price tools

2. **US Eval Dataset**:
   - Replace with Korean financial questions

3. **US-Specific Skills**:
   - Any skills referencing US markets, tickers, or data sources

---

## New Directory Structure

```
korean-dexter/
├── src/
│   ├── agent/                  # Forked from Dexter
│   │   ├── agent.ts
│   │   ├── scratchpad.ts
│   │   ├── token-counter.ts
│   │   └── types.ts
│   │
│   ├── tools/
│   │   └── core/               # NEW: Korean market tools
│   │       ├── opendart/
│   │       │   ├── opendart-client.ts
│   │       │   ├── financial-statement.tool.ts
│   │       │   ├── disclosure.tool.ts
│   │       │   └── types.ts
│   │       │
│   │       └── kis/
│   │           ├── kis-client.ts
│   │           ├── stock-price.tool.ts
│   │           ├── investor-flow.tool.ts
│   │           └── types.ts
│   │
│   ├── mapping/                # NEW: Cross-API mapping
│   │   ├── corp-code-resolver.ts
│   │   ├── account-mapper.ts
│   │   └── types.ts
│   │
│   ├── shared/                 # NEW: Cross-cutting types
│   │   ├── types.ts           # ResolvedCompany, NormalizedAmount, PeriodRange
│   │   └── formatter.ts       # KoreanFinancialFormatter
│   │
│   ├── infra/                  # NEW: Infrastructure
│   │   ├── rate-limiter.ts
│   │   ├── cache-layer.ts
│   │   ├── kis-auth.ts        # OAuth2 token management
│   │   └── types.ts
│   │
│   ├── evals/                  # Adapted from Dexter
│   │   ├── eval-runner.ts
│   │   ├── korean-dataset.ts  # NEW: Korean financial questions
│   │   └── types.ts
│   │
│   ├── skills/                 # Adapted from Dexter
│   │   └── [Korean-adapted skills]
│   │
│   ├── utils/                  # Extended from Dexter
│   │   ├── hangul.ts          # NEW: Korean text utilities
│   │   ├── logger.ts
│   │   └── errors.ts
│   │
│   ├── components/             # Forked from Dexter
│   │   └── [React Ink UI components]
│   │
│   └── cli.tsx                 # Entry point
│
├── plan/                       # NEW: Planning docs (this directory)
│   ├── phase-1-foundation/
│   ├── phase-2-core/
│   └── ...
│
├── docs/                       # NEW: Documentation
│   ├── ralplan-consensus.md
│   ├── api-reference.md
│   ├── assumptions-validation.md
│   ├── competitive-analysis.md
│   └── target-user.md
│
├── tests/                      # NEW: Test suite
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example                # NEW: API key template
├── package.json
├── tsconfig.json
├── bun.lockb
└── README.md
```

---

## Tasks

### 1. Fork Repository

```bash
# Clone original Dexter
git clone https://github.com/virattt/dexter.git korean-dexter
cd korean-dexter

# Review commit history, select stable commit
git log --oneline -20

# Pin to stable commit (TBD)
git reset --hard [COMMIT_HASH]

# Update remote to personal repo
git remote remove origin
git remote add origin git@github.com-personal:juuc/korean-dexter.git
```

### 2. Strip US-Specific Code

```bash
# Remove US financial tools
rm -rf src/tools/financial-datasets/

# Remove US eval dataset (keep runner structure)
# (Manual: edit src/evals/ to remove US questions)

# Review and remove US-specific skills
# (Manual: audit src/skills/)
```

### 3. Create Directory Structure

```bash
mkdir -p src/tools/core/opendart
mkdir -p src/tools/core/kis
mkdir -p src/mapping
mkdir -p src/shared
mkdir -p src/infra
mkdir -p src/utils
mkdir -p plan
mkdir -p docs
mkdir -p tests/{unit,integration,e2e}
```

### 4. Update package.json

```json
{
  "name": "korean-dexter",
  "version": "0.1.0",
  "description": "Autonomous AI financial research agent for Korean markets",
  "author": "juuc",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "bun run src/cli.tsx",
    "build": "bun build src/cli.tsx --outdir dist --target node",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "react": "^18.3.0",
    "ink": "^5.0.0",
    "dotenv": "^16.4.0",
    "hangul-js": "^0.2.6"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.7.0",
    "eslint": "^9.0.0",
    "bun-types": "^1.2.0"
  }
}
```

### 5. Create .env.example

```bash
# OpenDART API
OPENDART_API_KEY=your_api_key_here
# Get key from: https://opendart.fss.or.kr/

# KIS API (모의투자)
KIS_APP_KEY=your_app_key_here
KIS_APP_SECRET=your_app_secret_here
KIS_ACCOUNT_NO=your_paper_account_number_here
# Register at: https://apiportal.koreainvestment.com/

# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_key_here
# Get key from: https://console.anthropic.com/

# OpenAI (optional, for evals)
OPENAI_API_KEY=your_openai_key_here

# LangSmith (optional, for tracing)
LANGCHAIN_API_KEY=your_langsmith_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=korean-dexter
```

### 6. Configure TypeScript (Strict Mode)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 7. Add Korean Text Dependency

```bash
bun add hangul-js
```

### 8. Create Placeholder Files

Create stub files for new directories to make them committable:

```typescript
// src/shared/types.ts
export type ResolvedCompany = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

export type NormalizedAmount = {
  raw: number;
  formatted: string;
};

// src/utils/hangul.ts
export function isHangul(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text);
}
```

### 9. Verify Build

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Build
bun run build

# Test (should fail gracefully with no tests yet)
bun test
```

### 10. Initial Commit

```bash
git add .
git commit -m "feat: fork Dexter and create Korean market scaffold

- Pin upstream Dexter at [COMMIT_HASH]
- Remove US financial tools and eval dataset
- Create directory structure for Korean market tools
- Configure TypeScript strict mode
- Add hangul-js dependency
- Create .env.example with API key templates
- Set up Bun build and test scripts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push -u origin main
```

---

## Acceptance Criteria

- [ ] Repository forked at pinned commit
- [ ] US-specific code removed (src/tools/financial-datasets/, US eval questions)
- [ ] All new directories created (tools/core/, mapping/, shared/, infra/)
- [ ] package.json updated with Korean Dexter metadata
- [ ] .env.example created with all required API keys
- [ ] TypeScript strict mode enabled in tsconfig.json
- [ ] hangul-js dependency added
- [ ] `bun install` succeeds
- [ ] `bun run typecheck` passes (with stub files)
- [ ] `bun run build` succeeds
- [ ] Initial commit pushed to `git@github.com-personal:juuc/korean-dexter.git`

---

## Deliverables

1. Forked repository with clean directory structure
2. Working Bun build pipeline
3. .env.example documenting all required API keys
4. Initial commit establishing project foundation

---

## Timeline

**Effort**: Large (2-3 days)
**Parallelizable**: No (blocks all other Phase 1 implementation)

---

## Dependencies

- [[phase-1-foundation/01-assumptions|Assumptions Validated]] - don't start coding until assumptions checked
- [[phase-1-foundation/02-competitive-analysis|Competitive Analysis]] - informs what we keep/remove
- [[phase-1-foundation/20-user-persona|User Persona]] - determines CLI vs library architecture

---

## Blocks

**CRITICAL**: This blocks ALL Phase 1 implementation and ALL Phase 2 work.

- [[phase-1-foundation/04-corp-resolver|Corp Code Resolver]]
- [[phase-1-foundation/05-data-model|Cross-API Data Model]]
- [[phase-1-foundation/10-rate-limiter|Rate Limiter]]
- [[phase-1-foundation/11-cache|Cache Layer]]
- [[phase-2-core/06-opendart|OpenDART Client]]
- [[phase-2-core/08-kis|KIS Client]]
- All subsequent phases

---

## Notes

- Pin to specific Dexter commit to avoid breaking changes from upstream
- Keep agent core intact - don't rewrite what works
- Focus on infrastructure setup, not feature implementation (tools come in Phase 2)
- Verify build at each step to catch issues early
