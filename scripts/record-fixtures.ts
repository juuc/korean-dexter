#!/usr/bin/env bun

import { recordFixtures } from '../src/evals/fixtures/recorder.js';

/**
 * CLI entry point for recording fixture data.
 *
 * Usage:
 *   bun scripts/record-fixtures.ts --corp-codes 00126380,00164779
 *   bun scripts/record-fixtures.ts --all
 */

async function main() {
  const args = process.argv.slice(2);

  let corpCodes: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--corp-codes') {
      const codesArg = args[i + 1];
      if (!codesArg) {
        console.error('Error: --corp-codes requires a comma-separated list of corp codes');
        process.exit(1);
      }
      corpCodes = codesArg.split(',').map(code => code.trim());
      i++; // Skip next arg
    } else if (arg === '--all') {
      // For now, use a predefined list of companies
      // In a real implementation, this could fetch from a master list
      corpCodes = [
        '00126380', // Samsung Electronics
        '00164779', // Hyundai Motor
      ];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: bun scripts/record-fixtures.ts [options]

Options:
  --corp-codes <codes>  Comma-separated list of corp codes to record
  --all                 Record fixtures for a predefined list of companies
  --help, -h           Show this help message

Examples:
  bun scripts/record-fixtures.ts --corp-codes 00126380,00164779
  bun scripts/record-fixtures.ts --all
      `);
      process.exit(0);
    }
  }

  if (corpCodes.length === 0) {
    console.error('Error: No corp codes specified. Use --corp-codes or --all');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  console.log(`Recording fixtures for ${corpCodes.length} companies...`);
  console.log('');

  await recordFixtures(corpCodes);

  console.log('');
  console.log('✓ Fixture recording complete');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
