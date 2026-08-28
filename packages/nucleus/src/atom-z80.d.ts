declare module "atom-z80" {
  export function assembleAtomProject(options: {
    readonly root: string;
    readonly entry: string;
    readonly target: { readonly start: number; readonly capacity: number };
    readonly maxInstructions?: number;
    readonly maxCycles?: number;
  }): Promise<{
    readonly generation: {
      readonly finalCursor: number;
      readonly images: readonly { readonly address: number }[];
      readonly layout?: readonly {
        readonly kind: string;
        readonly address: number;
        readonly count: number;
      }[];
      readonly symbols?: readonly {
        readonly name: string;
        readonly value: number;
      }[];
    };
  }>;

  export function materializeAtomGeneration(
    generation: {
      readonly finalCursor: number;
      readonly images: readonly { readonly address: number }[];
      readonly layout?: readonly {
        readonly kind: string;
        readonly address: number;
        readonly count: number;
      }[];
    },
    options?: { readonly base?: number; readonly fill?: number },
  ): {
    readonly base: number;
    readonly end: number;
    readonly bytes: Uint8Array;
  };

  export function writeIntelHex(
    materialized: {
      readonly base: number;
      readonly end: number;
      readonly bytes: Uint8Array;
    },
    options?: { readonly lineEnding?: string },
  ): string;
}
