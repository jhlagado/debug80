export interface AssemblerRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly hexText?: string;
  readonly binBytes?: Uint8Array;
  readonly d8mJson?: unknown;
  readonly asm80Text?: string;
  readonly diagnosticsText?: string[];
}
