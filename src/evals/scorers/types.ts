/**
 * Result of scoring an eval question.
 */
export interface ScorerResult {
  /** Score between 0 and 1 (0, 0.25, 0.5, 0.75, 1.0) */
  readonly score: number;
  /** Explanation of the score */
  readonly comment: string;
  /** Scoring method used */
  readonly method: 'numerical' | 'llm_judge';
  /** Whether hallucination was detected */
  readonly hallucination?: boolean;
}

/**
 * Interface for all scorers.
 */
export interface Scorer {
  score(expected: string, actual: string, tolerance?: number): ScorerResult;
}
