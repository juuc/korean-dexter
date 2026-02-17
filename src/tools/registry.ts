import { StructuredToolInterface } from '@langchain/core/tools';
import { createKoreanFinancialTools } from './langchain-tools.js';

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  /** Tool name (must match the tool's name property) */
  name: string;
  /** The actual tool instance */
  tool: StructuredToolInterface;
  /** Rich description for system prompt (includes when to use, when not to use, etc.) */
  description: string;
}

/**
 * Get all registered tools with their descriptions.
 * Includes Korean financial tools (OpenDART, KIS, BOK, KOSIS) based on available API keys.
 */
export function getToolRegistry(_model: string): RegisteredTool[] {
  return createKoreanFinancialTools();
}

/**
 * Get just the tool instances for binding to the LLM.
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 */
export function buildToolDescriptions(model: string): string {
  const tools = getToolRegistry(model);
  if (tools.length === 0) {
    return 'No tools available yet. Korean financial tools (OpenDART, KIS) will be added in Phase 2.';
  }
  return tools
    .map((t) => `### ${t.name}\n\n${t.description}`)
    .join('\n\n');
}
