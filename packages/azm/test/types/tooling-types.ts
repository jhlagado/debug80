import type {
  AnalyzeProgramResult,
  LoadedProgram,
  LoadProgramOptions,
  LoadProgramResult,
} from '../../src/index.js';

const loadOptions: LoadProgramOptions = {
  entryFile: 'main.asm',
  includeDirs: ['include'],
  preloadedText: 'main:\n  ret\n',
};

const loaded: LoadedProgram = {
  program: {
    kind: 'Program',
    entryFile: 'main.asm',
    files: [{ kind: 'SourceFile', name: 'main.asm', items: [] }],
  },
  sourceTexts: new Map([['main.asm', 'main:\n  ret\n']]),
  sourceLineComments: new Map(),
  logicalLines: [
    { sourceName: 'main.asm', line: 1, text: 'main:' },
    { sourceName: 'main.asm', line: 2, text: '  ret' },
  ],
};

const loadResult: LoadProgramResult = {
  diagnostics: [],
  loadedProgram: loaded,
};

const analysis: AnalyzeProgramResult = {
  diagnostics: [],
  env: { symbols: { main: 0 } },
};

void loadOptions;
void loadResult;
void analysis;
