/**
 * LangSmith Evaluation Runner for Dexter
 *
 * Usage:
 *   bun run eval                                      # Run with fixtures (default)
 *   bun run eval:live                                 # Run with live API calls
 *   bun run src/evals/run.ts --sample 10              # Run on random sample of 10 questions
 *   bun run src/evals/run.ts --category quantitative_retrieval  # Run specific category
 *   bun run src/evals/run.ts --live --sample 5        # Combine flags
 */

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { Client } from 'langsmith';
import type { EvaluationResult } from 'langsmith/evaluation';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent } from '../agent/agent.js';
import { EvalApp, type EvalProgressEvent } from './components/index.js';
import { NumericalScorer } from './scorers/numerical.js';
import type { FixtureSet } from './fixtures/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface Example {
  readonly inputs: { readonly question: string };
  readonly outputs: { readonly answer: string };
  readonly type: string;
  readonly scoringMethod: string;
  readonly tolerance: number | undefined;
}

// ============================================================================
// CSV Parser - handles multi-line quoted fields
// ============================================================================

function parseCSV(csvContent: string): Example[] {
  const examples: Example[] = [];
  const lines = csvContent.split('\n');

  let i = 1; // Skip header row

  while (i < lines.length) {
    const result = parseRow(lines, i);
    if (result) {
      const { row, nextIndex } = result;
      if (row.length >= 2 && row[0].trim()) {
        examples.push({
          inputs: { question: row[0] },
          outputs: { answer: row[1] },
          type: row[2]?.trim() || '',
          scoringMethod: row[3]?.trim() || 'llm_judge',
          tolerance: row[4]?.trim() ? parseFloat(row[4]) : undefined,
        });
      }
      i = nextIndex;
    } else {
      i++;
    }
  }

  return examples;
}

function parseRow(lines: string[], startIndex: number): { row: string[]; nextIndex: number } | null {
  if (startIndex >= lines.length || !lines[startIndex].trim()) {
    return null;
  }

  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let lineIndex = startIndex;
  let charIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    while (charIndex < line.length) {
      const char = line[charIndex];
      const nextChar = line[charIndex + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          charIndex += 2;
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false;
          charIndex++;
        } else {
          currentField += char;
          charIndex++;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
          charIndex++;
        } else if (char === ',') {
          // End of field
          fields.push(currentField);
          currentField = '';
          charIndex++;
        } else {
          currentField += char;
          charIndex++;
        }
      }
    }

    if (inQuotes) {
      // Continue to next line (multi-line field)
      currentField += '\n';
      lineIndex++;
      charIndex = 0;
    } else {
      // Row complete
      fields.push(currentField);
      return { row: fields, nextIndex: lineIndex + 1 };
    }
  }

  // Handle case where file ends while in quotes
  if (currentField) {
    fields.push(currentField);
  }
  return { row: fields, nextIndex: lineIndex };
}

// ============================================================================
// Sampling utilities
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// Target function - wraps Dexter agent
// ============================================================================

async function target(inputs: { question: string }): Promise<{ answer: string }> {
  const agent = Agent.create({ model: 'gemini-3-pro-preview', maxIterations: 10 });
  let answer = '';

  for await (const event of agent.run(inputs.question)) {
    if (event.type === 'done') {
      answer = event.answer;
    }
  }

  return { answer };
}

// ============================================================================
// Correctness evaluator - LLM-as-judge using Gemini
// ============================================================================

const EvaluatorOutputSchema = z.object({
  score: z.enum(['1.0', '0.75', '0.5', '0.25', '0.0']).transform(Number),
  comment: z.string(),
  hallucination: z.boolean(),
});

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-3-pro-preview',
  apiKey: process.env.GOOGLE_API_KEY,
});

const structuredLlm = llm.withStructuredOutput(EvaluatorOutputSchema);

