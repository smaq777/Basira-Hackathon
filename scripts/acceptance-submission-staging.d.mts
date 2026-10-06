export type AcceptanceReceiptRow = {
  case: string;
  expected: string;
  passed: boolean;
  failure?: string;
  reviewId?: string;
};
export function runSubmissionAcceptance(
  args: string[],
  dependencies?: {
    fetch?: typeof globalThis.fetch;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    writeFile?: (path: string, data: string) => Promise<void>;
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    log?: (message: string) => void;
  },
): Promise<{ exitCode: number; rows: AcceptanceReceiptRow[]; output?: string }>;
