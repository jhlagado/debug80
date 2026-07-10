export type RegisterContractsUnit =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'H'
  | 'L'
  | 'IXH'
  | 'IXL'
  | 'IYH'
  | 'IYL'
  | 'SPH'
  | 'SPL'
  | 'carry'
  | 'zero'
  | 'sign'
  | 'parity'
  | 'halfCarry';

export interface RoutineContractDeclaration {
  readonly in: readonly RegisterContractsUnit[];
  readonly out: readonly RegisterContractsUnit[];
  readonly maybeOut: readonly RegisterContractsUnit[];
  readonly clobbers: readonly RegisterContractsUnit[];
  readonly preserves: readonly RegisterContractsUnit[];
}
