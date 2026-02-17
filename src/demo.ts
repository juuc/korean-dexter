#!/usr/bin/env bun
/**
 * Demo mode entry point — runs Korean Dexter with fixture data, no API keys required.
 *
 * Usage: bun run demo
 *
 * This script:
 * 1. Loads fixture data from src/evals/fixtures/data/
 * 2. Injects mock API clients that return fixture responses
 * 3. Pre-populates the corp code resolver with fixture companies
 * 4. Runs the agent with a sample question
 * 5. Cleans up when done
 */

import { Agent } from '@/agent/agent.js';
import { loadFixtureIndex, loadFixtureSet, createMockOpenDartClient, createMockKISClient } from '@/evals/fixtures/index.js';
import { setDartClient, setKisClient, setResolverData, setDemoMode, resetClients } from '@/tools/langchain-tools.js';
import type { FixtureSet } from '@/evals/fixtures/types.js';

async function runDemo(): Promise<void> {
  console.log('🎬 Korean Dexter Demo Mode\n');
  console.log('Loading fixture data...');

  // Load fixture index and data
  const index = loadFixtureIndex();
  const fixtureSets = new Map<string, FixtureSet>();

  if (index.companies.length === 0) {
    console.log('⚠️  No fixture data found in index.json');
    console.log('   The demo will run but tools may not return meaningful data.');
    console.log('   To add fixture data, run: bun run eval:record\n');
  } else {
    console.log(`Found ${index.companies.length} companies in fixture index`);
    for (const company of index.companies) {
      const set = loadFixtureSet(company.corpCode);
      if (set) {
        fixtureSets.set(company.corpCode, set);
        console.log(`  ✓ Loaded fixtures for ${company.corpName} (${company.corpCode})`);
      }
    }
  }

  // If we have fixture sets, wire them up
  if (fixtureSets.size > 0) {
    console.log(`\nConfiguring mock API clients with ${fixtureSets.size} fixture sets...`);
    setDartClient(createMockOpenDartClient(fixtureSets));
    setKisClient(createMockKISClient(fixtureSets));

    // Pre-populate resolver with fixture companies
    const resolverData = Array.from(fixtureSets.values()).map(set => ({
      corp_code: set.corpCode,
      corp_name: set.corpName,
      stock_code: set.corpCode.replace(/^0+/, '').padStart(6, '0'), // Mock stock code from corp code
    }));
    setResolverData(resolverData);
    console.log('✓ Corp code resolver populated with fixture data');
  }

  // Enable demo mode (creates all tools regardless of API keys)
  setDemoMode(true);
  console.log('✓ Demo mode enabled\n');

  // Sample question
  const sampleQuestion = '테스트 회사의 재무제표를 보여줘';
  console.log(`Question: ${sampleQuestion}\n`);

  try {
    // Create and run agent
    const agent = Agent.create();

    console.log('--- Agent Output ---\n');

    for await (const event of agent.run(sampleQuestion)) {
      switch (event.type) {
        case 'thinking':
          console.log(`💭 Thinking: ${event.message}\n`);
          break;
        case 'tool_start':
          console.log(`🔧 Tool: ${event.tool}`);
          console.log(`   Input: ${JSON.stringify(event.args, null, 2)}`);
          break;
        case 'tool_end':
          console.log(`   ✓ Completed in ${event.duration}ms`);
          console.log(`   Result: ${event.result.substring(0, 200)}...\n`);
          break;
        case 'tool_error':
          console.log(`   ❌ Error: ${event.error}\n`);
          break;
        case 'answer_start':
          console.log('--- Final Answer ---\n');
          break;
        case 'done':
          console.log(event.answer);
          console.log(`\n--- Summary ---`);
          console.log(`Iterations: ${event.iterations}`);
          console.log(`Total time: ${event.totalTime}ms`);
          console.log(`Tool calls: ${event.toolCalls.length}`);
          if (event.tokenUsage) {
            console.log(`Tokens: ${event.tokenUsage.totalTokens} (input: ${event.tokenUsage.inputTokens}, output: ${event.tokenUsage.outputTokens})`);
          }
          break;
      }
    }
  } catch (error) {
    console.error('\n❌ Error running demo:', error);
    process.exit(1);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    resetClients();
    console.log('✓ Demo complete');
  }
}

// Run demo
runDemo().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
