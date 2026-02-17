#!/usr/bin/env bun
/**
 * Quick test script to run a query through the agent without the Ink UI.
 * Usage: bun run scripts/test-query.ts "삼성전자 재무 현황"
 */
import { config } from 'dotenv';
config({ quiet: true });

import { Agent } from '../src/agent/agent.js';

const query = process.argv[2] ?? '삼성전자 재무 현황';

console.log(`\n Query: ${query}\n`);
console.log('---');

const agent = Agent.create({
  maxIterations: 10,
});

for await (const event of agent.run(query)) {
  switch (event.type) {
    case 'thinking':
      console.log(`\n Thinking: ${event.message.slice(0, 200)}...`);
      break;
    case 'tool_start':
      console.log(`\n Tool: ${event.tool}(${JSON.stringify(event.args).slice(0, 200)})`);
      break;
    case 'tool_end':
      console.log(`   Result: ${event.result.slice(0, 300)}${event.result.length > 300 ? '...' : ''}`);
      break;
    case 'tool_error':
      console.log(`   Error: ${event.error}`);
      break;
    case 'answer_start':
      console.log('\n Generating answer...');
      break;
    case 'context_cleared':
      console.log(`\n Context cleared: ${event.clearedCount} old results removed`);
      break;
    case 'done':
      console.log('\n===== ANSWER =====\n');
      console.log(event.answer);
      console.log('\n==================');
      console.log(`\n Stats: ${event.iterations} iterations, ${event.toolCalls.length} tool calls, ${event.totalTime}ms`);
      if (event.tokenUsage) {
        console.log(`   Tokens: ${event.tokenUsage.inputTokens ?? '?'} in / ${event.tokenUsage.outputTokens ?? '?'} out`);
      }
      break;
  }
}