async function correctnessEvaluator({
  outputs,
  referenceOutputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<EvaluationResult> {
  const actualAnswer = (outputs?.answer as string) || '';
  const expectedAnswer = (referenceOutputs?.answer as string) || '';

  const prompt = `You are evaluating the correctness of an AI financial research assistant's answer about Korean market data.

Compare the actual answer to the expected answer using this rubric:

Scoring rubric:
- 1.0 = Fully correct. All key financial figures and facts match the expected answer.
- 0.75 = Mostly correct. The key figure is correct but minor details are wrong or missing (e.g., slightly different wording, missing context).
- 0.5 = Partially correct. Right direction but significant numerical error (>5% off) or missing important details.
- 0.25 = Marginally relevant. Right topic but wrong figures or outdated data.
- 0.0 = Incorrect. Wrong answer, hallucinated data, or completely irrelevant response.

Hallucination detection:
- Set hallucination to true if the answer contains specific numbers or facts that appear fabricated (not matching the expected answer and not a reasonable rounding/formatting difference).

Expected Answer:
${expectedAnswer}

Actual Answer:
${actualAnswer}

Evaluate and provide:
- score: one of "1.0", "0.75", "0.5", "0.25", "0.0"
- comment: brief explanation of why this score was given
- hallucination: true if fabricated data detected, false otherwise`;

  try {
    const result = await structuredLlm.invoke(prompt);
    const comment = result.hallucination
      ? `[HALLUCINATION] ${result.comment}`
      : result.comment;
    return {
      key: 'correctness',
      score: Number(result.score) || 0,
      comment,
    };
  } catch (error) {
    return {
      key: 'correctness',
      score: 0,
      comment: `Evaluator error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Evaluation generator - yields progress events for the UI
// ============================================================================

interface EvalRunnerOptions {
  sampleSize?: number;
  category?: string;
  useFixtures?: boolean;
}

function createEvaluationRunner(options: EvalRunnerOptions = {}) {
  const { sampleSize, category, useFixtures = true } = options;

  return async function* runEvaluation(): AsyncGenerator<EvalProgressEvent, void, unknown> {
    // Load and parse dataset
    const csvPath = path.join(__dirname, 'dataset', 'finance_agent.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    let examples = parseCSV(csvContent);
    const totalCount = examples.length;

    // Apply category filter
    if (category) {
      examples = examples.filter(e => e.type === category);
      if (examples.length === 0) {
        throw new Error(`No examples found for category: ${category}`);
      }
    }

    // Apply sampling if requested
    if (sampleSize && sampleSize < examples.length) {
      examples = shuffleArray(examples).slice(0, sampleSize);
    }

    // Wire fixture clients to replace real API clients
    if (useFixtures) {
      const { loadFixtureIndex, loadFixtureSet, createMockOpenDartClient, createMockKISClient } = await import('./fixtures/index.js');
      const { setDartClient, setKisClient, setResolverData, setDemoMode } = await import('../tools/langchain-tools.js');

      const index = loadFixtureIndex();
      const fixtureSets = new Map<string, FixtureSet>();
      for (const company of index.companies) {
        const set = loadFixtureSet(company.corpCode);
        if (set) fixtureSets.set(company.corpCode, set);
      }

      if (fixtureSets.size > 0) {
        setDartClient(createMockOpenDartClient(fixtureSets));
        setKisClient(createMockKISClient(fixtureSets));

        // Pre-populate corp code resolver from fixture company responses
        const resolverData = Array.from(fixtureSets.values()).map(set => {
          // Extract stock_code from the company endpoint response
          const companyResponse = set.responses.find(r => r.endpoint === 'company');
          const stockCode = (companyResponse?.response as Record<string, string>)?.stock_code ?? '';
          return {
            corp_code: set.corpCode,
            corp_name: set.corpName,
            stock_code: stockCode,
          };
        });
        setResolverData(resolverData);
      }

      // Enable demo mode so all tools are created regardless of API keys
      setDemoMode(true);
    }

    // Create LangSmith client
    const client = new Client();

    // Create a unique dataset name for this run (sampling creates different datasets)
    const datasetName = sampleSize
      ? `dexter-finance-eval-sample-${sampleSize}-${Date.now()}`
      : 'dexter-finance-eval';

    // Yield init event
    yield {
      type: 'init',
      total: examples.length,
      datasetName: sampleSize ? `finance_agent (sample ${sampleSize}/${totalCount})` : 'finance_agent',
    };

    // Check if dataset exists (only for full runs)
    let dataset;
    if (!sampleSize) {
      try {
        dataset = await client.readDataset({ datasetName });
      } catch {
        // Dataset doesn't exist, will create
        dataset = null;
      }
    }

    // Create dataset if needed
    if (!dataset) {
      dataset = await client.createDataset(datasetName, {
        description: sampleSize
          ? `Finance agent evaluation (sample of ${sampleSize})`
          : 'Finance agent evaluation dataset',
      });

      // Upload examples
      await client.createExamples({
        datasetId: dataset.id,
        inputs: examples.map((e) => e.inputs),
        outputs: examples.map((e) => e.outputs),
      });
    }

    // Generate experiment name for tracking
    const experimentName = `dexter-eval-${Date.now().toString(36)}`;

    // Initialize scorers
    const numericalScorer = new NumericalScorer();

    // Run evaluation manually - process each example one by one
    for (const example of examples) {
      const question = example.inputs.question;

      // Yield question start - UI shows this immediately
      yield {
        type: 'question_start',
        question,
      };

      // Run the agent to get an answer
      const startTime = Date.now();
      const outputs = await target(example.inputs);
      const endTime = Date.now();

      // Run the appropriate scorer based on scoring method
      let evalResult: EvaluationResult;

      if (example.scoringMethod === 'numerical') {
        // Use numerical scorer
        const scorerResult = numericalScorer.score(
          example.outputs.answer,
          outputs.answer,
          example.tolerance
        );
        evalResult = {
          key: 'correctness',
          score: scorerResult.score,
          comment: scorerResult.comment,
        };
      } else {
        // Use LLM-as-judge
        evalResult = await correctnessEvaluator({
          inputs: example.inputs,
          outputs,
          referenceOutputs: example.outputs,
        });
      }

      // Log to LangSmith for tracking
      await client.createRun({
        name: 'dexter-eval-run',
        run_type: 'chain',
        inputs: example.inputs,
        outputs,
        start_time: startTime,
        end_time: endTime,
        project_name: experimentName,
        extra: {
          dataset: datasetName,
          reference_outputs: example.outputs,
          evaluation: {
            score: evalResult.score,
            comment: evalResult.comment,
            hallucination: evalResult.comment?.startsWith('[HALLUCINATION]') ?? false,
          },
        },
      });

      // Yield question end with result - UI updates progress bar
      yield {
        type: 'question_end',
        question,
        score: Number(evalResult.score) || 0,
        comment: evalResult.comment || '',
        scoringMethod: example.scoringMethod,
      };
    }

    // Clean up fixture clients
    const { resetClients } = await import('../tools/langchain-tools.js');
    resetClients();

    // Yield complete event
    yield {
      type: 'complete',
      experimentName,
    };
  };
}

// ============================================================================
// Main entry point
// ============================================================================

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const sampleIndex = args.indexOf('--sample');
  const sampleSize = sampleIndex !== -1 ? parseInt(args[sampleIndex + 1]) : undefined;

  // Parse --category flag
  const categoryIndex = args.indexOf('--category');
  const category = categoryIndex !== -1 ? args[categoryIndex + 1] : undefined;

  // Parse --fixtures flag (default behavior)
  const useFixtures = !args.includes('--live');

  // Create the evaluation runner with options
  const runEvaluation = createEvaluationRunner({ sampleSize, category, useFixtures });

  // Render the Ink UI
  const { waitUntilExit } = render(
    React.createElement(EvalApp, { runEvaluation })
  );

  await waitUntilExit();
}

main().catch(console.error);
