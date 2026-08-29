#!/usr/bin/env node
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultProofRoot = path.join(packageRoot, "proofs");

const allowedDirectives = new Set([
  "db",
  "ds",
  "dw",
  "else",
  "end",
  "endif",
  "equ",
  "if",
  "include",
  "org",
  "routine",
]);

const mechanicalDirectives = new Set([
  "db",
  "ds",
  "dw",
  "else",
  "end",
  "endif",
  "equ",
  "if",
  "include",
  "org",
]);

const identifierPattern = /^[A-Za-z_.$?][A-Za-z0-9_.$?]*$/;
const sourceIdentifierPattern = /(^|[^A-Za-z0-9_.$?])([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?=$|[^A-Za-z0-9_.$?])/g;
const simpleConditionPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const onePastAddressSpaceEquPattern = /^\s*(AddressSpaceLimit|ProofMemoryEnd):?\s+\.equ\s+\$10000\s*$/i;
const directiveTranslations = new Map([
  ["db", "DB"],
  ["ds", "DS"],
  ["dw", "DW"],
  ["else", "%ELSE"],
  ["endif", "%ENDIF"],
  ["equ", "EQU"],
  ["if", "%IF"],
  ["include", "%INCLUDE"],
  ["org", "ORG"],
]);

const permanentLayoutTransforms = new Map([
  ["vertical-slice/compiler-slice-proof.asm", Object.freeze({
    description: "compiler-slice proof header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/compiler-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/compiler-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "MalformedSourceEnd-MalformedSource",
      }),
    ]),
    rewrite: rewriteCompilerSlicePermanentAtomSource,
  })],
  ["vertical-slice/z80-slice-proof.asm", Object.freeze({
    description: "z80-slice proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/z80-slice-proof.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteZ80SlicePermanentAtomSource,
  })],
  ["vertical-slice/loop-compiler-slice-proof.asm", Object.freeze({
    description: "loop compiler proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-compiler-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-compiler-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "CounterWriteStart-CounterWriteSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-compiler-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "MissingEndSourceEnd-MissingEndSource",
      }),
    ]),
    rewrite: rewriteLoopCompilerSliceProofPermanentAtomSource,
  })],
  ["vertical-slice/loop-z80-slice-proof.asm", Object.freeze({
    description: "loop z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-slice-proof.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteLoopZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/call-z80-slice-proof.asm", Object.freeze({
    description: "call z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/call-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/call-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SemanticBufferBase+$10",
      }),
      Object.freeze({
        file: "asm/vertical-slice/call-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "BadCompletionName-BadCompletionSource",
      }),
    ]),
    rewrite: rewriteCallZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/stage7-ll1-parser-coverage-proof.asm", Object.freeze({
    description: "stage7 parser coverage proof entry wrapper",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-parser-coverage-proof.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteStage7Ll1ParserCoverageProofPermanentAtomSource,
  })],
  ["vertical-slice/stage7-parser-coverage-proof.asmi", Object.freeze({
    description: "stage7 parser coverage proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-parser-coverage-proof.asmi",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteStage7ParserCoverageProofPermanentAtomSource,
  })],
  ["vertical-slice/flat-target-z80-slice-proof.asm", Object.freeze({
    description: "flat target z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedBegin+TargetDescriptorImageBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedContext+$00",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedContext+$06",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedContext+$0E",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+$01",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+$03",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+$05",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+$09",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapAggregateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapBssBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapDataLoadAddress",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapInitializedLength",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapStackRequirement",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapVectorLength",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AdapterCapturedMap+TargetMapWritableBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/flat-target-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorBankCount",
      }),
    ]),
    rewrite: rewriteFlatTargetZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/typed-expression-z80-slice-proof.asm", Object.freeze({
    description: "typed-expression z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TypedNarrowTrapPoint-TypedNarrowTrapSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TypedDivideTrapPoint-TypedDivideTrapSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TypedNestedDivideOuter-TypedNestedDivideTrapSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TypedNestedNarrowOuter-TypedNestedNarrowTrapSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeU8",
      }),
    ]),
    rewrite: rewriteTypedExpressionZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/expression-z80-slice-proof.asm", Object.freeze({
    description: "expression z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ExpressionOutputCall-ExpressionProofSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "DuplicateScalarName-DuplicateScalarSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "UnknownScalarName-UnknownScalarSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "MalformedExpressionPoint-MalformedExpressionSource",
      }),
      Object.freeze({
        file: "asm/vertical-slice/expression-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "FullScalarName-FullScalarSource",
      }),
    ]),
    rewrite: rewriteExpressionZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/aggregate-z80-slice-proof.asm", Object.freeze({
    description: "aggregate z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/aggregate-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      ..."AggregateExpectedImageEnd-AggregateExpectedImage|AggregateFieldTableBase+AggregateFieldOffset|AggregateFieldTableBase+AggregateFieldEntrySize|SymbolTableBase+SymbolEntrySize|AggregateRecordStepPoint-AggregateRecordStepSource|AggregateDuplicateFieldPoint-AggregateDuplicateFieldSource|AggregateStringExtentCapacityPoint-AggregateStringExtentCapacitySource|AggregateDataCapacityPoint-AggregateDataCapacitySource"
        .split("|")
        .map((messageIncludes) => Object.freeze({
          file: "asm/vertical-slice/aggregate-z80-slice-proof.asm",
          code: "atom-symbol-expression",
          messageIncludes,
        })),
    ]),
    rewrite: rewriteAggregateZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/structured-control-z80-slice-proof.asm", Object.freeze({
    description: "structured-control z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/structured-control-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      ..."StructuredAcceptedRecursiveCall-StructuredAcceptedSource|StructuredRangeCounter-StructuredRangeSource|StructuredActiveCounterName-StructuredActiveCounterSource|StructuredExitOutsidePoint-StructuredExitOutsideSource|StructuredZeroStepPoint-StructuredZeroStepSource|StructuredStrayElsePoint-StructuredStrayElseSource|StructuredStrayElseIfPoint-StructuredStrayElseIfSource|StructuredSecondForwardPoint-StructuredSecondForwardSource|StructuredProgramForwardPoint-StructuredProgramForwardSource|StructuredLocalForwardPoint-StructuredLocalForwardSource|StructuredMainForwardPoint-StructuredMainForwardSource|StructuredParameterForwardPoint-StructuredParameterForwardSource|StructuredProgramMainPoint-StructuredProgramMainSource|StructuredLocalMainPoint-StructuredLocalMainSource|StructuredParameterMainPoint-StructuredParameterMainSource|StructuredLabelCapacityPoint-StructuredLabelCapacitySource"
        .split("|")
        .map((messageIncludes) => Object.freeze({
          file: "asm/vertical-slice/structured-control-z80-slice-proof.asm",
          code: "atom-symbol-expression",
          messageIncludes,
        })),
    ]),
    rewrite: rewriteStructuredControlZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/array-z80-slice-proof.asm", Object.freeze({
    description: "array z80 proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/array-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/array-z80-slice-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "BadArrayValue-BadArraySource",
      }),
    ]),
    rewrite: rewriteArrayZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/stage7-ll1-parser.asm", Object.freeze({
    description: "stage7 LL(1) parser generated-table tail layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-parser.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteStage7Ll1ParserPermanentAtomSource,
  })],
  ["vertical-slice/proof-unsegmented-state.asmi", Object.freeze({
    description: "entry-owned unsegmented proof state feature flag",
    handledIssues: Object.freeze([]),
    rewrite: rewriteProofUnsegmentedStatePermanentAtomSource,
  })],
  ["vertical-slice/proof-segmented-state.asmi", Object.freeze({
    description: "entry-owned segmented proof state feature flag",
    handledIssues: Object.freeze([]),
    rewrite: rewriteProofSegmentedStatePermanentAtomSource,
  })],
  ["vertical-slice/stage7-ll1-engine-proof.asm", Object.freeze({
    description: "stage7 LL(1) engine proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-engine-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-engine-proof.asm",
        code: "atom-symbol-expression",
        messageIncludes: "HybridLL1StackBase+HybridLL1StackCapacity",
      }),
    ]),
    rewrite: rewriteStage7Ll1EngineProofPermanentAtomSource,
  })],
  ["vertical-slice/stage7-ll1-aggregate-call-z80-slice-proof.asm", Object.freeze({
    description: "Stage 7 aggregate-call proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-aggregate-call-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-aggregate-call-z80-slice-proof.asm",
        code: "atom-symbol-expression",
      }),
    ]),
    rewrite: rewriteStage7Ll1AggregateCallZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/stage8-failure-z80-slice-proof.asm", Object.freeze({
    description: "Stage 8 failure proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage8-failure-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage8-failure-z80-slice-proof.asm",
        code: "atom-symbol-expression",
      }),
    ]),
    rewrite: rewriteStage8FailureZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/stage9-conformance-z80-slice-proof.asm", Object.freeze({
    description: "Stage 9 conformance proof sectioned header-include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage9-conformance-z80-slice-proof.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage9-conformance-z80-slice-proof.asm",
        code: "atom-symbol-expression",
      }),
    ]),
    rewrite: rewriteStage9ConformanceZ80SliceProofPermanentAtomSource,
  })],
  ["vertical-slice/aggregate-call-parser.asm", Object.freeze({
    description: "aggregate-call parser Stage 7 header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorBankCount",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorEntryBank",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorPartBanksPointer",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TargetBankRoLengthLimit-TargetBankRoLengthBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "Stage7CompilerWorkspaceEnd-Stage7StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolAggregateFlag+SymbolClassParameter",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeU8",
      }),
    ]),
    rewrite: rewriteAggregateCallParserPermanentAtomSource,
  })],
  ["vertical-slice/stage7-ll1-actions.asm", Object.freeze({
    description: "stage7 LL(1) action constant-expression aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-actions.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolRecordTypeFlag+SymbolAggregateFlag",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-actions.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolAggregateFlag+SymbolClassConstant",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-actions.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarMetaTypeMask",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-actions.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeBoolean",
      }),
      Object.freeze({
        file: "asm/vertical-slice/stage7-ll1-actions.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ControlFrameCounter-ControlFrameLabelA",
      }),
    ]),
    rewrite: rewriteStage7Ll1ActionsPermanentAtomSource,
  })],
  ["vertical-slice/aggregate-parser.asm", Object.freeze({
    description: "aggregate parser constant-expression aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/aggregate-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolRecordTypeFlag+SymbolAggregateFlag",
      }),
    ]),
    rewrite: rewriteAggregateParserPermanentAtomSource,
  })],
  ["vertical-slice/aggregate-call-z80.asm", Object.freeze({
    description: "aggregate-call z80 sink constant-expression aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/aggregate-call-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapOffset-StateBase",
      }),
    ]),
    rewrite: rewriteAggregateCallZ80PermanentAtomSource,
  })],
  ["vertical-slice/aggregate-z80.asm", Object.freeze({
    description: "aggregate z80 sink constant-expression aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/aggregate-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolAggregateFlag+SymbolClassMask",
      }),
      Object.freeze({
        file: "asm/vertical-slice/aggregate-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolAggregateFlag+SymbolClassConstant",
      }),
    ]),
    rewrite: rewriteAggregateZ80PermanentAtomSource,
  })],
  ["vertical-slice/loop-z80-sink.asm", Object.freeze({
    description: "loop z80 sink target-state and segment aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "GeneratedRoDataBase-GeneratedBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SegmentCodeEntry+SegmentEntryLimit",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SegmentRoDataEntry+SegmentEntryBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SegmentDataEntry+SegmentEntryLimit",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SegmentBssEntry+SegmentEntryBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+SegmentEntryBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+SegmentEntryLimit",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapNumber-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapRoutine-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapOffset-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "RunState-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-sink.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapError-StateBase",
      }),
    ]),
    rewrite: rewriteLoopZ80SinkPermanentAtomSource,
  })],
  ["vertical-slice/target-output.asm", Object.freeze({
    description: "target output descriptor and state aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorRuntimeIdentity",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorFlags",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorImageBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorImageCapacity",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorWritableBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "IX+TargetDescriptorWritableCapacity",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "NucleusRuntimeVectorLength+NucleusRuntimeStateLength",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "RunState-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/target-output.asm",
        code: "atom-symbol-expression",
        messageIncludes: "TrapNumber-StateBase",
      }),
    ]),
    rewrite: rewriteTargetOutputPermanentAtomSource,
  })],
  ["vertical-slice/loop-parser.asm", Object.freeze({
    description: "loop parser typed and aggregate header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-parser.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "AggregateHasInitializer-AggregateMode",
      }),
    ]),
    rewrite: rewriteLoopParserPermanentAtomSource,
  })],
  ["vertical-slice/structured-control-parser.asm", Object.freeze({
    description: "structured-control parser constant-expression aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/structured-control-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ControlFrameMode-ControlFrameCounter",
      }),
      Object.freeze({
        file: "asm/vertical-slice/structured-control-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolRecordTypeFlag+SymbolAggregateFlag",
      }),
    ]),
    rewrite: rewriteStructuredControlParserPermanentAtomSource,
  })],
  ["vertical-slice/typed-expression-parser.asm", Object.freeze({
    description: "typed expression parser structured-control header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "SymbolRecordTypeFlag+SymbolAggregateFlag",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "$100+SemanticOr16",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "$100+SemanticXor16",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "$100+SemanticAnd16",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "$100+SemanticDivide16",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "$100+SemanticModulo16",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeExact",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeBoolean",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-parser.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ScalarMetaConstant+ScalarTypeU8",
      }),
    ]),
    rewrite: rewriteTypedExpressionParserPermanentAtomSource,
  })],
  ["vertical-slice/typed-expression-z80.asm", Object.freeze({
    description: "typed expression z80 structured-control header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80.asm",
        code: "include-after-header",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ActivationDepth-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "RootSP-StateBase",
      }),
      Object.freeze({
        file: "asm/vertical-slice/typed-expression-z80.asm",
        code: "atom-symbol-expression",
        messageIncludes: "RootIX-StateBase",
      }),
    ]),
    rewrite: rewriteTypedExpressionZ80PermanentAtomSource,
  })],
  ["vertical-slice/structured-control-z80.asm", Object.freeze({
    description: "structured-control z80 typed byte-sequence aliases",
    handledIssues: Object.freeze([]),
    rewrite: rewriteStructuredControlZ80PermanentAtomSource,
  })],
  ["vertical-slice/loop-keywords.asmi", Object.freeze({
    description: "loop keyword service signature aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-keywords.asmi",
        code: "atom-symbol-expression",
        messageIncludes: "Stage8CallableServiceFlag+Stage8ServiceResultU8",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-keywords.asmi",
        code: "atom-symbol-expression",
        messageIncludes: "Stage8CallableServiceFlag+Stage8ServiceRewindStorage",
      }),
    ]),
    rewrite: rewriteLoopKeywordsPermanentAtomSource,
  })],
  ["vertical-slice/proof-z80-runtime.asm", Object.freeze({
    description: "proof runtime wrapper header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/proof-z80-runtime.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteProofZ80RuntimePermanentAtomSource,
  })],
  ["vertical-slice/target-z80-runtime.asm", Object.freeze({
    description: "target runtime wrapper header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/target-z80-runtime.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteTargetZ80RuntimePermanentAtomSource,
  })],
  ["vertical-slice/nucleus-target-runtime-link.asm", Object.freeze({
    description: "target runtime link header include layout",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/nucleus-target-runtime-link.asm",
        code: "include-after-header",
      }),
    ]),
    rewrite: rewriteNucleusTargetRuntimeLinkPermanentAtomSource,
  })],
  ["vertical-slice/nucleus-runtime-link-context.asmi", Object.freeze({
    description: "target runtime link context entry-owned feature flags",
    handledIssues: Object.freeze([]),
    rewrite: rewriteNucleusRuntimeLinkContextPermanentAtomSource,
  })],
  ["vertical-slice/loop-z80-runtime.asm", Object.freeze({
    description: "loop z80 runtime state-span aliases",
    handledIssues: Object.freeze([
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-runtime.asm",
        code: "atom-symbol-expression",
        messageIncludes: "StateEnd-TrapNumber",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-runtime.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ServiceInputLength-ServiceFailureCall",
      }),
      Object.freeze({
        file: "asm/vertical-slice/loop-z80-runtime.asm",
        code: "atom-symbol-expression",
        messageIncludes: "ServiceStateEnd-ServiceStorageOutputLength",
      }),
    ]),
    rewrite: rewriteLoopZ80RuntimePermanentAtomSource,
  })],
]);

function parseArgs(argv) {
  const options = {
    asmRoot: defaultAsmRoot,
    proofRoot: defaultProofRoot,
    reportOnly: false,
    json: false,
    ledgerOut: undefined,
    issuesOut: undefined,
    includeReportOut: undefined,
    proofSymbolMapOut: undefined,
    proofLimitMapOut: undefined,
    proofMatrixOut: undefined,
    contractMapOut: undefined,
    migrationBundleOut: undefined,
    translatedRoot: undefined,
    translatedSymbols: "preview",
    flattenEntry: undefined,
    flattenOut: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--asm-root") {
      options.asmRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-root") {
      options.proofRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--report-only") {
      options.reportOnly = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--ledger-out") {
      options.ledgerOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--issues-out") {
      options.issuesOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--include-report-out") {
      options.includeReportOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-symbol-map-out") {
      options.proofSymbolMapOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-limit-map-out") {
      options.proofLimitMapOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-matrix-out") {
      options.proofMatrixOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--contract-map-out") {
      options.contractMapOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--migration-bundle-out") {
      options.migrationBundleOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--translated-root") {
      options.translatedRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--translated-symbols") {
      options.translatedSymbols = argv[++index];
      if (!["preview", "permanent"].includes(options.translatedSymbols)) {
        throw new Error("--translated-symbols must be preview or permanent");
      }
    } else if (arg === "--flatten-entry") {
      options.flattenEntry = argv[++index];
      if (options.flattenEntry === undefined) throw new Error("--flatten-entry requires a source path");
    } else if (arg === "--flatten-out") {
      options.flattenOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node packages/nucleus/scripts/atom-migration-dry-run.mjs [options]

Options:
  --asm-root DIR     Assembly tree to scan. Defaults to packages/nucleus/asm.
  --proof-root DIR   Proof manifest tree to scan. Defaults to packages/nucleus/proofs.
  --report-only      Exit 0 even when migration gaps are found.
  --json             Print the complete report as JSON.
  --ledger-out FILE  Write the generated long-symbol ledger as JSON.
  --issues-out FILE  Write migration issues as JSON.
  --include-report-out FILE
                     Write include-after-header groups and target classes as JSON.
  --proof-symbol-map-out FILE
                     Write proof-manifest symbol remapping as JSON.
  --proof-limit-map-out FILE
                     Write one-past-address-space proof limit symbols as JSON.
  --proof-matrix-out FILE
                     Write per-proof Atom migration readiness as JSON.
  --contract-map-out FILE
                     Write AZM .ROUTINE metadata mapped to Atom routine labels as JSON.
  --migration-bundle-out FILE
                     Write the complete Atom migration bundle as JSON.
  --translated-root DIR
                     Write generated Atom-preview source files under DIR.
  --translated-symbols preview|permanent
                     Select generated symbols for --translated-root. Defaults to
                     preview. Use permanent only for strict header-include source.
  --flatten-entry FILE
                     Textually lower includes for one entry, relative to asm root.
  --flatten-out FILE Write the flattened Atom-preview entry source to FILE.
  --help             Show this help.
`);
}

function writeJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function stripComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== "") {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ";") return line.slice(0, index);
  }
  return line;
}

function maskQuoted(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== "") {
      output += " ";
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      output += " ";
      continue;
    }
    output += character;
  }
  return output;
}

function numberValue(text) {
  if (/^\$[0-9A-Fa-f]+$/.test(text)) return Number.parseInt(text.slice(1), 16);
  if (/^%[01]+$/.test(text)) return Number.parseInt(text.slice(1), 2);
  if (/^[0-9][0-9A-Fa-f]*[Hh]$/.test(text)) return Number.parseInt(text.slice(0, -1), 16);
  if (/^[01]+[Bb]$/.test(text)) return Number.parseInt(text.slice(0, -1), 2);
  if (/^[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  return undefined;
}

function location(file, line) {
  return { file: path.relative(process.cwd(), file), line };
}

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function isIncludeHeaderLine(code) {
  const trimmed = code.trim();
  if (trimmed === "") return true;
  if (/^\s*\.include\b/i.test(code)) return true;
  return false;
}

function findAssemblyFiles(root) {
  return globSync("**/*.{asm,asmi}", { cwd: root })
    .map((name) => path.join(root, name))
    .sort();
}

function sourcePackageRoot(asmRoot) {
  const resolvedAsmRoot = path.resolve(asmRoot);
  return path.basename(resolvedAsmRoot) === "asm"
    ? path.dirname(resolvedAsmRoot)
    : resolvedAsmRoot;
}

function resolveConfinedInclude(fromFile, include, root) {
  const resolved = path.resolve(path.dirname(fromFile), include);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`include escapes Nucleus source root: ${include}`);
  }
  return resolved;
}

function combineIncludeKinds(left, right) {
  if (left === "missing" || right === "missing") return "missing";
  const hasCode = left === "code" || left === "mixed-code-data" || right === "code" || right === "mixed-code-data";
  const hasData = left === "data" || left === "mixed-code-data" || right === "data" || right === "mixed-code-data";
  if (hasCode && hasData) return "mixed-code-data";
  if (hasCode) return "code";
  if (hasData) return "data";
  return "layout-only";
}

function compatibilityLoweringCanHandle(issue) {
  return issue.code === "include-after-header" ||
    issue.code === "atom-symbol-expression" ||
    issue.code === "preprocessor-definition-after-header";
}

function nextRoutineLabel(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const code = stripComment(lines[index].replace(/\r$/, ""));
    const trimmed = code.trim();
    if (trimmed === "") continue;
    if (/^\s*\.(?:if|else|endif|routine)\b/i.test(code)) continue;
    const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(code);
    if (label !== null) return { label: label[1], line: index + 1 };
    return undefined;
  }
  return undefined;
}

function classifyIncludeTarget(file, root = sourcePackageRoot(path.dirname(file)), seen = new Set()) {
  if (!existsSync(file)) {
    return Object.freeze({
      kind: "missing",
      lines: 0,
      labels: 0,
      instructions: 0,
      dataDirectives: 0,
      orgDirectives: 0,
      nestedIncludes: 0,
      recursiveIncludes: 0,
    });
  }
  const resolvedFile = path.resolve(file);
  if (seen.has(resolvedFile)) {
    return Object.freeze({
      kind: "layout-only",
      lines: 0,
      labels: 0,
      instructions: 0,
      dataDirectives: 0,
      orgDirectives: 0,
      nestedIncludes: 0,
      recursiveIncludes: 0,
    });
  }
  seen.add(resolvedFile);
  let labels = 0;
  let instructions = 0;
  let dataDirectives = 0;
  let orgDirectives = 0;
  let nestedIncludes = 0;
  let recursiveIncludes = 0;
  let nestedKind = "layout-only";
  const lines = readFileSync(file, "utf8").split(/\n/);
  for (const raw of lines) {
    const code = stripComment(raw.replace(/\r$/, ""));
    const trimmed = code.trim();
    if (trimmed === "") continue;
    const include = includeSpecifier(code);
    if (include !== undefined) {
      nestedIncludes += 1;
      recursiveIncludes += 1;
      const nested = classifyIncludeTarget(resolveConfinedInclude(file, include, root), root, seen);
      recursiveIncludes += nested.recursiveIncludes;
      labels += nested.labels;
      instructions += nested.instructions;
      dataDirectives += nested.dataDirectives;
      orgDirectives += nested.orgDirectives;
      nestedKind = combineIncludeKinds(nestedKind, nested.kind);
    }
    if (/^\s*\.org\b/i.test(code) || /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.org\b/i.test(code)) {
      orgDirectives += 1;
    }
    if (/^\s*\.(?:db|dw|ds)\b/i.test(code) || /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.(?:db|dw|ds)\b/i.test(code)) {
      dataDirectives += 1;
    }
    if (/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:/.test(code)) labels += 1;
    const instructionCode = code.replace(/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:\s*/, "");
    if (
      instructionCode.trim() !== "" &&
      /^\s*(?:[A-Za-z][A-Za-z0-9]*)\b/.test(instructionCode) &&
      !/^\s*\.(?:db|dw|ds|equ|include|if|else|endif|org|routine|end)\b/i.test(instructionCode) &&
      !/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.(?:db|dw|ds|equ|include|if|else|endif|org|routine|end)\b/i.test(instructionCode)
    ) {
      instructions += 1;
    }
  }
  let kind = "layout-only";
  if (instructions > 0 && dataDirectives > 0) {
    kind = "mixed-code-data";
  } else if (instructions > 0) {
    kind = "code";
  } else if (dataDirectives > 0) {
    kind = "data";
  }
  kind = combineIncludeKinds(kind, nestedKind);
  return Object.freeze({
    kind,
    lines: lines.length,
    labels,
    instructions,
    dataDirectives,
    orgDirectives,
    nestedIncludes,
    recursiveIncludes,
  });
}

function findAssemblyFilesWithIncludes(asmRoot) {
  const root = sourcePackageRoot(asmRoot);
  const queue = findAssemblyFiles(asmRoot).map((file) => path.resolve(file));
  const seen = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\n/)) {
      const include = includeSpecifier(stripComment(raw.replace(/\r$/, "")));
      if (include === undefined) continue;
      const resolved = resolveConfinedInclude(file, include, root);
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function collectProofSymbols(root) {
  const symbols = new Set();
  if (!existsSync(root)) return symbols;
  for (const file of globSync("**/*.json", { cwd: root }).map((name) => path.join(root, name)).sort()) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    collectStrings(value, symbols);
  }
  return symbols;
}

function readProofManifests(proofRoot, asmRoot) {
  if (!existsSync(proofRoot)) return [];
  return globSync("**/*.json", { cwd: proofRoot })
    .filter((name) => name !== "atom-migration-preview-budgets.json")
    .sort()
    .flatMap((name) => {
      const file = path.join(proofRoot, name);
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      if (typeof manifest.source !== "string") return [];
      const source = path.resolve(path.dirname(file), manifest.source);
      return [Object.freeze({
        name,
        file,
        source,
        entry: path.relative(asmRoot, source).split(path.sep).join("/"),
      })];
    });
}

function isMeasurementProof(proof) {
  return proof.name.includes("measurement") || proof.entry.includes("measurement");
}

const overlappingProofMemoryBlockers = new Map([
  ["stage7-ll1-aggregate-call-z80-slice-proof.json", "resident source block $5000..$C27E overlaps runtime/proof output at $6800/$9000"],
  ["stage8-failure-z80-slice-proof.json", "resident source block $5000..$C4EF overlaps runtime/proof output at $6800/$9000"],
  ["stage9-conformance-z80-slice-proof.json", "resident source block $5000..$CDFE overlaps runtime/proof output at $6800/$9000"],
]);

function dependencyClosure(entry, root, seen = new Set()) {
  const resolved = path.resolve(entry);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  if (!existsSync(resolved)) return [resolved];
  const dependencies = [resolved];
  for (const raw of readFileSync(resolved, "utf8").split(/\n/)) {
    const include = includeSpecifier(stripComment(raw.replace(/\r$/, "")));
    if (include === undefined) continue;
    dependencies.push(...dependencyClosure(resolveConfinedInclude(resolved, include, root), root, seen));
  }
  return dependencies;
}

function preprocessorDefinitionHeaderIssues(files, preprocessorSymbols) {
  if (preprocessorSymbols.size === 0) return [];
  const issues = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\n/);
    let definitionsOpen = true;
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const code = stripComment(lines[index].replace(/\r$/, ""));
      const trimmed = code.trim();
      if (trimmed === "") continue;
      const equ = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?::\s*|\s+)\.equ\b/i.exec(code);
      if (equ !== null && preprocessorSymbols.has(equ[1])) {
        if (!definitionsOpen) {
          issues.push({
            code: "preprocessor-definition-after-header",
            message: `feature definition ${equ[1]} would translate to %DEFINE outside Atom's entry definition header`,
            ...location(file, lineNumber),
          });
        }
        continue;
      }
      definitionsOpen = false;
    }
  }
  return issues;
}

function proofSelectionStatus({ proof, files, issueByFile, globalIssues, includeAfterHeaderFiles }) {
  if (isMeasurementProof(proof)) {
    return Object.freeze({ status: "measurement-artifact", blockers: [] });
  }
  const overlappingProofMemory = overlappingProofMemoryBlockers.get(proof.name);
  const blockers = [];
  const lateIncludeBlockers = files
    .filter((file) => includeAfterHeaderFiles.has(file))
    .flatMap((file) => issueByFile.get(file) ?? [])
    .filter((issue) => issue.code === "include-after-header")
    .filter((issue) => !permanentLayoutHandlesIssue(proof, issue));
  if (lateIncludeBlockers.length > 0) {
    blockers.push(...lateIncludeBlockers);
  }
  const otherIssues = files
    .flatMap((file) => issueByFile.get(file) ?? [])
    .filter((issue) => issue.code !== "include-after-header")
    .filter((issue) => !permanentLayoutHandlesIssue(proof, issue));
  otherIssues.push(...globalIssues);
  const previewOnlyIssues = otherIssues.filter((issue) => issue.code === "atom-symbol-expression");
  const hardOtherIssues = otherIssues.filter((issue) => issue.code !== "atom-symbol-expression");
  if (otherIssues.length > 0) {
    blockers.push(...otherIssues);
  }
  if (overlappingProofMemory !== undefined) {
    blockers.unshift(Object.freeze({
      code: "overlapping-proof-memory",
      message: overlappingProofMemory,
      file: proof.file,
    }));
    return Object.freeze({ status: "blocked-by-overlapping-proof-memory", blockers });
  }
  if (lateIncludeBlockers.length > 0) {
    return Object.freeze({ status: "blocked-by-late-emitted-include", blockers });
  }
  if (hardOtherIssues.length > 0) {
    return Object.freeze({ status: "blocked-by-other", blockers });
  }
  if (previewOnlyIssues.length > 0) {
    return Object.freeze({ status: "atom-preview-only", blockers });
  }
  return Object.freeze({ status: "atom-permanent-ready", blockers });
}

function permanentLayoutHandlesIssue(proof, issue) {
  const proofTransform = permanentLayoutTransforms.get(proof.entry);
  if (proofTransform?.handledIssues.some((handled) => permanentLayoutIssueMatches(handled, issue))) {
    return true;
  }
  const issueRelative = permanentLayoutIssueRelative(issue);
  if (issueRelative === undefined) return false;
  const sourceTransform = permanentLayoutTransforms.get(issueRelative);
  if (issue.code === "preprocessor-definition-after-header" && sourceTransform !== undefined) {
    return true;
  }
  return sourceTransform?.handledIssues.some((handled) => permanentLayoutIssueMatches(handled, issue)) ?? false;
}

function permanentLayoutIssueMatches(handled, issue) {
  if (handled.file !== undefined && !permanentLayoutIssueFileMatches(handled.file, issue.file)) return false;
  if (handled.code !== undefined && issue.code !== handled.code) return false;
  if (handled.messageIncludes !== undefined && !issue.message.includes(handled.messageIncludes)) return false;
  return true;
}

function permanentLayoutIssueFileMatches(expected, actual) {
  if (actual === undefined) return false;
  if (actual === expected || actual.endsWith(`/${expected}`)) return true;
  if (expected.startsWith("asm/") && actual.endsWith(`/${expected.slice(4)}`)) return true;
  return false;
}

function permanentLayoutIssueRelative(issue) {
  if (issue.file === undefined) return undefined;
  const marker = "/asm/";
  const markerIndex = issue.file.lastIndexOf(marker);
  if (markerIndex >= 0) return issue.file.slice(markerIndex + marker.length);
  if (issue.file.startsWith("asm/")) return issue.file.slice(4);
  return undefined;
}

function buildProofSelectionMatrix({ proofRoot, asmRoot, packageRoot, issues, includeAfterHeaderRecords, contractMap }) {
  const issueByFile = new Map();
  const globalIssues = [];
  for (const issue of issues) {
    if (issue.file === undefined) {
      globalIssues.push(issue);
      continue;
    }
    const file = path.resolve(process.cwd(), issue.file);
    const list = issueByFile.get(file) ?? [];
    list.push(issue);
    issueByFile.set(file, list);
  }
  const includeAfterHeaderFiles = new Set(includeAfterHeaderRecords.map((record) => path.resolve(record.file)));
  const contractFiles = new Set(contractMap.map((entry) => path.resolve(asmRoot, entry.file)));
  return Object.freeze(readProofManifests(proofRoot, asmRoot).map((proof) => {
    const files = dependencyClosure(proof.source, packageRoot);
    const selection = proofSelectionStatus({
      proof,
      files,
      issueByFile,
      globalIssues,
      includeAfterHeaderFiles,
    });
    return Object.freeze({
      proof: proof.name,
      entry: proof.entry,
      status: selection.status,
      sourceFiles: Object.freeze(files.map((file) => path.relative(asmRoot, file).split(path.sep).join("/"))),
      blockers: Object.freeze(selection.blockers.map((issue) => Object.freeze({
        code: issue.code,
        file: issue.file,
        line: issue.line,
        message: issue.message,
      }))),
      contractSupport: contractFiles.has(proof.source) || files.some((file) => contractFiles.has(file))
        ? "requires-external-contract-check"
        : "not-required",
    });
  }));
}

function collectStrings(value, symbols) {
  if (typeof value === "string") {
    if (identifierPattern.test(value)) symbols.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, symbols);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "symbols" && child !== null && typeof child === "object" && !Array.isArray(child)) {
        for (const symbol of Object.keys(child)) {
          if (identifierPattern.test(symbol)) symbols.add(symbol);
        }
      }
      collectStrings(child, symbols);
    }
  }
}

function atomSymbolFor(index) {
  return `N${index.toString(36).toUpperCase().padStart(7, "0")}`;
}

function atomLocalSymbolFor(index) {
  return `.L${index.toString(36).toUpperCase().padStart(5, "0")}`;
}

function splitSymbolWords(symbol) {
  return symbol
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
}

function squeezeSymbolWord(word) {
  const upper = word.toUpperCase();
  if (upper.length <= 2) return upper;
  return upper[0] + upper.slice(1).replace(/[AEIOU]/g, "");
}

function atomAbbreviationBase(symbol) {
  const words = splitSymbolWords(symbol);
  const squeezed = words.map(squeezeSymbolWord);
  const base = squeezed.length === 0
    ? symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : squeezed.join("");
  const normalized = base.replace(/^[0-9]+/, "").replace(/[^A-Z0-9]/g, "");
  return (normalized === "" ? "N" : normalized).slice(0, 8);
}

function uniqueAtomAbbreviation(symbol, usedNames) {
  const base = atomAbbreviationBase(symbol);
  let candidate = base;
  for (let index = 0; usedNames.has(candidate.toUpperCase()); index += 1) {
    const suffix = index.toString(36).toUpperCase();
    const suffixLength = Math.min(3, suffix.length);
    candidate = `${base.slice(0, 8 - suffixLength)}${suffix.slice(-suffixLength)}`;
    if (index > 0xfff) {
      throw new Error(`could not generate Atom abbreviation for ${symbol}`);
    }
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

function symbolMapFromLedger(ledger, { symbols = "preview" } = {}) {
  if (!["preview", "permanent"].includes(symbols)) {
    throw new Error("Nucleus Atom translated symbols must be preview or permanent");
  }
  const field = symbols === "permanent" ? "permanentAtom" : "atom";
  return new Map(ledger.map((entry) => [entry.original, entry[field]]));
}

function symbolMetadataFromLedger(ledger) {
  return new Map(ledger.map((entry) => [entry.original, entry]));
}

function declarationComment(original, symbolMetadata) {
  const entry = symbolMetadata.get(original);
  if (entry === undefined) return "";
  if (entry.migrationKind === "local-label") return "";
  const permanent = entry.permanentAtom === entry.atom ? "" : ` PERMANENT ${entry.permanentAtom}`;
  return ` ;@NUC-GLOBAL ${entry.original}${permanent}`;
}

function classifyScope(symbol, file, proofSymbols) {
  if (proofSymbols.has(symbol)) return "exported-proof-symbol";
  const base = path.basename(file);
  if (base.includes("proof")) return "proof-only";
  if (symbol.startsWith(".") || symbol.startsWith("_")) return "private-or-local";
  return "global";
}

function collectSourceIdentifiers(unquotedCode) {
  const identifiers = [];
  for (const match of unquotedCode.matchAll(sourceIdentifierPattern)) {
    identifiers.push(match[2]);
  }
  return identifiers;
}

function lineRangeContains(line, start, end) {
  return line > start && (end === undefined || line < end);
}

function buildPermanentSymbolPlan(symbols, occurrences, proofSymbols) {
  const entries = [...symbols.values()];
  const symbolOccurrences = new Map();
  for (const occurrence of occurrences) {
    if (!symbols.has(occurrence.symbol)) continue;
    const list = symbolOccurrences.get(occurrence.symbol) ?? [];
    list.push(occurrence);
    symbolOccurrences.set(occurrence.symbol, list);
  }

  const crossFileSymbols = new Set();
  for (const entry of entries) {
    const definitionFiles = new Set(entry.definitions.map(({ file }) => file));
    if ((symbolOccurrences.get(entry.original) ?? []).some(({ file }) => !definitionFiles.has(file))) {
      crossFileSymbols.add(entry.original);
    }
  }

  const labelEntriesByFile = new Map();
  for (const entry of entries) {
    if (entry.definitionKind !== "label") continue;
    for (const definition of entry.definitions) {
      const file = definition.file;
      const list = labelEntriesByFile.get(file) ?? [];
      list.push({ entry, definition });
      labelEntriesByFile.set(file, list);
    }
  }
  for (const list of labelEntriesByFile.values()) {
    list.sort((left, right) => left.definition.line - right.definition.line || left.entry.original.localeCompare(right.entry.original));
  }

  const anchorDefinitions = (list, nonLocalSymbols) => list
    .filter(({ entry }) => entry.original.length <= 8 || nonLocalSymbols.has(entry.original))
    .map(({ entry, definition }) => ({
      entry,
      line: definition.line,
    }))
    .sort((left, right) => left.line - right.line || left.entry.original.localeCompare(right.entry.original));

  const nonLocalSymbols = new Set();
  const isLocalEligible = (entry) => (
    entry.original.length > 8 &&
    entry.definitionKind === "label" &&
    entry.definitions.length === 1 &&
    !proofSymbols.has(entry.original) &&
    !crossFileSymbols.has(entry.original)
  );

  for (const [file, list] of labelEntriesByFile.entries()) {
    const first = list[0]?.entry;
    if (first !== undefined && isLocalEligible(first)) {
      nonLocalSymbols.add(first.original);
    }
    for (const { entry } of list) {
      if (!isLocalEligible(entry) || entry.original.length <= 8) {
        nonLocalSymbols.add(entry.original);
      }
      if (entry.original.length <= 8 || proofSymbols.has(entry.original) || crossFileSymbols.has(entry.original)) {
        nonLocalSymbols.add(entry.original);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, list] of labelEntriesByFile.entries()) {
      const anchors = anchorDefinitions(list, nonLocalSymbols);
      for (const { entry, definition } of list) {
        if (!isLocalEligible(entry) || nonLocalSymbols.has(entry.original)) continue;
        const line = definition.line;
        let anchor;
        let nextAnchor;
        for (const candidate of anchors) {
          const candidateLine = candidate.line;
          if (candidateLine < line) anchor = candidate;
          if (candidateLine > line) {
            nextAnchor = candidate;
            break;
          }
        }
        const start = anchor?.line;
        const end = nextAnchor?.line;
        const safe = start !== undefined && (symbolOccurrences.get(entry.original) ?? [])
          .every((occurrence) => occurrence.file === file && lineRangeContains(occurrence.line, start, end));
        if (!safe) {
          nonLocalSymbols.add(entry.original);
          changed = true;
        }
      }
    }
  }

  const localCounters = new Map();
  const plan = new Map();
  const usedGlobalNames = new Set(entries
    .filter((entry) => entry.original.length <= 8)
    .map((entry) => entry.original.toUpperCase()));

  for (const [file, list] of labelEntriesByFile.entries()) {
    const anchors = anchorDefinitions(list, nonLocalSymbols);
    for (const { entry, definition } of list) {
      if (!isLocalEligible(entry) || nonLocalSymbols.has(entry.original)) continue;
      const line = definition.line;
      let anchor;
      for (const candidate of anchors) {
        const candidateLine = candidate.line;
        if (candidateLine < line) anchor = candidate;
        if (candidateLine > line) break;
      }
      if (anchor === undefined) continue;
      const key = `${file}:${anchor.entry.original}:${anchor.line}`;
      const index = localCounters.get(key) ?? 0;
      localCounters.set(key, index + 1);
      plan.set(entry.original, {
        migrationKind: "local-label",
        permanentAtom: atomLocalSymbolFor(index),
        localScope: {
          anchor: anchor.entry.original,
          file: path.relative(process.cwd(), file),
          line: anchor.line,
        },
      });
    }
  }

  for (const entry of entries) {
    if (entry.original.length <= 8 || plan.has(entry.original)) continue;
    let migrationKind = "generated-global";
    if (proofSymbols.has(entry.original)) {
      migrationKind = "public-abbreviation-required";
    } else if (crossFileSymbols.has(entry.original)) {
      migrationKind = "cross-file-abbreviation-required";
    } else if (entry.definitionKind === "equ") {
      migrationKind = "equ-abbreviation-required";
    }
    plan.set(entry.original, {
      migrationKind,
      permanentAtom: uniqueAtomAbbreviation(entry.original, usedGlobalNames),
      localScope: null,
    });
  }

  return { plan, symbolOccurrences, crossFileSymbols };
}

function summarizeIncludeAfterHeader(records, asmRoot) {
  const bySource = new Map();
  const byTarget = new Map();
  for (const record of records) {
    const source = record.file;
    const target = record.resolved;
    const sourceEntry = bySource.get(source) ?? {
      file: path.relative(asmRoot, source).split(path.sep).join("/"),
      count: 0,
      targets: new Map(),
      firstLine: record.line,
    };
    sourceEntry.count += 1;
    sourceEntry.firstLine = Math.min(sourceEntry.firstLine, record.line);
    sourceEntry.targets.set(record.include, (sourceEntry.targets.get(record.include) ?? 0) + 1);
    bySource.set(source, sourceEntry);

    const targetEntry = byTarget.get(target) ?? {
      include: record.include,
      resolved: path.relative(asmRoot, target).split(path.sep).join("/"),
      count: 0,
      target: record.target,
      firstUse: {
        file: path.relative(asmRoot, source).split(path.sep).join("/"),
        line: record.line,
      },
    };
    targetEntry.count += 1;
    byTarget.set(target, targetEntry);
  }
  return Object.freeze({
    bySource: Object.freeze([...bySource.values()]
      .map((entry) => Object.freeze({
        file: entry.file,
        count: entry.count,
        firstLine: entry.firstLine,
        targets: Object.freeze(Object.fromEntries([...entry.targets.entries()].sort())),
      }))
      .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file))),
    byTarget: Object.freeze([...byTarget.values()]
      .map((entry) => Object.freeze(entry))
      .sort((left, right) => right.count - left.count || left.resolved.localeCompare(right.resolved))),
  });
}

function scanAssembly({ asmRoot, proofRoot }) {
  const files = findAssemblyFilesWithIncludes(asmRoot);
  const packageRoot = sourcePackageRoot(asmRoot);
  const proofSymbols = collectProofSymbols(proofRoot);
  const directives = new Map();
  const conditionals = new Map();
  const includes = new Map();
  const symbols = new Map();
  const occurrences = [];
  const issues = [];
  const includeAfterHeaderRecords = [];
  const proofLimitRecords = [];
  let sourceLines = 0;
  let contractLines = 0;
  let proofLimitSymbols = 0;
  let includeAfterHeader = 0;

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\n/);
    sourceLines += lines.length;
    let includeHeaderClosed = false;
    const availableSymbols = new Set();
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const raw = lines[index].replace(/\r$/, "");
      const code = stripComment(raw);
      const unquotedCode = maskQuoted(code);
      for (const symbol of collectSourceIdentifiers(unquotedCode)) {
        occurrences.push({ symbol, file, line: lineNumber });
      }
      const onePastAddressSpaceEqu = onePastAddressSpaceEquPattern.exec(code);
      if (onePastAddressSpaceEqu !== null) {
        proofLimitSymbols += 1;
        proofLimitRecords.push(Object.freeze({
          original: onePastAddressSpaceEqu[1],
          value: 0x10000,
          file,
          line: lineNumber,
        }));
      }

      const directive = /^\s*\.([A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/.exec(code);
      if (directive !== null) {
        const name = directive[1].toLowerCase();
        const argument = directive[2].trim();
        addCount(directives, name);
        if (!allowedDirectives.has(name)) {
          issues.push({
            code: "unsupported-directive",
            message: `AZM directive .${name.toUpperCase()} has no Atom migration rule`,
            ...location(file, lineNumber),
          });
        }
        if (name === "routine") contractLines += 1;
        if (name === "include") {
          addCount(includes, argument);
          if (includeHeaderClosed) {
            const resolved = resolveConfinedInclude(file, argument.replace(/^"|"$/g, ""), packageRoot);
            const target = classifyIncludeTarget(resolved, packageRoot);
            includeAfterHeaderRecords.push(Object.freeze({
              file,
              line: lineNumber,
              include: argument,
              resolved,
              target,
            }));
            includeAfterHeader += 1;
            issues.push({
              code: "include-after-header",
              message: "include appears after the header; Nucleus Atom migration requires includes before ORG, labels, code, data, or contracts",
              ...location(file, lineNumber),
            });
          }
        }
        if (name === "if") {
          addCount(conditionals, argument);
          if (!simpleConditionPattern.test(argument)) {
            issues.push({
              code: "unsupported-conditional-expression",
              message: `conditional expression is not a simple feature flag: ${argument}`,
              ...location(file, lineNumber),
            });
          }
        }
      }
      if (!isIncludeHeaderLine(code)) {
        includeHeaderClosed = true;
      }
      if (directive === null) {
        const labelDirective = /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.([A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/i.exec(code);
        if (labelDirective !== null) {
          const name = labelDirective[1].toLowerCase();
          if (name !== "equ") addCount(directives, name);
          if (!allowedDirectives.has(name)) {
            issues.push({
              code: "unsupported-directive",
              message: `AZM directive .${name.toUpperCase()} has no Atom migration rule`,
              ...location(file, lineNumber),
            });
          }
        }
      }

      const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(code);
      if (label !== null) {
        recordSymbol(symbols, label[1], file, lineNumber, proofSymbols, "label");
        availableSymbols.add(symbolKey(label[1]));
      }

      const equ = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?::\s*|\s+)\.equ\b\s*(.*)$/i.exec(code);
      if (equ !== null) {
        addCount(directives, "equ");
        recordSymbol(symbols, equ[1], file, lineNumber, proofSymbols, "equ");
        if (equExpressionIsImmediatelyResolvable(equ[2], availableSymbols)) {
          availableSymbols.add(symbolKey(equ[1]));
        }
      }

      for (const match of unquotedCode.matchAll(/(^|[^A-Za-z0-9_])(\$[0-9A-Fa-f]+|%[01]+|[0-9][0-9A-Fa-f]*[Hh]|[01]+[Bb]|[0-9]+)/g)) {
        const text = match[2];
        const value = numberValue(text);
        if (value !== undefined && value > 0xffff && onePastAddressSpaceEqu === null) {
          issues.push({
            code: "atom-expression-range",
            message: `numeric literal ${text} exceeds Atom's 16-bit expression range`,
            ...location(file, lineNumber),
          });
        }
      }
      const isEquDefinition = /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.equ\b/i.test(code);
      const isConditionalDirective = /^\s*\.if\b/i.test(code);
      if (!isEquDefinition && !isConditionalDirective) {
        for (const match of unquotedCode.matchAll(/(^|[^A-Za-z0-9_.$?])([A-Za-z_.$?][A-Za-z0-9_.$?]*|\$[0-9A-Fa-f]+|%[01]+|[0-9][0-9A-Fa-f]*[Hh]|[01]+[Bb]|[0-9]+)\s*([+-])\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*|\$[0-9A-Fa-f]+|%[01]+|[0-9][0-9A-Fa-f]*[Hh]|[01]+[Bb]|[0-9]+)\b/g)) {
          const left = symbolExpressionTerm(match[2]);
          const right = symbolExpressionTerm(match[4]);
          if (left.kind !== "symbol" || right.kind !== "symbol") continue;
          if (availableSymbols.has(left.key) && availableSymbols.has(right.key)) continue;
          issues.push({
            code: "atom-symbol-expression",
            message: `symbol expression ${match[2]}${match[3]}${match[4]} requires preview lowering; permanent Atom source needs both symbols defined before the emitted statement`,
            ...location(file, lineNumber),
          });
        }
      }
    }
  }

  const preprocessorSymbols = new Set(conditionals.keys());
  issues.push(...preprocessorDefinitionHeaderIssues(files, preprocessorSymbols));
  for (const symbol of preprocessorSymbols) {
    symbols.delete(symbol);
  }

  const { plan, symbolOccurrences, crossFileSymbols } = buildPermanentSymbolPlan(symbols, occurrences, proofSymbols);

  const ledger = [...symbols.values()]
    .filter((entry) => entry.original.length > 8)
    .sort((left, right) => left.original.localeCompare(right.original))
    .map((entry, index) => ({
      original: entry.original,
      atom: atomSymbolFor(index),
      permanentAtom: plan.get(entry.original)?.permanentAtom ?? atomSymbolFor(index),
      migrationKind: plan.get(entry.original)?.migrationKind ?? "generated-global",
      scope: entry.scope,
      owningFile: path.relative(asmRoot, entry.file).split(path.sep).join("/"),
      publicObligation: proofSymbols.has(entry.original) ? "proof-manifest" : null,
      definitionKind: entry.definitionKind,
      referenceCount: Math.max(0, (symbolOccurrences.get(entry.original) ?? []).length - entry.definitions.length),
      crossFileReferences: crossFileSymbols.has(entry.original),
      localScope: plan.get(entry.original)?.localScope ?? null,
      collisionGroup: [],
      definitions: entry.definitions.map((definition) => ({
        file: path.relative(process.cwd(), definition.file),
        line: definition.line,
      })),
    }));
  const proofSymbolMap = Object.freeze([...proofSymbols]
    .filter((symbol) => symbols.has(symbol))
    .sort()
    .map((symbol) => {
      const entry = symbols.get(symbol);
      const longEntry = ledger.find(({ original }) => original === symbol);
      return Object.freeze({
        original: symbol,
        atom: longEntry?.atom ?? symbol,
        permanentAtom: longEntry?.permanentAtom ?? symbol,
        definitionKind: entry.definitionKind,
        owningFile: path.relative(asmRoot, entry.file).split(path.sep).join("/"),
      });
    }));
  const proofLimitMap = Object.freeze(proofLimitRecords.map((record) => {
    const longEntry = ledger.find(({ original }) => original === record.original);
    return Object.freeze({
      original: record.original,
      atom: longEntry?.atom ?? record.original,
      permanentAtom: longEntry?.permanentAtom ?? record.original,
      value: record.value,
      loweredAtomValue: 0,
      owningFile: path.relative(asmRoot, record.file).split(path.sep).join("/"),
      line: record.line,
    });
  }));
  const symbolMap = symbolMapFromLedger(ledger);
  const symbolMetadata = symbolMetadataFromLedger(ledger);
  const contractMap = Object.freeze(files.flatMap((file) => {
    const lines = readFileSync(file, "utf8").split(/\n/);
    return lines.flatMap((raw, index) => {
      const code = stripComment(raw.replace(/\r$/, ""));
      const routine = /^\s*\.routine\b\s*(.*)$/i.exec(code);
      if (routine === null) return [];
      const target = nextRoutineLabel(lines, index);
      const original = target?.label;
      const metadata = original === undefined ? undefined : symbolMetadata.get(original);
      return [Object.freeze({
        file: path.relative(asmRoot, file).split(path.sep).join("/"),
        line: index + 1,
        contract: routine[1].trim(),
        target: original === undefined
          ? null
          : Object.freeze({
            original,
            atom: symbolMap.get(original) ?? original,
            permanentAtom: metadata?.permanentAtom ?? original,
            line: target.line,
          }),
      })];
    });
  }));
  const caseGroups = new Map();
  for (const symbol of symbols.keys()) {
    const key = symbol.toUpperCase();
    const group = caseGroups.get(key) ?? [];
    group.push(symbol);
    caseGroups.set(key, group);
  }
  for (const group of caseGroups.values()) {
    const distinct = [...new Set(group)];
    if (distinct.length > 1) {
      issues.push({
        code: "atom-case-collision",
        message: `symbols collide in Atom's case-insensitive table: ${distinct.sort().join(", ")}`,
      });
    }
  }

  const originalAtomKeys = new Set([...symbols.keys()].map((symbol) => symbol.toUpperCase()));
  for (const entry of ledger) {
    if (originalAtomKeys.has(entry.atom.toUpperCase())) {
      issues.push({
        code: "generated-symbol-collision",
        message: `generated Atom symbol ${entry.atom} collides with an existing source symbol`,
        file: entry.definitions[0]?.file,
        line: entry.definitions[0]?.line,
      });
    }
    if (entry.migrationKind !== "local-label" && entry.permanentAtom === undefined) {
      const code = entry.migrationKind === "public-abbreviation-required"
        ? "long-symbol-public-abbreviation-required"
        : entry.migrationKind === "cross-file-abbreviation-required"
          ? "long-symbol-cross-file-abbreviation-required"
          : entry.migrationKind === "equ-abbreviation-required"
            ? "long-symbol-equ-abbreviation-required"
            : "long-symbol-global-ledger-required";
      issues.push({
        code,
        message: `${entry.original} requires a permanent Atom global name; preview uses ${entry.atom}`,
        file: entry.definitions[0]?.file,
        line: entry.definitions[0]?.line,
      });
    }
  }

  const proofMatrix = buildProofSelectionMatrix({
    proofRoot,
    asmRoot,
    packageRoot,
    issues,
    includeAfterHeaderRecords,
    contractMap,
  });
  const proofMatrixSummary = Object.freeze(Object.fromEntries(
    [...proofMatrix.reduce((counts, entry) => {
      counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort(),
  ));

  const directiveSummary = Object.fromEntries([...directives.entries()].sort());
  const conditionalSummary = Object.fromEntries(
    [...conditionals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
  const includeSummary = Object.fromEntries([...includes.entries()].sort());
  const issueSummary = Object.fromEntries(
    [...issues.reduce((counts, issue) => {
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort(),
  );
  const compatibilityBlockingIssues = issues.filter((issue) => !compatibilityLoweringCanHandle(issue));
  const permanentSourceStatus = issues.length === 0 ? "ready" : "blocked";
  const compatibilityLoweringStatus = compatibilityBlockingIssues.length === 0 ? "ready" : "blocked";

  return {
    schema: "nucleus-atom-migration/v1",
    status: permanentSourceStatus,
    readiness: {
      permanentSource: permanentSourceStatus,
      compatibilityLowering: compatibilityLoweringStatus,
      compatibilityBlockingIssues: compatibilityBlockingIssues.length,
    },
    asmRoot,
    proofRoot,
    measured: {
      files: files.length,
      sourceLines,
      definedSymbols: symbols.size,
      longSymbols: ledger.length,
      localLabelCandidates: ledger.filter((entry) => entry.migrationKind === "local-label").length,
      globalSymbolRenames: ledger.filter((entry) => entry.migrationKind !== "local-label").length,
      contractLines,
      directives: directiveSummary,
      conditionals: conditionalSummary,
      uniqueIncludes: includes.size,
      proofLimitSymbols,
      includeAfterHeader,
      compatibilityLoweringRequired: includeAfterHeader,
      preprocessorSymbols: preprocessorSymbols.size,
      proofSymbolMappings: proofSymbolMap.length,
      proofLimitMappings: proofLimitMap.length,
      contractMappings: contractMap.length,
      proofManifests: proofMatrix.length,
      proofMatrix: proofMatrixSummary,
      issues: issueSummary,
    },
    supportedMappings: {
      mechanicalDirectives: [...mechanicalDirectives].sort(),
      contractMetadata: [".routine"],
      simpleConditionals: true,
      generatedLongSymbolLedger: true,
      compatibilityLowering: true,
    },
    includeArguments: includeSummary,
    includeAfterHeaderReport: summarizeIncludeAfterHeader(includeAfterHeaderRecords, asmRoot),
    preprocessorSymbols: Object.freeze([...preprocessorSymbols].sort()),
    proofSymbolMap,
    proofLimitMap,
    contractMap,
    proofMatrix,
    ledger,
    issues,
  };
}

function symbolKey(symbol) {
  return symbol.toUpperCase();
}

function symbolExpressionTerm(term) {
  if (numberValue(term) !== undefined) return { kind: "literal" };
  if (/^(?:IX|IY)$/i.test(term)) return { kind: "index-register" };
  return { kind: "symbol", key: symbolKey(term) };
}

function equExpressionIsImmediatelyResolvable(expression, availableSymbols) {
  return collectSourceIdentifiers(maskQuoted(expression))
    .every((symbol) => availableSymbols.has(symbolKey(symbol)));
}

function replaceSymbolsInSource(source, symbolMap) {
  if (symbolMap.size === 0) return source;
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quote !== "") {
      output += character;
      index += 1;
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    const match = /^[A-Za-z_.$?][A-Za-z0-9_.$?]*/.exec(source.slice(index));
    if (match !== null) {
      const word = match[0];
      output += symbolMap.get(word) ?? word;
      index += word.length;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function convertQuotedByteExpressions(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quote !== "") {
      output += character;
      index += 1;
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === "\"") {
      const next = source[index + 1];
      const close = source[index + 2];
      if (next !== undefined && close === "\"") {
        output += `'${next === "'" ? "\\'" : next}'`;
        index += 3;
        continue;
      }
      if (next === "\\" && source[index + 3] === "\"") {
        const escaped = source[index + 2];
        if (escaped === undefined) {
          output += character;
          index += 1;
          continue;
        }
        output += `'\\${escaped}'`;
        index += 4;
        continue;
      }
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function convertLeadingImmediateGrouping(source) {
  return source.replace(
    /\b(LD\s+(?:BC|DE|HL|SP|IX|IY)\s*,\s*)\(([^()\r\n]*<<[^()\r\n]*)\)(?=\s*(?:[|+\-*/%&^]|$))/gi,
    "$1$2",
  );
}

function translateNucleusAzmLine(
  line,
  {
    sourceName = "<nucleus-asm>",
    lineNumber = 1,
    symbolMap = new Map(),
    symbolMetadata = new Map(),
    preprocessorSymbols = new Set(),
  } = {},
) {
  const source = stripComment(line);
  const comment = line.slice(source.length);
  const context = { file: sourceName, line: lineNumber };

  const leadingDirective = /^(\s*)\.([A-Za-z][A-Za-z0-9_]*)(\b.*)$/.exec(source);
  if (leadingDirective !== null) {
    const [, prefix, rawName, rest] = leadingDirective;
    const name = rawName.toLowerCase();
    if (name === "routine") {
      return `${prefix};@ROUTINE${rest.toUpperCase()}${comment}`;
    }
    if (name === "end") {
      return `${prefix};@AZM-END${comment}`;
    }
    const replacement = directiveTranslations.get(name);
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${comment}`;
  }

  const equ = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+))\.equ(\b.*)$/i.exec(source);
  if (equ !== null) {
    const onePastLimit = /^(\s*)(AddressSpaceLimit|ProofMemoryEnd)(:?\s+)\.equ\s+\$10000\s*$/i.exec(source);
    if (onePastLimit !== null) {
      const original = onePastLimit[2];
      const atom = symbolMap.get(original) ?? original;
      return `${onePastLimit[1]}${atom}${onePastLimit[3]}EQU 0${declarationComment(original, symbolMetadata)} ;@ATOM-PROOF-LIMIT ${original} 65536${comment === "" ? "" : ` ${comment}`}`;
    }
    const preprocessorDefinition = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:\s*|\s+)\.equ\b(.*)$/i.exec(source);
    if (preprocessorDefinition !== null && preprocessorSymbols.has(preprocessorDefinition[2])) {
      return `${preprocessorDefinition[1]}%DEFINE ${preprocessorDefinition[2]}${preprocessorDefinition[4]}${comment}`;
    }
    const equName = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)/.exec(equ[1])?.[1];
    return `${replaceSymbolsInSource(`${equ[1]}EQU${equ[2]}`, symbolMap)}${equName === undefined ? "" : declarationComment(equName, symbolMetadata)}${comment}`;
  }

  const labelDirective = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+))\.([A-Za-z][A-Za-z0-9_]*)(\b.*)$/i.exec(source);
  if (labelDirective !== null) {
    const [, prefix, rawName, rest] = labelDirective;
    const replacement = directiveTranslations.get(rawName.toLowerCase());
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    const labelName = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)/.exec(prefix)?.[1];
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${labelName === undefined ? "" : declarationComment(labelName, symbolMetadata)}${comment}`;
  }

  const translatedSource = replaceSymbolsInSource(convertLeadingImmediateGrouping(convertQuotedByteExpressions(source)), symbolMap);
  const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(source);
  return `${translatedSource}${label === null ? "" : declarationComment(label[1], symbolMetadata)}${comment}`;
}

function writeTranslatedTree(report, translatedRoot, { symbols = "preview" } = {}) {
  const symbolMap = symbolMapFromLedger(report.ledger, { symbols });
  const symbolMetadata = symbolMetadataFromLedger(report.ledger);
  const preprocessorSymbols = new Set(report.preprocessorSymbols);
  const packageRoot = sourcePackageRoot(report.asmRoot);
  for (const file of findAssemblyFilesWithIncludes(report.asmRoot)) {
    const relative = translatedSourceRelative(report.asmRoot, packageRoot, file);
    const output = path.join(translatedRoot, relative);
    const lines = readFileSync(file, "utf8").split(/\n/);
    let translated = lines
      .map((line, index) => translateNucleusAzmLine(line, {
        sourceName: relative,
        lineNumber: index + 1,
        symbolMap,
        symbolMetadata,
        preprocessorSymbols,
      }))
      .join("\n");
    const permanentLayoutTransform = symbols === "permanent"
      ? permanentLayoutTransforms.get(relative)
      : undefined;
    if (permanentLayoutTransform !== undefined) {
      translated = permanentLayoutTransform.rewrite(translated, {
        relative,
        translatedRoot,
        symbolMap,
      });
    }
    if (symbols === "permanent") {
      translated = hoistTopLevelAtomDefines(translated);
    }
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, translated);
  }
}

function hoistTopLevelAtomDefines(source) {
  const lines = source.split("\n");
  const defines = [];
  const body = [];
  let conditionalDepth = 0;

  for (const line of lines) {
    const code = stripComment(line);
    const directive = /^\s*%(IF|ELSE|ENDIF|DEFINE)\b/i.exec(code);
    const name = directive?.[1]?.toUpperCase();
    if (name === "DEFINE" && conditionalDepth === 0) {
      defines.push(line);
      continue;
    }
    body.push(line);
    if (name === "IF") {
      conditionalDepth += 1;
    } else if (name === "ENDIF" && conditionalDepth > 0) {
      conditionalDepth -= 1;
    }
  }

  if (defines.length === 0) return source;

  let insertion = 0;
  while (insertion < body.length) {
    const code = stripComment(body[insertion]).trim();
    if (code !== "") break;
    insertion += 1;
  }
  body.splice(insertion, 0, ...defines);
  return body.join("\n");
}

function translatedSourceRelative(asmRoot, packageRoot, file) {
  const asmRelative = path.relative(asmRoot, file);
  if (!asmRelative.startsWith("..") && !path.isAbsolute(asmRelative)) {
    return asmRelative.split(path.sep).join("/");
  }
  const packageRelative = path.relative(packageRoot, file);
  if (packageRelative.startsWith("..") || path.isAbsolute(packageRelative)) {
    throw new Error(`cannot place translated source outside package root: ${file}`);
  }
  return packageRelative.split(path.sep).join("/");
}

function atomSymbol(symbolMap, original) {
  return symbolMap.get(original) ?? original;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeGeneratedPermanentPart(translatedRoot, relative, includeName, lines) {
  const helperPath = path.join(translatedRoot, path.dirname(relative), includeName);
  mkdirSync(path.dirname(helperPath), { recursive: true });
  writeFileSync(helperPath, `${lines.join("\n")}\n`);
}

function findPermanentLabelLine(lines, label, context) {
  const index = lines.findIndex((line) => line.startsWith(`${label}:`));
  if (index < 0) throw new Error(`${context} permanent Atom rewrite could not find ${label}`);
  return index;
}

function findPermanentOrgLine(lines, origin, context) {
  const pattern = new RegExp(`^\\s*ORG\\s+${escapeRegExp(origin)}\\b`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) throw new Error(`${context} permanent Atom rewrite could not find ORG ${origin}`);
  return index;
}

function findPermanentIncludeLine(lines, includeName, context) {
  const pattern = new RegExp(`^\\s*%INCLUDE\\s+"${escapeRegExp(includeName)}"\\s*$`, "i");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) throw new Error(`${context} permanent Atom rewrite could not find %INCLUDE "${includeName}"`);
  return index;
}

function rewriteCompilerSlicePermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const generatedInclude = "compiler-slice-code-begin.asmi";
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const compilerCodeStart = atomSymbol(symbolMap, "CompilerCodeStart");
  const compilerCodeEnd = atomSymbol(symbolMap, "CompilerCodeEnd");
  const malformedSource = atomSymbol(symbolMap, "MalformedSource");
  const malformedSourceEnd = atomSymbol(symbolMap, "MalformedSourceEnd");
  const malformedSourceSize = "MLFRMDSZ";
  const expectedOperations = atomSymbol(symbolMap, "ExpectedOperations");
  writeGeneratedPermanentPart(translatedRoot, relative, generatedInclude, [
    "            ORG " + compilerCoreBase,
    compilerCodeStart + ": ;@NUC-GLOBAL CompilerCodeStart PERMANENT " + compilerCodeStart,
    "",
  ]);

  const lines = source.split("\n");
  const codeEndIndex = lines.findIndex((line) => line.startsWith(`${compilerCodeEnd}:`));
  if (codeEndIndex < 0) {
    throw new Error("compiler-slice permanent Atom rewrite could not find CompilerCodeEnd");
  }
  const suffix = lines.slice(codeEndIndex).join("\n");
  const rewrittenSuffix = suffix
    .replace(
      `LD   DE,${malformedSourceEnd}-${malformedSource}`,
      `LD   DE,${malformedSourceSize}`,
    )
    .replace(
      new RegExp(`^(${expectedOperations}:.*)$`, "m"),
      `${malformedSourceSize} EQU ${malformedSourceEnd}-${malformedSource}\n$1`,
    );
  return [
    "; Permanent Atom layout for the compiler-slice proof.",
    "            %DEFINE AggregateCallSlices 0",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"compiler-state.asmi\"",
    `            %INCLUDE "${generatedInclude}"`,
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"tokenizer.asm\"",
    "            %INCLUDE \"semantic-sink.asm\"",
    "            %INCLUDE \"parser.asm\"",
    rewrittenSuffix,
  ].join("\n");
}

function rewriteZ80SlicePermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const compilerCodeStart = atomSymbol(symbolMap, "CompilerCodeStart");
  const compilerCommonCodeEnd = atomSymbol(symbolMap, "CompilerCommonCodeEnd");
  const sinkCodeStart = atomSymbol(symbolMap, "SinkCodeStart");
  const sinkCodeEnd = atomSymbol(symbolMap, "SinkCodeEnd");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const runtimeCodeStart = atomSymbol(symbolMap, "RuntimeCodeStart");
  const runtimeCodeEnd = atomSymbol(symbolMap, "RuntimeCodeEnd");

  const lines = source.split("\n");
  const commonEndIndex = findPermanentLabelLine(lines, compilerCommonCodeEnd, "z80-slice");
  const sinkEndIndex = findPermanentLabelLine(lines, sinkCodeEnd, "z80-slice");
  const sinkIncludeIndex = findPermanentIncludeLine(lines, "z80-sink.asm", "z80-slice");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "z80-slice");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "z80-slice");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "z80-runtime.asm", "z80-slice");
  const runtimeEndIndex = findPermanentLabelLine(lines, runtimeCodeEnd, "z80-slice");

  if (!(commonEndIndex < sinkEndIndex &&
    commonEndIndex < sinkIncludeIndex &&
    sinkIncludeIndex < sinkEndIndex &&
    sinkEndIndex < sourceOrgIndex &&
    sourceOrgIndex < runtimeOrgIndex &&
    runtimeOrgIndex < runtimeIncludeIndex &&
    runtimeIncludeIndex < runtimeEndIndex)) {
    throw new Error("z80-slice permanent Atom rewrite found an unexpected section order");
  }

  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-code-begin.asmi", [
    "            ORG " + compilerCoreBase,
    compilerCodeStart + ": ;@NUC-GLOBAL CompilerCodeStart PERMANENT " + compilerCodeStart,
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-sink-begin.asmi", [
    ...lines.slice(commonEndIndex, sinkIncludeIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-after-sink.asmi", [
    ...lines.slice(sinkEndIndex, sourceOrgIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-source.asmi", [
    ...lines.slice(sourceOrgIndex, runtimeOrgIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-runtime-begin.asmi", [
    ...lines.slice(runtimeOrgIndex, runtimeIncludeIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "z80-slice-proof-body.asmi", [
    ...lines.slice(runtimeEndIndex),
  ]);

  return [
    "; Permanent Atom layout for the z80-slice proof.",
    "            %DEFINE AggregateCallSlices 0",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"compiler-state.asmi\"",
    "            %INCLUDE \"z80-state.asmi\"",
    "            %INCLUDE \"z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"tokenizer.asm\"",
    "            %INCLUDE \"semantic-sink.asm\"",
    "            %INCLUDE \"parser.asm\"",
    "            %INCLUDE \"z80-slice-sink-begin.asmi\"",
    "            %INCLUDE \"z80-sink.asm\"",
    "            %INCLUDE \"z80-slice-after-sink.asmi\"",
    "            %INCLUDE \"z80-slice-source.asmi\"",
    "            %INCLUDE \"z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"z80-runtime.asm\"",
    "            %INCLUDE \"z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteLoopCompilerSliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const counterWriteStart = atomSymbol(symbolMap, "CounterWriteStart");
  const counterWriteSource = atomSymbol(symbolMap, "CounterWriteSource");
  const missingEndSourceEnd = atomSymbol(symbolMap, "MissingEndSourceEnd");
  const missingEndSource = atomSymbol(symbolMap, "MissingEndSource");

  const lines = source
    .replaceAll(`${counterWriteStart}-${counterWriteSource}+8`, "LPCTWOF")
    .replaceAll(`${missingEndSourceEnd}-${missingEndSource}`, "LPMESZ")
    .split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "loop-compiler-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "loop-compiler-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "loop-compiler-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "loop-compiler-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "loop-compiler-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "loop-compiler-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "loop-compiler-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "loop-compiler-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "loop-compiler-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("loop-compiler-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("loop-compiler-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("loop-compiler-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("loop-compiler-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("loop-compiler-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("loop-compiler-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("loop-compiler-slice-after-parser.asmi", parserIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("loop-compiler-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("loop-compiler-slice-source.asmi", sourceOrgIndex, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "loop-compiler-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    "LPCTWOF EQU 75",
    "LPMESZ EQU 114",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the loop compiler proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE HybridLL1Full 0",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-compiler-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"loop-compiler-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"loop-compiler-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"loop-compiler-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"loop-compiler-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"loop-compiler-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"loop-compiler-slice-after-keywords.asmi\"",
    "            %INCLUDE \"loop-compiler-slice-source.asmi\"",
    "            %INCLUDE \"loop-compiler-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteLoopZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");

  const lines = source.split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "loop-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "loop-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "loop-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "loop-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "loop-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "loop-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "loop-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "loop-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "loop-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "loop-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "loop-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "loop-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("loop-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("loop-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("loop-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("loop-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("loop-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("loop-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("loop-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("loop-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("loop-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("loop-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("loop-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("loop-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "loop-z80-slice-proof-body.asmi", [
    ...lines.slice(proofOrgIndex),
  ]);

  return [
    "; Permanent Atom layout for the loop z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 1",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"loop-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"loop-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"loop-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"loop-z80-slice-source.asmi\"",
    "            %INCLUDE \"loop-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"loop-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"loop-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteCallZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const semanticBufferBase = atomSymbol(symbolMap, "SemanticBufferBase");
  const badCompletionName = atomSymbol(symbolMap, "BadCompletionName");
  const badCompletionSource = atomSymbol(symbolMap, "BadCompletionSource");

  const lines = source
    .replaceAll(`${semanticBufferBase}+$10`, "CLTRNEN")
    .replaceAll(`${badCompletionName}-${badCompletionSource}`, "CLBDOFS")
    .split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "call-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "call-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "call-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "call-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "call-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "call-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "call-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "call-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "call-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "call-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "call-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "call-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("call-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("call-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("call-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("call-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("call-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("call-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("call-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("call-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("call-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("call-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("call-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("call-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "call-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    `CLTRNEN EQU ${semanticBufferBase}+$10`,
    "CLBDOFS EQU 136",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the call z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 1",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"call-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"call-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"call-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"call-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"call-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"call-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"call-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"call-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"call-z80-slice-source.asmi\"",
    "            %INCLUDE \"call-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"call-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"call-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage7Ll1ParserCoverageProofPermanentAtomSource() {
  return [
    "; Permanent Atom layout for the Stage 7 LL(1) parser coverage proof.",
    "            %DEFINE Stage7LL1 1",
    "            %DEFINE SegmentedOutput 1",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 1",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"stage7-parser-coverage-proof.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage7ParserCoverageProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");

  const lines = source.split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "stage7-parser-coverage-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "stage7-parser-coverage-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "stage7-parser-coverage-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "stage7-parser-coverage-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "stage7-parser-coverage-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "stage7-parser-coverage-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "stage7-parser-coverage-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "stage7-parser-coverage-proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "stage7-parser-coverage-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "stage7-parser-coverage-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "stage7-parser-coverage-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "stage7-parser-coverage-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "stage7-parser-coverage-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "stage7-parser-coverage-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("stage7 parser coverage proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("stage7-parser-coverage-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("stage7-parser-coverage-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("stage7-parser-coverage-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("stage7-parser-coverage-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("stage7-parser-coverage-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("stage7-parser-coverage-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("stage7-parser-coverage-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("stage7-parser-coverage-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("stage7-parser-coverage-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("stage7-parser-coverage-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("stage7-parser-coverage-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("stage7-parser-coverage-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("stage7-parser-coverage-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-parser-coverage-proof-body.asmi", [
    ...lines.slice(proofOrgIndex),
  ]);

  return [
    "; Permanent Atom layout for the Stage 7 parser coverage proof body.",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-segmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"stage7-parser-coverage-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"stage7-parser-coverage-after-keywords.asmi\"",
    "            %INCLUDE \"stage7-parser-coverage-source.asmi\"",
    "            %INCLUDE \"stage7-parser-coverage-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"stage7-parser-coverage-runtime-after.asmi\"",
    "            %INCLUDE \"stage7-parser-coverage-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteFlatTargetZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const releasedGeneratedStagingBase = atomSymbol(symbolMap, "ReleasedGeneratedStagingBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const generatedBase = atomSymbol(symbolMap, "GeneratedBase");
  const aliases = [
    ["FTADIMG", "$98CB", ["AdapterCapturedBegin", "+", "TargetDescriptorImageBase"]],
    ["FTCTX00", "$98D8", ["AdapterCapturedContext", "+", "$00"]],
    ["FTCTX06", "$98DE", ["AdapterCapturedContext", "+", "$06"]],
    ["FTCTX0E", "$98E6", ["AdapterCapturedContext", "+", "$0E"]],
    ["FTMAP01", "$9905", ["AdapterCapturedMap", "+", "$01"]],
    ["FTMAP03", "$9907", ["AdapterCapturedMap", "+", "$03"]],
    ["FTMAP05", "$9909", ["AdapterCapturedMap", "+", "$05"]],
    ["FTMAP09", "$990D", ["AdapterCapturedMap", "+", "$09"]],
    ["FTMPWRI", "$9911", ["AdapterCapturedMap", "+", "TargetMapWritableBase", "-", "TargetFlatMapBase"]],
    ["FTMPVEC", "$9917", ["AdapterCapturedMap", "+", "TargetMapVectorLength", "-", "TargetFlatMapBase"]],
    ["FTMPINI", "$991B", ["AdapterCapturedMap", "+", "TargetMapInitializedLength", "-", "TargetFlatMapBase"]],
    ["FTMPBSS", "$991D", ["AdapterCapturedMap", "+", "TargetMapBssBase", "-", "TargetFlatMapBase"]],
    ["FTMPSTK", "$9921", ["AdapterCapturedMap", "+", "TargetMapStackRequirement", "-", "TargetFlatMapBase"]],
    ["FTMPDLA", "$9924", ["AdapterCapturedMap", "+", "TargetMapDataLoadAddress", "-", "TargetFlatMapBase"]],
    ["FTMPAGG", "$9928", ["AdapterCapturedMap", "+", "TargetMapAggregateBase", "-", "TargetFlatMapBase"]],
  ];
  const indexAliases = [
    ["FTIXBKC", ["TargetDescriptorBankCount"]],
  ];
  let rewritten = replaceAtomExpressionAliases(
    source,
    symbolMap,
    aliases.map(([alias, , expression]) => [alias, expression]),
  );
  for (const [alias, expression] of indexAliases) {
    rewritten = rewritten.replaceAll(
      ["IX", "+", ...expression].map((name) => atomSymbol(symbolMap, name)).join(""),
      `IX+${alias}`,
    );
  }

  const lines = rewritten.split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "flat-target-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "flat-target-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "flat-target-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "flat-target-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "flat-target-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "flat-target-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "flat-target-z80-slice-proof");
  const targetOutputIncludeIndex = findPermanentIncludeLine(lines, "target-output.asm", "flat-target-z80-slice-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "flat-target-z80-slice-proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "flat-target-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "flat-target-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "flat-target-z80-slice-proof");
  const stagingOrgIndex = findPermanentOrgLine(lines, releasedGeneratedStagingBase, "flat-target-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "flat-target-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "flat-target-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "flat-target-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    targetOutputIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    stagingOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("flat-target-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|Stage7LL1|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("flat-target-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("flat-target-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("flat-target-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("flat-target-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("flat-target-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("flat-target-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("flat-target-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, targetOutputIncludeIndex);
  writeSlice("flat-target-z80-slice-after-target-output.asmi", targetOutputIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("flat-target-z80-slice-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("flat-target-z80-slice-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("flat-target-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("flat-target-z80-slice-source.asmi", sourceOrgIndex, stagingOrgIndex);
  writeSlice("flat-target-z80-slice-staging.asmi", stagingOrgIndex, runtimeOrgIndex);
  writeSlice("flat-target-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("flat-target-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "flat-target-z80-slice-generated-base.asmi", [
    "; Legacy generated-image constants in loop-z80-state map to the released staging range in target proofs.",
    `${generatedBase} EQU ${releasedGeneratedStagingBase}`,
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "flat-target-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    ...aliases.map(([alias, value]) => `${alias} EQU ${value}`),
    ...atomExpressionAliasLines(symbolMap, indexAliases),
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the flat target z80 proof.",
    "            %DEFINE SegmentedOutput 1",
    "            %DEFINE TargetStreamingOutput 1",
    "            %DEFINE LegacyCompilerSlices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %DEFINE Stage7LL1 1",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 1",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"target-memory-map.asmi\"",
    "            %INCLUDE \"proof-segmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"target-output-state.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-generated-base.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"target-output.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-target-output.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-source.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-staging.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"flat-target-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"flat-target-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteTypedExpressionZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const aliases = [
    ["TEPNWOF", ["TypedNarrowTrapPoint", "-", "TypedNarrowTrapSource"]],
    ["TEPDVOF", ["TypedDivideTrapPoint", "-", "TypedDivideTrapSource"]],
    ["TEPNDOF", ["TypedNestedDivideOuter", "-", "TypedNestedDivideTrapSource"]],
    ["TEPNNOF", ["TypedNestedNarrowOuter", "-", "TypedNestedNarrowTrapSource"]],
    ["TEPU8MT", ["ScalarMetaConstant", "+", "ScalarTypeU8"]],
  ];

  const lines = replaceAtomExpressionAliases(source, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "typed-expression-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "typed-expression-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "typed-expression-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "typed-expression-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "typed-expression-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "typed-expression-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "typed-expression-z80-slice-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "typed-expression-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "typed-expression-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "typed-expression-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "typed-expression-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "typed-expression-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "typed-expression-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("typed-expression-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("typed-expression-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("typed-expression-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("typed-expression-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("typed-expression-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("typed-expression-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "typed-expression-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    "TEPNWOF EQU 67",
    "TEPDVOF EQU 68",
    "TEPNDOF EQU 101",
    "TEPNNOF EQU 88",
    "TEPU8MT EQU 129",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the typed-expression z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"typed-expression-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"typed-expression-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"typed-expression-z80-slice-source.asmi\"",
    "            %INCLUDE \"typed-expression-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"typed-expression-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"typed-expression-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteExpressionZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const aliases = [
    ["EXOUTOF", ["ExpressionOutputCall", "-", "ExpressionProofSource"]],
    ["EXDUPOF", ["DuplicateScalarName", "-", "DuplicateScalarSource"]],
    ["EXUNNOF", ["UnknownScalarName", "-", "UnknownScalarSource"]],
    ["EXMALOF", ["MalformedExpressionPoint", "-", "MalformedExpressionSource"]],
    ["EXFULOF", ["FullScalarName", "-", "FullScalarSource"]],
  ];

  const lines = replaceAtomExpressionAliases(source, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "expression-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "expression-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "expression-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "expression-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "expression-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "expression-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "expression-z80-slice-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "expression-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "expression-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "expression-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "expression-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "expression-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "expression-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("expression-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("expression-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("expression-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("expression-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("expression-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("expression-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("expression-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("expression-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("expression-z80-slice-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("expression-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("expression-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("expression-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("expression-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "expression-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    "EXOUTOF EQU $11C",
    "EXDUPOF EQU $18",
    "EXUNNOF EQU $29",
    "EXMALOF EQU $34",
    "EXFULOF EQU $104",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the expression z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 1",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"expression-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"expression-z80-slice-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"expression-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"expression-z80-slice-source.asmi\"",
    "            %INCLUDE \"expression-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"expression-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"expression-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteStructuredControlZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const spareBase = atomSymbol(symbolMap, "SpareBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const aliases = [
    ["SCAREC", ["StructuredAcceptedRecursiveCall", "-", "StructuredAcceptedSource"]],
    ["SCRGCOF", ["StructuredRangeCounter", "-", "StructuredRangeSource"]],
    ["SCACTOF", ["StructuredActiveCounterName", "-", "StructuredActiveCounterSource"]],
    ["SCEXTOT", ["StructuredExitOutsidePoint", "-", "StructuredExitOutsideSource"]],
    ["SCZEROF", ["StructuredZeroStepPoint", "-", "StructuredZeroStepSource"]],
    ["SCSTELF", ["StructuredStrayElsePoint", "-", "StructuredStrayElseSource"]],
    ["SCSTEIF", ["StructuredStrayElseIfPoint", "-", "StructuredStrayElseIfSource"]],
    ["SCSECOF", ["StructuredSecondForwardPoint", "-", "StructuredSecondForwardSource"]],
    ["SCPRFOF", ["StructuredProgramForwardPoint", "-", "StructuredProgramForwardSource"]],
    ["SCLOFOF", ["StructuredLocalForwardPoint", "-", "StructuredLocalForwardSource"]],
    ["SCMAFOF", ["StructuredMainForwardPoint", "-", "StructuredMainForwardSource"]],
    ["SCPAFOF", ["StructuredParameterForwardPoint", "-", "StructuredParameterForwardSource"]],
    ["SCPRMOF", ["StructuredProgramMainPoint", "-", "StructuredProgramMainSource"]],
    ["SCLOMOF", ["StructuredLocalMainPoint", "-", "StructuredLocalMainSource"]],
    ["SCPAMOF", ["StructuredParameterMainPoint", "-", "StructuredParameterMainSource"]],
    ["SCLBCOF", ["StructuredLabelCapacityPoint", "-", "StructuredLabelCapacitySource"]],
  ];

  const lines = replaceAtomExpressionAliases(source, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "structured-control-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "structured-control-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "structured-control-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "structured-control-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "structured-control-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "structured-control-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "structured-control-z80-slice-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "structured-control-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "structured-control-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "structured-control-z80-slice-proof");
  const spareOrgIndex = findPermanentOrgLine(lines, spareBase, "structured-control-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "structured-control-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "structured-control-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "structured-control-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    spareOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("structured-control-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("structured-control-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("structured-control-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("structured-control-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("structured-control-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("structured-control-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("structured-control-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("structured-control-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("structured-control-z80-slice-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("structured-control-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("structured-control-z80-slice-source.asmi", sourceOrgIndex, spareOrgIndex);
  writeSlice("structured-control-z80-slice-spare.asmi", spareOrgIndex, runtimeOrgIndex);
  writeSlice("structured-control-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("structured-control-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "structured-control-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    "SCAREC EQU $2A0",
    "SCRGCOF EQU $56",
    "SCACTOF EQU $57",
    "SCEXTOT EQU $29",
    "SCZEROF EQU $54",
    "SCSTELF EQU $11",
    "SCSTEIF EQU $11",
    "SCSECOF EQU $31",
    "SCPRFOF EQU $20",
    "SCLOFOF EQU $3D",
    "SCMAFOF EQU $0C",
    "SCPAFOF EQU $11",
    "SCPRMOF EQU $04",
    "SCLOMOF EQU $19",
    "SCPAMOF EQU $11",
    "SCLBCOF EQU $141",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the structured-control z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-source.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"structured-control-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-proof-body.asmi\"",
    "            %INCLUDE \"structured-control-z80-slice-spare.asmi\"",
    "",
  ].join("\n");
}

function rewriteAggregateZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const aliases = [
    ["AGIMGL", ["AggregateExpectedImageEnd", "-", "AggregateExpectedImage"]],
    ["AGFLD0", ["AggregateFieldTableBase", "+", "AggregateFieldOffset"]],
    ["AGFLD1", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "+", "AggregateFieldOffset"]],
    ["AGFLD2", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "*2", "+", "AggregateFieldOffset"]],
    ["AGFLD3", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "*3", "+", "AggregateFieldOffset"]],
    ["AGFLD4", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "*4", "+", "AggregateFieldOffset"]],
    ["AGFLD5", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "*5", "+", "AggregateFieldOffset"]],
    ["AGFLD6", ["AggregateFieldTableBase", "+", "AggregateFieldEntrySize", "*6", "+", "AggregateFieldOffset"]],
    ["AGSYM2I", ["SymbolTableBase", "+", "SymbolEntrySize", "*2", "+3"]],
    ["AGSYM2V", ["SymbolTableBase", "+", "SymbolEntrySize", "*2", "+4"]],
    ["AGSYM3V", ["SymbolTableBase", "+", "SymbolEntrySize", "*3", "+4"]],
    ["AGSYM4V", ["SymbolTableBase", "+", "SymbolEntrySize", "*4", "+4"]],
    ["AGSYM1V", ["SymbolTableBase", "+", "SymbolEntrySize", "+4"]],
    ["AGRSOF", ["AggregateRecordStepPoint", "-", "AggregateRecordStepSource"]],
    ["AGDPOF", ["AggregateDuplicateFieldPoint", "-", "AggregateDuplicateFieldSource"]],
    ["AGSTEOF", ["AggregateStringExtentCapacityPoint", "-", "AggregateStringExtentCapacitySource"]],
    ["AGDACOF", ["AggregateDataCapacityPoint", "-", "AggregateDataCapacitySource"]],
  ];

  const lines = replaceAtomExpressionAliases(source, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "aggregate-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "aggregate-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "aggregate-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "aggregate-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "aggregate-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "aggregate-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "aggregate-z80-slice-proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "aggregate-z80-slice-proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "aggregate-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "aggregate-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "aggregate-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "aggregate-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "aggregate-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "aggregate-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("aggregate-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("aggregate-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("aggregate-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("aggregate-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("aggregate-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("aggregate-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("aggregate-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("aggregate-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("aggregate-z80-slice-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("aggregate-z80-slice-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("aggregate-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("aggregate-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("aggregate-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("aggregate-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "aggregate-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    "AGIMGL EQU $38",
    "AGFLD0 EQU $44B9",
    "AGFLD1 EQU $44BF",
    "AGFLD2 EQU $44C5",
    "AGFLD3 EQU $44CB",
    "AGFLD4 EQU $44D1",
    "AGFLD5 EQU $44D7",
    "AGFLD6 EQU $44DD",
    "AGSYM2I EQU $423A",
    "AGSYM2V EQU $423B",
    "AGSYM3V EQU $4241",
    "AGSYM4V EQU $4247",
    "AGSYM1V EQU $4235",
    "AGRSOF EQU $4E",
    "AGDPOF EQU $15",
    "AGSTEOF EQU $15",
    "AGDACOF EQU $1C",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the aggregate z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"aggregate-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"aggregate-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"aggregate-z80-slice-source.asmi\"",
    "            %INCLUDE \"aggregate-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"aggregate-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"aggregate-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteArrayZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const badArrayOffset = "ARBDOFS";
  const badArrayColumn = "ARBDCOL";
  const badArrayValue = atomSymbol(symbolMap, "BadArrayValue");
  const badArraySource = atomSymbol(symbolMap, "BadArraySource");

  const lines = source
    .replaceAll(`${badArrayValue}-${badArraySource}+1`, badArrayColumn)
    .replaceAll(`${badArrayValue}-${badArraySource}`, badArrayOffset)
    .split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "array-z80-slice-proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "array-z80-slice-proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "array-z80-slice-proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "array-z80-slice-proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "array-z80-slice-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "array-z80-slice-proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "array-z80-slice-proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "array-z80-slice-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "array-z80-slice-proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "array-z80-slice-proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "array-z80-slice-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "array-z80-slice-proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("array-z80-slice proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(LegacyCompilerSlices|AggregateCallSlices|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("array-z80-slice-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("array-z80-slice-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("array-z80-slice-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("array-z80-slice-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("array-z80-slice-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("array-z80-slice-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("array-z80-slice-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("array-z80-slice-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("array-z80-slice-source.asmi", sourceOrgIndex, runtimeOrgIndex);
  writeSlice("array-z80-slice-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("array-z80-slice-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "array-z80-slice-proof-body.asmi", [
    lines[proofOrgIndex],
    `${badArrayOffset} EQU 29`,
    `${badArrayColumn} EQU 30`,
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the array z80 proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 1",
    "            %DEFINE AggregateCallSlices 0",
    "            %DEFINE LegacyEncoders 1",
    "            %DEFINE HybridLL1Full 0",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"array-z80-slice-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"array-z80-slice-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"array-z80-slice-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"array-z80-slice-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"array-z80-slice-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"array-z80-slice-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"array-z80-slice-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"array-z80-slice-after-keywords.asmi\"",
    "            %INCLUDE \"array-z80-slice-source.asmi\"",
    "            %INCLUDE \"array-z80-slice-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"array-z80-slice-runtime-after.asmi\"",
    "            %INCLUDE \"array-z80-slice-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage7Ll1ParserPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const hybridLL1TablesEnd = atomSymbol(symbolMap, "HybridLL1TablesEnd");
  const lines = source.split("\n");
  const tableIncludeIndex = findPermanentIncludeLine(lines, "../../grammar/stage7-tables.asmi", "stage7-ll1-parser");
  const tableEndIndex = findPermanentLabelLine(lines, hybridLL1TablesEnd, "stage7-ll1-parser");
  if (!(tableIncludeIndex < tableEndIndex)) {
    throw new Error("stage7-ll1-parser permanent Atom rewrite found an unexpected table section order");
  }
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-parser-core.asmi", [
    ...lines.slice(0, tableIncludeIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-parser-table-end.asmi", [
    ...lines.slice(tableEndIndex),
  ]);
  return [
    "; Permanent Atom layout for the Stage 7 LL(1) parser.",
    "            %INCLUDE \"stage7-ll1-parser-core.asmi\"",
    "            %INCLUDE \"../grammar/stage7-tables.asmi\"",
    "            %INCLUDE \"stage7-ll1-parser-table-end.asmi\"",
    "",
  ].join("\n");
}

function rewriteProofUnsegmentedStatePermanentAtomSource(source) {
  return source
    .split("\n")
    .map((line) => /^(\s*)%DEFINE\s+SegmentedOutput\b/i.test(line)
      ? "; SegmentedOutput is defined by each permanent Atom proof entry."
      : line)
    .join("\n");
}

function rewriteProofSegmentedStatePermanentAtomSource(source) {
  return source
    .split("\n")
    .map((line) => /^(\s*)%DEFINE\s+SegmentedOutput\b/i.test(line)
      ? "; SegmentedOutput is defined by each permanent Atom proof entry."
      : line)
    .join("\n");
}

function rewriteStage7Ll1EngineProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const stackBase = atomSymbol(symbolMap, "HybridLL1StackBase");
  const stackCapacity = atomSymbol(symbolMap, "HybridLL1StackCapacity");
  const stackLimit = "HLL1STKL";

  const lines = source.split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "stage7-ll1-engine-proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "stage7-ll1-parser.asm", "stage7-ll1-engine-proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "stage7-ll1-engine-proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "stage7-ll1-engine-proof");
  const actionsIncludeIndex = findPermanentIncludeLine(lines, "../../grammar/stage7-proof-actions.asmi", "stage7-ll1-engine-proof");

  if (!(compilerOrgIndex < parserIncludeIndex &&
    parserIncludeIndex < sourceOrgIndex &&
    sourceOrgIndex < proofOrgIndex &&
    proofOrgIndex < actionsIncludeIndex)) {
    throw new Error("stage7-ll1-engine proof permanent Atom rewrite found an unexpected section order");
  }

  const rewriteStackLimit = (line) => line.replaceAll(`${stackBase}+${stackCapacity}`, stackLimit);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-engine-front.asmi", [
    ...lines.slice(compilerOrgIndex, parserIncludeIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-engine-proof-before-actions.asmi", [
    `${stackLimit} EQU ${stackBase}+${stackCapacity}`,
    ...lines.slice(parserIncludeIndex + 1, actionsIncludeIndex).map(rewriteStackLimit),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-engine-proof-after-actions.asmi", [
    ...lines.slice(actionsIncludeIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the Stage 7 LL(1) engine proof.",
    "            %DEFINE SegmentedOutput 0",
    "            %DEFINE AggregateCallSlices 0",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-unsegmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"stage7-ll1-engine-front.asmi\"",
    "            %INCLUDE \"stage7-ll1-parser.asm\"",
    "            %INCLUDE \"stage7-ll1-engine-proof-before-actions.asmi\"",
    "            %INCLUDE \"../grammar/stage7-proof-actions.asmi\"",
    "            %INCLUDE \"stage7-ll1-engine-proof-after-actions.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage7Ll1AggregateCallZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const backupLimit = atomSymbol(symbolMap, "BackupLimit");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const proofBase = atomSymbol(symbolMap, "ProofBase");
  const aliases = [
    ["S7CSLOF", ["Stage7CorruptStringLengthPoint", "-", "Stage7CorruptStringSource"]],
    ["S7CSIOF", ["Stage7CorruptStringIndexPoint", "-", "Stage7CorruptStringIndexSource"]],
    ["S7DCRJ", ["Stage7DataCapacityRejectedPoint", "-", "Stage7DataCapacityRejectedSource"]],
    ["S7BCRJ", ["Stage7BssCapacityRejectedPoint", "-", "Stage7BssCapacityRejectedSource"]],
    ["S7WDRJ", ["Stage7WideRecordRejectedPoint", "-", "Stage7WideRecordRejectedSource"]],
    ["S7SACP", ["Stage7SealedArrayCapacityPoint", "-", "Stage7SealedArraySource"]],
    ["S7PRCP", ["Stage7ParameterCapacityPoint", "-", "Stage7ParameterCapacitySource"]],
    ["S7ROWH", ["Stage7ReadOnlyWholeAssignmentPoint", "-", "Stage7ReadOnlyWholeAssignmentSource"]],
    ["S7ROFL", ["Stage7ReadOnlyFieldAssignmentPoint", "-", "Stage7ReadOnlyFieldAssignmentSource"]],
    ["S7ROAR", ["Stage7ReadOnlyArrayAssignmentPoint", "-", "Stage7ReadOnlyArrayAssignmentSource"]],
    ["S7ROST", ["Stage7ReadOnlyStringAssignmentPoint", "-", "Stage7ReadOnlyStringAssignmentSource"]],
    ["S7ACIN", ["Stage7AggregateConstantIncompletePoint", "-", "Stage7AggregateConstantIncompleteSource"]],
    ["S7ACWT", ["Stage7AggregateConstantWrongTypePoint", "-", "Stage7AggregateConstantWrongTypeSource"]],
    ["S7ACRT", ["Stage7AggregateConstantRuntimePoint", "-", "Stage7AggregateConstantRuntimeSource"]],
    ["S7ACST", ["Stage7AggregateConstantScalarTypePoint", "-", "Stage7AggregateConstantScalarTypeSource"]],
    ["S7RCRJ", ["Stage7ReadOnlyCapacityRejectedPoint", "-", "Stage7ReadOnlyCapacityRejectedSource"]],
    ["S7RDOF", ["GeneratedRoDataBase", "-", "GeneratedBase"]],
    ["S7BRDO", ["BackupBase", "+", "S7RDOF"]],
    ["S7SREB", ["SegmentRoDataEntry", "+", "SegmentEntryBase"]],
  ];

  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "stage7 aggregate-call proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "stage7 aggregate-call proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "stage7 aggregate-call proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "stage7 aggregate-call proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "stage7 aggregate-call proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "stage7 aggregate-call proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "stage7 aggregate-call proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "stage7 aggregate-call proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "stage7 aggregate-call proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "stage7 aggregate-call proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "stage7 aggregate-call proof");
  const backupOrgIndex = findPermanentOrgLine(lines, backupLimit, "stage7 aggregate-call proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "stage7 aggregate-call proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "stage7 aggregate-call proof");
  const proofOrgIndex = findPermanentOrgLine(lines, proofBase, "stage7 aggregate-call proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    backupOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("stage7 aggregate-call proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|Stage7LL1|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("stage7-ll1-aggregate-call-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("stage7-ll1-aggregate-call-source.asmi", sourceOrgIndex, backupOrgIndex);
  writeSlice("stage7-ll1-aggregate-call-backup-source.asmi", backupOrgIndex, runtimeOrgIndex);
  writeSlice("stage7-ll1-aggregate-call-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("stage7-ll1-aggregate-call-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage7-ll1-aggregate-call-proof-body.asmi", [
    lines[proofOrgIndex],
    "S7CSLOF EQU $34",
    "S7CSIOF EQU $33",
    "S7DCRJ EQU $95",
    "S7BCRJ EQU $14",
    "S7WDRJ EQU $2D",
    "S7SACP EQU $17",
    "S7PRCP EQU $A0",
    "S7ROWH EQU $55",
    "S7ROFL EQU $42",
    "S7ROAR EQU $2A",
    "S7ROST EQU $2A",
    "S7ACIN EQU $3D",
    "S7ACWT EQU $1A",
    "S7ACRT EQU $25",
    "S7ACST EQU $10",
    "S7RCRJ EQU $96",
    "S7RDOF EQU $C00",
    "S7BRDO EQU $AC00",
    "S7SREB EQU $4474",
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the Stage 7 aggregate-call proof.",
    "            %DEFINE SegmentedOutput 1",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %DEFINE Stage7LL1 1",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 1",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-segmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-after-keywords.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-source.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-backup-source.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-runtime-after.asmi\"",
    "            %INCLUDE \"stage7-ll1-aggregate-call-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage8FailureZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const sourceBase = atomSymbol(symbolMap, "SourceBase");
  const spareBase = atomSymbol(symbolMap, "SpareBase");
  const backupLimit = atomSymbol(symbolMap, "BackupLimit");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const aliases = collectSimplePermanentExpressionAliases(source, "S8E");

  const lines = replaceAtomExpressionAliases(source, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "stage8 failure proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "stage8 failure proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "stage8 failure proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "stage8 failure proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "stage8 failure proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "stage8 failure proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "stage8 failure proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "stage8 failure proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "stage8 failure proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "stage8 failure proof");
  const sourceOrgIndex = findPermanentOrgLine(lines, sourceBase, "stage8 failure proof");
  const spareOrgIndex = findPermanentOrgLine(lines, spareBase, "stage8 failure proof");
  const backupOrgIndex = findPermanentOrgLine(lines, backupLimit, "stage8 failure proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "stage8 failure proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "stage8 failure proof");
  const proofOrgIndex = findPermanentOrgLine(lines, "$D000", "stage8 failure proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    sourceOrgIndex,
    spareOrgIndex,
    backupOrgIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("stage8 failure proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|Stage7LL1|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("stage8-failure-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("stage8-failure-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("stage8-failure-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("stage8-failure-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("stage8-failure-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("stage8-failure-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("stage8-failure-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("stage8-failure-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("stage8-failure-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("stage8-failure-after-keywords.asmi", keywordsIncludeIndex + 1, sourceOrgIndex);
  writeSlice("stage8-failure-source.asmi", sourceOrgIndex, spareOrgIndex);
  writeSlice("stage8-failure-spare-source.asmi", spareOrgIndex, backupOrgIndex);
  writeSlice("stage8-failure-backup-source.asmi", backupOrgIndex, runtimeOrgIndex);
  writeSlice("stage8-failure-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("stage8-failure-runtime-after.asmi", runtimeIncludeIndex + 1, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage8-failure-proof-body.asmi", [
    lines[proofOrgIndex],
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the Stage 8 failure proof.",
    "            %DEFINE SegmentedOutput 1",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %DEFINE Stage7LL1 1",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 1",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-segmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"stage8-failure-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"stage8-failure-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"stage8-failure-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"stage8-failure-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"stage8-failure-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"stage8-failure-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"stage8-failure-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"stage8-failure-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"stage8-failure-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"stage8-failure-after-keywords.asmi\"",
    "            %INCLUDE \"stage8-failure-source.asmi\"",
    "            %INCLUDE \"stage8-failure-spare-source.asmi\"",
    "            %INCLUDE \"stage8-failure-backup-source.asmi\"",
    "            %INCLUDE \"stage8-failure-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"stage8-failure-runtime-after.asmi\"",
    "            %INCLUDE \"stage8-failure-proof-body.asmi\"",
    "",
  ].join("\n");
}

function rewriteStage9ConformanceZ80SliceProofPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const compilerCoreBase = atomSymbol(symbolMap, "CompilerCoreBase");
  const targetRuntimeBase = atomSymbol(symbolMap, "TargetRuntimeBase");
  const sourceAliases = [
    ["S9RDOF", ["GeneratedRoDataBase", "-", "GeneratedBase"]],
    ["S9BRDO", ["BackupBase", "+", "S9RDOF"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, sourceAliases.map(([alias]) => alias));
  const aliases = [
    ...sourceAliases,
    ...collectSimplePermanentExpressionAliases(sourceWithoutAliases, "S9E"),
  ];

  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const compilerOrgIndex = findPermanentOrgLine(lines, compilerCoreBase, "stage9 conformance proof");
  const sourceAdapterIncludeIndex = findPermanentIncludeLine(lines, "source-adapter.asm", "stage9 conformance proof");
  const tokenizerIncludeIndex = findPermanentIncludeLine(lines, "loop-tokenizer.asm", "stage9 conformance proof");
  const semanticSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-semantic-sink.asm", "stage9 conformance proof");
  const symbolsIncludeIndex = findPermanentIncludeLine(lines, "loop-symbols.asm", "stage9 conformance proof");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "loop-parser.asm", "stage9 conformance proof");
  const loopSinkIncludeIndex = findPermanentIncludeLine(lines, "loop-z80-sink.asm", "stage9 conformance proof");
  const typedSinkIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-z80.asm", "stage9 conformance proof");
  const aggregateSinkIncludeIndex = findPermanentIncludeLine(lines, "aggregate-z80.asm", "stage9 conformance proof");
  const keywordsIncludeIndex = findPermanentIncludeLine(lines, "loop-keywords.asmi", "stage9 conformance proof");
  const runtimeOrgIndex = findPermanentOrgLine(lines, targetRuntimeBase, "stage9 conformance proof");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "proof-z80-runtime.asm", "stage9 conformance proof");
  const corpusOrgIndex = findPermanentOrgLine(lines, "$B000", "stage9 conformance proof");
  const proofOrgIndex = findPermanentOrgLine(lines, "$D000", "stage9 conformance proof");

  const orderedIndexes = [
    compilerOrgIndex,
    sourceAdapterIncludeIndex,
    tokenizerIncludeIndex,
    semanticSinkIncludeIndex,
    symbolsIncludeIndex,
    parserIncludeIndex,
    loopSinkIncludeIndex,
    typedSinkIncludeIndex,
    aggregateSinkIncludeIndex,
    keywordsIncludeIndex,
    runtimeOrgIndex,
    runtimeIncludeIndex,
    corpusOrgIndex,
    proofOrgIndex,
  ];
  if (!orderedIndexes.every((value, index) => index === 0 || orderedIndexes[index - 1] < value)) {
    throw new Error("stage9 conformance proof permanent Atom rewrite found an unexpected section order");
  }

  const writeSlice = (includeName, start, end) => {
    writeGeneratedPermanentPart(translatedRoot, relative, includeName, [
      ...lines.slice(start, end).filter((line) =>
        !/^\s*%DEFINE\s+(TargetStreamingOutput|LegacyCompilerSlices|AggregateCallSlices|Stage7LL1|LegacyEncoders)\b/i.test(line)),
      "",
    ]);
  };
  writeSlice("stage9-conformance-code-begin.asmi", compilerOrgIndex, sourceAdapterIncludeIndex);
  writeSlice("stage9-conformance-after-source-adapter.asmi", sourceAdapterIncludeIndex + 1, tokenizerIncludeIndex);
  writeSlice("stage9-conformance-after-tokenizer.asmi", tokenizerIncludeIndex + 1, semanticSinkIncludeIndex);
  writeSlice("stage9-conformance-after-semantic-sink.asmi", semanticSinkIncludeIndex + 1, symbolsIncludeIndex);
  writeSlice("stage9-conformance-after-symbols.asmi", symbolsIncludeIndex + 1, parserIncludeIndex);
  writeSlice("stage9-conformance-after-parser.asmi", parserIncludeIndex + 1, loopSinkIncludeIndex);
  writeSlice("stage9-conformance-after-loop-z80-sink.asmi", loopSinkIncludeIndex + 1, typedSinkIncludeIndex);
  writeSlice("stage9-conformance-after-typed-expression-z80.asmi", typedSinkIncludeIndex + 1, aggregateSinkIncludeIndex);
  writeSlice("stage9-conformance-after-aggregate-z80.asmi", aggregateSinkIncludeIndex + 1, keywordsIncludeIndex);
  writeSlice("stage9-conformance-after-keywords.asmi", keywordsIncludeIndex + 1, runtimeOrgIndex);
  writeSlice("stage9-conformance-runtime-begin.asmi", runtimeOrgIndex, runtimeIncludeIndex);
  writeSlice("stage9-conformance-runtime-after.asmi", runtimeIncludeIndex + 1, corpusOrgIndex);
  writeSlice("stage9-conformance-corpus-source.asmi", corpusOrgIndex, proofOrgIndex);
  writeGeneratedPermanentPart(translatedRoot, relative, "stage9-conformance-proof-body.asmi", [
    lines[proofOrgIndex],
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    ...lines.slice(proofOrgIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the Stage 9 conformance proof.",
    "            %DEFINE SegmentedOutput 1",
    "            %DEFINE TargetStreamingOutput 0",
    "            %DEFINE LegacyCompilerSlices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %DEFINE Stage7LL1 1",
    "            %DEFINE LegacyEncoders 0",
    "            %DEFINE HybridLL1Full 1",
    "            %DEFINE RuntimeProofServices 1",
    "            %INCLUDE \"memory-map.asmi\"",
    "            %INCLUDE \"proof-segmented-state.asmi\"",
    "            %INCLUDE \"loop-compiler-state.asmi\"",
    "            %INCLUDE \"aggregate-call-state.asmi\"",
    "            %INCLUDE \"loop-z80-state.asmi\"",
    "            %INCLUDE \"stage9-conformance-code-begin.asmi\"",
    "            %INCLUDE \"source-adapter.asm\"",
    "            %INCLUDE \"stage9-conformance-after-source-adapter.asmi\"",
    "            %INCLUDE \"loop-tokenizer.asm\"",
    "            %INCLUDE \"stage9-conformance-after-tokenizer.asmi\"",
    "            %INCLUDE \"loop-semantic-sink.asm\"",
    "            %INCLUDE \"stage9-conformance-after-semantic-sink.asmi\"",
    "            %INCLUDE \"loop-symbols.asm\"",
    "            %INCLUDE \"stage9-conformance-after-symbols.asmi\"",
    "            %INCLUDE \"loop-parser.asm\"",
    "            %INCLUDE \"stage9-conformance-after-parser.asmi\"",
    "            %INCLUDE \"loop-z80-sink.asm\"",
    "            %INCLUDE \"stage9-conformance-after-loop-z80-sink.asmi\"",
    "            %INCLUDE \"typed-expression-z80.asm\"",
    "            %INCLUDE \"stage9-conformance-after-typed-expression-z80.asmi\"",
    "            %INCLUDE \"aggregate-z80.asm\"",
    "            %INCLUDE \"stage9-conformance-after-aggregate-z80.asmi\"",
    "            %INCLUDE \"loop-keywords.asmi\"",
    "            %INCLUDE \"stage9-conformance-after-keywords.asmi\"",
    "            %INCLUDE \"stage9-conformance-runtime-begin.asmi\"",
    "            %INCLUDE \"proof-z80-runtime.asm\"",
    "            %INCLUDE \"stage9-conformance-runtime-after.asmi\"",
    "            %INCLUDE \"stage9-conformance-corpus-source.asmi\"",
    "            %INCLUDE \"stage9-conformance-proof-body.asmi\"",
    "",
  ].join("\n");
}

function collectSimplePermanentExpressionAliases(source, prefix) {
  const aliases = [];
  const seen = new Set();
  for (const line of source.split("\n")) {
    const code = maskQuotedText(stripComment(line));
    const pattern = /\b([A-Za-z_.$?][A-Za-z0-9_.$?]*(?:\s*[+-]\s*(?:[A-Za-z_.$?][A-Za-z0-9_.$?]*|\$[0-9A-Fa-f]+|\d+))+)\b/g;
    for (const match of code.matchAll(pattern)) {
      const expression = match[1].replace(/\s+/g, "");
      const identifiers = expression.match(/[A-Za-z_.$?][A-Za-z0-9_.$?]*/g) ?? [];
      if (identifiers.length < 2) continue;
      if (seen.has(expression)) continue;
      seen.add(expression);
      const alias = `${prefix}${aliases.length.toString(36).toUpperCase().padStart(2, "0")}`;
      const tokens = expression.match(/[+-]|[A-Za-z_.$?][A-Za-z0-9_.$?]*|\$[0-9A-Fa-f]+|\d+/g);
      if (tokens === null) continue;
      aliases.push([alias, tokens]);
    }
  }
  return aliases;
}

function maskQuotedText(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== "") {
      output += " ";
      if (character === "\\" && index + 1 < source.length) {
        output += " ";
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      output += " ";
      continue;
    }
    output += character;
  }
  return output;
}

function atomExpressionAliasLines(symbolMap, aliases) {
  return aliases.map(([alias, expression]) =>
    `${alias} EQU ${expression.map((name) => atomSymbol(symbolMap, name)).join("")}`,
  );
}

function replaceAtomExpressionAliases(source, symbolMap, aliases) {
  let rewritten = source;
  for (const [alias, expression] of aliases) {
    rewritten = rewritten.replaceAll(
      expression.map((name) => atomSymbol(symbolMap, name)).join(""),
      alias,
    );
  }
  return rewritten;
}

function rewriteAggregateCallParserPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const descriptorAliases = [
    ["ACPTDBC", ["11"], ["IX", "+", "TargetDescriptorBankCount"]],
    ["ACPTDEB", ["12"], ["IX", "+", "TargetDescriptorEntryBank"]],
    ["ACPTDP1", ["14"], ["IX", "+", "TargetDescriptorPartBanksPointer", "+1"]],
    ["ACPTDPP", ["13"], ["IX", "+", "TargetDescriptorPartBanksPointer"]],
  ];
  const aliases = [
    ["ACPRLEN", ["8"], ["TargetBankRoLengthLimit", "-", "TargetBankRoLengthBase"]],
    ["ACPWSZ", ["157"], ["Stage7CompilerWorkspaceEnd", "-", "Stage7StateBase"]],
    ["ACPSAPR", ["$8C"], ["SymbolAggregateFlag", "+", "SymbolClassParameter"]],
    ["ACPSCU8", ["$81"], ["ScalarMetaConstant", "+", "ScalarTypeU8"]],
  ];
  let rewritten = removeAtomAliasDefinitions(
    source,
    [...descriptorAliases, ...aliases].map(([alias]) => alias),
  );
  for (const [alias, , expression] of aliases) {
    rewritten = rewritten.replaceAll(
      expression.map((name) => atomSymbol(symbolMap, name)).join(""),
      alias,
    );
  }
  for (const [alias, , expression] of descriptorAliases) {
    rewritten = rewritten.replaceAll(
      expression.map((name) => atomSymbol(symbolMap, name)).join(""),
      `IX+${alias}`,
    );
  }
  const lines = rewritten.split("\n");
  const parserIncludeIndex = findPermanentIncludeLine(lines, "stage7-ll1-parser.asm", "aggregate-call-parser");
  const actionsIncludeIndex = findPermanentIncludeLine(lines, "stage7-ll1-actions.asm", "aggregate-call-parser");
  const ifIndex = lines
    .slice(0, parserIncludeIndex)
    .findLastIndex((line) => /^\s*%IF\s+Stage7LL1\s*$/i.test(line));
  const endifIndex = lines.findIndex((line, index) =>
    index > actionsIncludeIndex && /^\s*%ENDIF\s*$/i.test(line));
  if (!(ifIndex >= 0 &&
    ifIndex < parserIncludeIndex &&
    parserIncludeIndex < actionsIncludeIndex &&
    actionsIncludeIndex < endifIndex)) {
    throw new Error("aggregate-call-parser permanent Atom rewrite found an unexpected Stage7 include section");
  }
  writeGeneratedPermanentPart(translatedRoot, relative, "aggregate-call-parser-core.asmi", [
    ...atomExpressionAliasLines(symbolMap, descriptorAliases.map(([alias, expression]) => [alias, expression])),
    ...atomExpressionAliasLines(symbolMap, aliases.map(([alias, expression]) => [alias, expression])),
    "",
    ...lines.slice(0, ifIndex),
    ...lines.slice(endifIndex + 1),
  ]);
  return [
    "; Permanent Atom layout for the aggregate-call parser.",
    "            %INCLUDE \"aggregate-call-parser-core.asmi\"",
    "            %IF Stage7LL1",
    "            %INCLUDE \"stage7-ll1-parser.asm\"",
    "            %INCLUDE \"stage7-ll1-actions.asm\"",
    "            %ENDIF",
    "",
  ].join("\n");
}

function rewriteStage7Ll1ActionsPermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["H1RCFLG", ["SymbolRecordTypeFlag", "+", "SymbolAggregateFlag"]],
    ["H1AGCST", ["SymbolAggregateFlag", "+", "SymbolClassConstant"]],
    ["H1MTMSK", ["ScalarMetaConstant", "+", "ScalarMetaTypeMask"]],
    ["H1MCBL", ["ScalarMetaConstant", "+", "ScalarTypeBoolean"]],
    ["H1CFCOF", ["ControlFrameCounter", "-", "ControlFrameLabelA"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  return [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases),
  ].join("\n");
}

function rewriteAggregateParserPermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["AGPRFLG", ["SymbolRecordTypeFlag", "+", "SymbolAggregateFlag"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  return [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases),
  ].join("\n");
}

function rewriteAggregateCallZ80PermanentAtomSource(source, { symbolMap }) {
  const literalAliases = [
    ["ACZTOFF", "3", ["TrapOffset", "-", "StateBase"]],
    ["ACZCLMO", "43", ["NucleusRuntimeActivationClaimOffset"]],
    ["ACZRLSO", "68", ["NucleusRuntimeActivationReleaseOffset"]],
    ["ACZARRY", "77", ["NucleusRuntimeCheckArrayIndexOffset"]],
    ["ACZMULW", "182", ["NucleusRuntimeMultiplyU16Offset"]],
    ["ACZAGGR", "115", ["NucleusRuntimeCheckAggregateRegionOffset"]],
    ["ACZSLEN", "85", ["NucleusRuntimeCheckStringLengthOffset"]],
    ["ACZSIDX", "95", ["NucleusRuntimeCheckStringIndexOffset"]],
  ];
  const aliasesMovedToTypedTail = [
    "Stage7IndexToA",
    "Stage7LoadIndirect8Bytes",
    "Stage7CopyPrepare",
    "Stage7DecSP2",
    "Stage7LoadIXL",
    "Stage7LoadIXH",
    "Stage7StoreIXL",
    "Stage7StoreIXH",
    "Stage7PopIndexBase",
    "Stage8PopErrorBytes",
    "Stage8ErrorCarrierBytes",
  ].map((name) => atomSymbol(symbolMap, name));
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, literalAliases.map(([alias]) => alias));
  const rewritten = replaceAtomExpressionAliases(
    sourceWithoutAliases,
    symbolMap,
    literalAliases.map(([alias, , expression]) => [alias, expression]),
  )
    .split("\n")
    .filter((line) => !aliasesMovedToTypedTail.some((label) =>
      new RegExp(`^\\s*${escapeRegExp(label)}\\s+EQU\\b`, "i").test(line)))
    .join("\n");
  return [
    ...literalAliases.map(([alias, value]) => `${alias} EQU ${value}`),
    "",
    rewritten,
  ].join("\n");
}

function rewriteAggregateZ80PermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["AGZCLMS", ["SymbolAggregateFlag", "+", "SymbolClassMask"]],
    ["AGZCNS2", ["SymbolAggregateFlag", "+", "SymbolClassConstant"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  return [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases),
  ].join("\n");
}

function rewriteLoopZ80SinkPermanentAtomSource(source, { symbolMap }) {
  const segmentedAliases = [
    ["LZBKRO", ["BackupBase", "+(", "GeneratedRoDataBase", "-", "GeneratedBase", ")"]],
    ["LZSCEL", ["SegmentCodeEntry", "+", "SegmentEntryLimit"]],
    ["LZSREB", ["SegmentRoDataEntry", "+", "SegmentEntryBase"]],
    ["LZSDEL", ["SegmentDataEntry", "+", "SegmentEntryLimit"]],
    ["LZSBEB", ["SegmentBssEntry", "+", "SegmentEntryBase"]],
  ];
  const segmentedIndexAliases = [
    ["LZIXB1", ["1"], ["IX", "+", "SegmentEntryBase", "+1"]],
    ["LZIXL1", ["3"], ["IX", "+", "SegmentEntryLimit", "+1"]],
    ["LZIXEB", ["0"], ["IX", "+", "SegmentEntryBase"]],
    ["LZIXEL", ["2"], ["IX", "+", "SegmentEntryLimit"]],
  ];
  const targetStateAliases = [
    ["LZTNUM", ["TrapNumber", "-", "StateBase"]],
    ["LZTROU", ["TrapRoutine", "-", "StateBase"]],
    ["LZTOFF", ["TrapOffset", "-", "StateBase"]],
    ["LZRUNS", ["RunState", "-", "StateBase"]],
    ["LZTERR", ["TrapError", "-", "StateBase"]],
  ];
  const aliases = [...segmentedAliases, ...targetStateAliases];
  const sourceWithoutAliases = removeAtomAliasDefinitions(
    source,
    [...segmentedAliases, ...segmentedIndexAliases, ...targetStateAliases].map(([alias]) => alias),
  );
  let rewritten = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases);
  for (const [alias, , expression] of segmentedIndexAliases) {
    rewritten = rewritten.replaceAll(
      expression.map((name) => atomSymbol(symbolMap, name)).join(""),
      `IX+${alias}`,
    );
  }
  return [
    "%IF AggregateCallSlices",
    "%IF TargetStreamingOutput",
    "%ELSE",
    ...atomExpressionAliasLines(symbolMap, segmentedAliases),
    ...atomExpressionAliasLines(symbolMap, segmentedIndexAliases.map(([alias, expression]) => [alias, expression])),
    "%ENDIF",
    "%ENDIF",
    "",
    "%IF TargetStreamingOutput",
    ...atomExpressionAliasLines(symbolMap, targetStateAliases),
    "%ENDIF",
    "",
    rewritten,
  ].join("\n");
}

function rewriteTargetOutputPermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["TOUTRNL", "70", ["NucleusRuntimeVectorLength", "+", "NucleusRuntimeStateLength"]],
    ["TOUTRUN", "0", ["RunState", "-", "StateBase"]],
    ["TOUTTRP", "1", ["TrapNumber", "-", "StateBase"]],
    ["TOFLGLM", "2", ["TargetDescriptorEstablishStack", "+1"]],
    ["TOSTK02", "3842", ["TargetStackRequirement", "+2"]],
    ["TOVEC03", "36", ["NucleusRuntimeVectorLength", "+3"]],
    ["TOEXL03", "367", ["NucleusRuntimeExpectedLength", "+3"]],
  ];
  const indexAliases = [
    ["TOIXRIH", "1", ["TargetDescriptorRuntimeIdentity", "+1"]],
    ["TOIXIBH", "3", ["TargetDescriptorImageBase", "+1"]],
    ["TOIXICH", "5", ["TargetDescriptorImageCapacity", "+1"]],
    ["TOIXWBH", "7", ["TargetDescriptorWritableBase", "+1"]],
    ["TOIXWCH", "9", ["TargetDescriptorWritableCapacity", "+1"]],
    ["TOIXRID", "0", ["TargetDescriptorRuntimeIdentity"]],
    ["TOIXFLG", "10", ["TargetDescriptorFlags"]],
    ["TOIXIBS", "2", ["TargetDescriptorImageBase"]],
    ["TOIXICP", "4", ["TargetDescriptorImageCapacity"]],
    ["TOIXWBS", "6", ["TargetDescriptorWritableBase"]],
    ["TOIXWCP", "8", ["TargetDescriptorWritableCapacity"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(
    source,
    [...aliases, ...indexAliases].map(([alias]) => alias),
  );
  let rewritten = replaceAtomExpressionAliases(
    sourceWithoutAliases,
    symbolMap,
    aliases.map(([alias, , expression]) => [alias, expression]),
  );
  for (const [alias, , expression] of indexAliases) {
    rewritten = rewritten.replaceAll(
      ["IX", "+", ...expression].map((name) => atomSymbol(symbolMap, name)).join(""),
      `IX+${alias}`,
    );
  }
  const targetTerminalSelectBytes = atomSymbol(symbolMap, "TargetTerminalSelectBytes");
  const terminalSelectPattern = new RegExp(`^${escapeRegExp(targetTerminalSelectBytes)}\\s+EQU\\b`, "i");
  rewritten = rewritten.split("\n").filter((line) => !terminalSelectPattern.test(line)).join("\n");
  return [
    ...aliases.map(([alias, value]) => `${alias} EQU ${value}`),
    ...indexAliases.map(([alias, value]) => `${alias} EQU ${value}`),
    "",
    rewritten,
  ].join("\n");
}

function removeAtomAliasDefinitions(source, aliases) {
  const aliasSet = new Set(aliases.map((alias) => alias.toUpperCase()));
  return source
    .split("\n")
    .filter((line) => {
      const match = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+EQU\b/i.exec(line);
      return match === null || !aliasSet.has(match[1].toUpperCase());
    })
    .join("\n");
}

function rewriteLoopParserPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const aliases = [
    ["LPAIMOD", ["AggregateHasInitializer", "-", "AggregateMode", "+1"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const typedExpressionIncludeIndex = findPermanentIncludeLine(lines, "typed-expression-parser.asm", "loop-parser");
  const aggregateParserIncludeIndex = findPermanentIncludeLine(lines, "aggregate-parser.asm", "loop-parser");
  const aggregateCallParserIncludeIndex = findPermanentIncludeLine(lines, "aggregate-call-parser.asm", "loop-parser");
  const firstRoutineIndex = lines.findIndex((line) => /^\s*;@ROUTINE\b/i.test(line));
  const ifIndex = lines
    .slice(aggregateParserIncludeIndex + 1, aggregateCallParserIncludeIndex)
    .findIndex((line) => /^\s*%IF\s+AggregateCallSlices\s*$/i.test(line));
  const endifIndex = lines.findIndex((line, index) =>
    index > aggregateCallParserIncludeIndex && /^\s*%ENDIF\s*$/i.test(line));
  if (!(firstRoutineIndex >= 0 &&
    firstRoutineIndex < typedExpressionIncludeIndex &&
    typedExpressionIncludeIndex < aggregateParserIncludeIndex &&
    aggregateParserIncludeIndex < aggregateCallParserIncludeIndex &&
    ifIndex >= 0 &&
    endifIndex > aggregateCallParserIncludeIndex)) {
    throw new Error("loop-parser permanent Atom rewrite found an unexpected include section");
  }
  writeGeneratedPermanentPart(translatedRoot, relative, "loop-parser-core.asmi", [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    ...lines.slice(firstRoutineIndex, typedExpressionIncludeIndex),
    "",
  ]);
  return [
    "; Permanent Atom layout for the loop parser.",
    "            %INCLUDE \"loop-parser-core.asmi\"",
    "            %INCLUDE \"typed-expression-parser.asm\"",
    "            %INCLUDE \"aggregate-parser.asm\"",
    "            %IF AggregateCallSlices",
    "            %INCLUDE \"aggregate-call-parser.asm\"",
    "            %ENDIF",
    "",
  ].join("\n");
}

function rewriteStructuredControlParserPermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["SCPFMOD", ["ControlFrameMode", "-", "ControlFrameCounter"]],
    ["SCPRFLG", ["SymbolRecordTypeFlag", "+", "SymbolAggregateFlag"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  return [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases),
  ].join("\n");
}

function rewriteTypedExpressionParserPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const aliases = [
    ["TEPRFLG", ["SymbolRecordTypeFlag", "+", "SymbolAggregateFlag"]],
    ["TEPOR16", ["SemanticOr8", "*$100+", "SemanticOr16"]],
    ["TEPXR16", ["SemanticXor8", "*$100+", "SemanticXor16"]],
    ["TEPAN16", ["SemanticAnd8", "*$100+", "SemanticAnd16"]],
    ["TEPDV16", ["SemanticDivide8", "*$100+", "SemanticDivide16"]],
    ["TEPMD16", ["SemanticModulo8", "*$100+", "SemanticModulo16"]],
    ["TEPMEX", ["ScalarMetaConstant", "+", "ScalarTypeExact"]],
    ["TEPMBL", ["ScalarMetaConstant", "+", "ScalarTypeBoolean"]],
    ["TEPMU8", ["ScalarMetaConstant", "+", "ScalarTypeU8"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const structuredIncludeIndex = findPermanentIncludeLine(lines, "structured-control-parser.asm", "typed-expression-parser");
  writeGeneratedPermanentPart(translatedRoot, relative, "typed-expression-parser-core.asmi", [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    ...lines.slice(0, structuredIncludeIndex),
    "",
  ]);
  return [
    "; Permanent Atom layout for the typed-expression parser.",
    "            %INCLUDE \"typed-expression-parser-core.asmi\"",
    "            %INCLUDE \"structured-control-parser.asm\"",
    "",
  ].join("\n");
}

function rewriteTypedExpressionZ80PermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const aliases = [
    ["TEZACTD", ["ActivationDepth", "-", "StateBase"]],
    ["TEZRTSP", ["RootSP", "-", "StateBase"]],
    ["TEZRTIX", ["RootIX", "-", "StateBase"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const structuredIncludeIndex = findPermanentIncludeLine(lines, "structured-control-z80.asm", "typed-expression-z80");
  const aggregateIncludeIndex = findPermanentIncludeLine(lines, "aggregate-call-z80.asm", "typed-expression-z80");
  const ifIndex = lines
    .slice(0, aggregateIncludeIndex)
    .findLastIndex((line) => /^\s*%IF\s+AggregateCallSlices\s*$/i.test(line));
  const endifIndex = lines.findIndex((line, index) =>
    index > aggregateIncludeIndex && /^\s*%ENDIF\s*$/i.test(line));
  if (!(structuredIncludeIndex < ifIndex &&
    ifIndex < aggregateIncludeIndex &&
    aggregateIncludeIndex < endifIndex)) {
    throw new Error("typed-expression-z80 permanent Atom rewrite found an unexpected include section");
  }
  writeGeneratedPermanentPart(translatedRoot, relative, "typed-expression-z80-core.asmi", [
    ...atomExpressionAliasLines(symbolMap, aliases),
    "",
    ...lines.slice(0, structuredIncludeIndex),
    "",
  ]);
  const typedBeginAndBytes = atomSymbol(symbolMap, "TypedBeginAndBytes");
  const typedBeginAndLowTest = "TYPDBG1";
  const typedBeginAndBranch = "TYPDBG3";
  const targetTerminalSelectBytes = atomSymbol(symbolMap, "TargetTerminalSelectBytes");
  const typedBeginPattern = new RegExp(`^(${escapeRegExp(typedBeginAndBytes)}:\\s*)DB\\s+\\$E1,\\$7D,`, "i");
  const segmentedCopyBytes = atomSymbol(symbolMap, "SegmentedCopyBytes");
  const stage7Ldir = atomSymbol(symbolMap, "Stage7LDIR");
  const stage7LoadIndirect8Prefix = atomSymbol(symbolMap, "Stage7LoadIndirect8Prefix");
  const stage7LoadIndirect8Bytes = atomSymbol(symbolMap, "Stage7LoadIndirect8Bytes");
  const typedAtoHl = atomSymbol(symbolMap, "TypedAtoHL");
  const stage8ErrorCarrierBytes = atomSymbol(symbolMap, "Stage8ErrorCarrierBytes");
  const typedLoadSpPrefix = atomSymbol(symbolMap, "TypedLoadSPPrefix");
  const stage7IndexToA = atomSymbol(symbolMap, "Stage7IndexToA");
  const typedParameter16Bytes = atomSymbol(symbolMap, "TypedParameter16Bytes");
  const stage7DecSp2 = atomSymbol(symbolMap, "Stage7DecSP2");
  const stage7StoreIxl = atomSymbol(symbolMap, "Stage7StoreIXL");
  const stage7StoreIxh = atomSymbol(symbolMap, "Stage7StoreIXH");
  const typedLoadLocalLow = atomSymbol(symbolMap, "TypedLoadLocalLow");
  const stage7LoadIxl = atomSymbol(symbolMap, "Stage7LoadIXL");
  const typedLoadLocalHigh = atomSymbol(symbolMap, "TypedLoadLocalHigh");
  const stage7LoadIxh = atomSymbol(symbolMap, "Stage7LoadIXH");
  const typedStoreLocalLow = atomSymbol(symbolMap, "TypedStoreLocalLow");
  const typedStoreLocalHigh = atomSymbol(symbolMap, "TypedStoreLocalHigh");
  const typedPopOperandsBytes = atomSymbol(symbolMap, "TypedPopOperandsBytes");
  const stage7CopyPrepare = atomSymbol(symbolMap, "Stage7CopyPrepare");
  const stage7PopIndexBase = atomSymbol(symbolMap, "Stage7PopIndexBase");
  const typedNot8Bytes = atomSymbol(symbolMap, "TypedNot8Bytes");
  const stage8PopErrorBytes = atomSymbol(symbolMap, "Stage8PopErrorBytes");
  const simpleAliasTargets = new Map([
    [segmentedCopyBytes, [[stage7Ldir, "Stage7LDIR"]]],
    [stage7LoadIndirect8Prefix, [[stage7LoadIndirect8Bytes, "Stage7LoadIndirect8Bytes"]]],
    [typedAtoHl, [[stage8ErrorCarrierBytes, "Stage8ErrorCarrierBytes"]]],
    [typedLoadLocalLow, [[stage7LoadIxl, "Stage7LoadIXL"]]],
    [typedLoadLocalHigh, [[stage7LoadIxh, "Stage7LoadIXH"]]],
    [typedPopOperandsBytes, [
      [stage7CopyPrepare, "Stage7CopyPrepare"],
      [stage7PopIndexBase, "Stage7PopIndexBase"],
    ]],
    [typedNot8Bytes, [[stage8PopErrorBytes, "Stage8PopErrorBytes"]]],
  ]);
  const withMovedAliases = (line) => {
    const labelMatch = /^([A-Za-z0-9_.$]+):/.exec(line.trimStart());
    if (labelMatch === null) return [line];
    const aliasesForLine = simpleAliasTargets.get(labelMatch[1]);
    if (aliasesForLine === undefined) return [line];
    return [
      ...aliasesForLine.map(([alias, original]) =>
        `${alias}: ;@NUC-GLOBAL ${original} PERMANENT ${alias}`),
      line,
    ];
  };
  const typedLoadSpPattern = new RegExp(`^(${escapeRegExp(typedLoadSpPrefix)}:\\s*)DB\\s+\\$ED,\\$7B(.*)$`, "i");
  const typedParameter16Pattern = new RegExp(`^(${escapeRegExp(typedParameter16Bytes)}:\\s*)DB\\s+\\$3B,\\$3B,\\$DD,\\$75,\\$FF,\\$DD,\\$74,\\$FE(.*)$`, "i");
  writeGeneratedPermanentPart(translatedRoot, relative, "typed-expression-z80-tail.asmi", lines
    .slice(endifIndex + 1)
    .flatMap((line) => {
      const match = typedBeginPattern.exec(line);
      if (match !== null) {
        return [
          `${match[1]}DB $E1`,
          `${typedBeginAndLowTest}:     DB $7D,$B7`,
          `${targetTerminalSelectBytes}: ;@NUC-GLOBAL TargetTerminalSelectBytes PERMANENT ${targetTerminalSelectBytes}`,
          `${typedBeginAndBranch}:     DB ${line.slice(match[0].length + "$B7,".length)}`,
        ];
      }
      const typedLoadSpMatch = typedLoadSpPattern.exec(line);
      if (typedLoadSpMatch !== null) {
        return [
          `${typedLoadSpMatch[1]}DB $ED${typedLoadSpMatch[2]}`,
          `${stage7IndexToA}: DB $7B ;@NUC-GLOBAL Stage7IndexToA PERMANENT ${stage7IndexToA}`,
        ];
      }
      const typedParameter16Match = typedParameter16Pattern.exec(line);
      if (typedParameter16Match !== null) {
        return [
          `${stage7DecSp2}: ;@NUC-GLOBAL Stage7DecSP2 PERMANENT ${stage7DecSp2}`,
          `${typedParameter16Match[1]}DB $3B,$3B${typedParameter16Match[2]}`,
          `${typedStoreLocalLow}: ;@NUC-GLOBAL TypedStoreLocalLow PERMANENT ${typedStoreLocalLow}`,
          `${stage7StoreIxl}: DB $DD,$75,$FF ;@NUC-GLOBAL Stage7StoreIXL PERMANENT ${stage7StoreIxl}`,
          `${typedStoreLocalHigh}: ;@NUC-GLOBAL TypedStoreLocalHigh PERMANENT ${typedStoreLocalHigh}`,
          `${stage7StoreIxh}: DB $DD,$74,$FE ;@NUC-GLOBAL Stage7StoreIXH PERMANENT ${stage7StoreIxh}`,
        ];
      }
      if (new RegExp(`^\\s*(${escapeRegExp(typedStoreLocalLow)}|${escapeRegExp(typedStoreLocalHigh)})\\s+EQU\\b`, "i").test(line)) {
        return [];
      }
      return withMovedAliases(line);
    }));
  return [
    "; Permanent Atom layout for the typed-expression z80 backend.",
    "            %INCLUDE \"typed-expression-z80-core.asmi\"",
    "            %INCLUDE \"structured-control-z80.asm\"",
    "            %IF AggregateCallSlices",
    "            %INCLUDE \"aggregate-call-z80.asm\"",
    "            %ENDIF",
    "            %INCLUDE \"typed-expression-z80-tail.asmi\"",
    "",
  ].join("\n");
}

function rewriteStructuredControlZ80PermanentAtomSource(source, { symbolMap }) {
  const replacements = new Map([
    [atomSymbol(symbolMap, "StructuredBranchFalseBytes"), atomSymbol(symbolMap, "TypedBeginAndBytes")],
    [atomSymbol(symbolMap, "StructuredPopBoundStart"), atomSymbol(symbolMap, "TypedPopOperandsBytes")],
    [atomSymbol(symbolMap, "StructuredTestHL"), "TYPDBG1"],
    [atomSymbol(symbolMap, "StructuredTestHigh"), atomSymbol(symbolMap, "TypedTestHigh")],
  ]);
  return source
    .split("\n")
    .filter((line) => ![...replacements.keys()].some((name) =>
      new RegExp(`^${escapeRegExp(name)}\\s+EQU\\b`, "i").test(line)))
    .map((line) => {
      let rewritten = line;
      for (const [from, to] of replacements) {
        rewritten = rewritten.replaceAll(from, to);
      }
      return rewritten;
    })
    .join("\n");
}

function rewriteLoopKeywordsPermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["LKSRU8", ["Stage8CallableServiceFlag", "+", "Stage8ServiceResultU8"]],
    ["LKSRSW", ["Stage8CallableServiceFlag", "+", "Stage8ServiceRewindStorage"]],
    ["LKRDIN", ["LKSRU8", "+", "Stage8ServiceReadInput"]],
    ["LKRDSB", ["LKSRU8", "+", "Stage8ServiceReadStorage"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  return [
    "%IF AggregateCallSlices",
    ...atomExpressionAliasLines(symbolMap, aliases),
    "%ENDIF",
    "",
    replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases),
  ].join("\n");
}

function rewriteProofZ80RuntimePermanentAtomSource() {
  return [
    "; Permanent Atom layout for the proof runtime wrapper.",
    "            %INCLUDE \"loop-z80-runtime.asm\"",
    "",
  ].join("\n");
}

function rewriteTargetZ80RuntimePermanentAtomSource() {
  return [
    "; Permanent Atom layout for the target runtime wrapper.",
    "            %INCLUDE \"loop-z80-runtime.asm\"",
    "",
  ].join("\n");
}

function rewriteNucleusTargetRuntimeLinkPermanentAtomSource(source, { relative, translatedRoot, symbolMap }) {
  const runtimeLinkBase = atomSymbol(symbolMap, "RuntimeLinkBase");
  const lines = source.split("\n");
  const orgIndex = findPermanentOrgLine(lines, runtimeLinkBase, "target runtime link");
  const runtimeIncludeIndex = findPermanentIncludeLine(lines, "target-z80-runtime.asm", "target runtime link");

  if (!(orgIndex < runtimeIncludeIndex)) {
    throw new Error("target runtime link permanent Atom rewrite found an unexpected section order");
  }
  writeGeneratedPermanentPart(translatedRoot, relative, "nucleus-target-runtime-link-begin.asmi", [
    ...lines.slice(orgIndex, runtimeIncludeIndex),
    "",
  ]);
  writeGeneratedPermanentPart(translatedRoot, relative, "nucleus-target-runtime-link-end.asmi", [
    ...lines.slice(runtimeIncludeIndex + 1),
  ]);

  return [
    "; Permanent Atom layout for the target runtime link entry.",
    "            %DEFINE RuntimeProofServices 0",
    "            %DEFINE AggregateCallSlices 1",
    "            %INCLUDE \"nucleus-runtime-link-context.asmi\"",
    "            %INCLUDE \"nucleus-target-runtime-link-begin.asmi\"",
    "            %INCLUDE \"target-z80-runtime.asm\"",
    "            %INCLUDE \"nucleus-target-runtime-link-end.asmi\"",
    "",
  ].join("\n");
}

function rewriteNucleusRuntimeLinkContextPermanentAtomSource(source) {
  return source
    .split("\n")
    .map((line) => /^\s*%DEFINE\s+AggregateCallSlices\b/i.test(line)
      ? "; AggregateCallSlices is defined by the target runtime link entry."
      : line)
    .join("\n");
}

function rewriteLoopZ80RuntimePermanentAtomSource(source, { symbolMap }) {
  const aliases = [
    ["LRTSTSZ", ["StateEnd", "-", "TrapNumber"]],
    ["LRTSISZ", ["ServiceInputLength", "-", "ServiceFailureCall"]],
    ["LRTSOSZ", ["ServiceStateEnd", "-", "ServiceStorageOutputLength"]],
  ];
  const sourceWithoutAliases = removeAtomAliasDefinitions(source, aliases.map(([alias]) => alias));
  const lines = replaceAtomExpressionAliases(sourceWithoutAliases, symbolMap, aliases).split("\n");
  const identityIncludeIndex = findPermanentIncludeLine(lines, "nucleus-runtime-identity.asmi", "loop-z80-runtime");
  return [
    "            %INCLUDE \"nucleus-runtime-identity.asmi\"",
    "",
    "%IF RuntimeProofServices",
    ...atomExpressionAliasLines(symbolMap, aliases),
    "%ENDIF",
    "",
    ...lines.slice(0, identityIncludeIndex),
    ...lines.slice(identityIncludeIndex + 1),
  ].join("\n");
}

function includeSpecifier(source) {
  const match = /^\s*\.include\s+"([^"\r\n]+)"\s*$/i.exec(source);
  return match?.[1];
}

function flattenTranslatedEntry(report, entry) {
  const symbolMap = symbolMapFromLedger(report.ledger);
  const symbolMetadata = symbolMetadataFromLedger(report.ledger);
  const preprocessorSymbols = new Set(report.preprocessorSymbols);
  const stack = [];
  const definitions = new Map();
  const conditionStack = [];

  function active() {
    return conditionStack.every((condition) => condition.active);
  }

  function parseDefinitionValue(text) {
    const trimmed = text.trim();
    const value = numberValue(trimmed);
    if (value === undefined) {
      throw new Error(`unsupported Nucleus preview definition value: ${trimmed}`);
    }
    return value;
  }

  function handlePreprocessorLine(source, output) {
    const define = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:\s*|\s+)\.equ\b(.*)$/i.exec(source);
    if (define !== null && preprocessorSymbols.has(define[2])) {
      if (active()) {
        const value = parseDefinitionValue(define[4]);
        definitions.set(define[2], value);
        output.push(`${define[1]};@DEFINE ${define[2]} ${value}`);
      }
      return true;
    }

    const directive = /^\s*\.(if|else|endif)\b\s*(.*)$/i.exec(source);
    if (directive === null) return false;
    const name = directive[1].toLowerCase();
    const argument = directive[2].trim();
    if (name === "if") {
      if (!simpleConditionPattern.test(argument)) {
        throw new Error(`unsupported Nucleus preview conditional expression: ${argument}`);
      }
      const parentActive = active();
      const enabled = (definitions.get(argument) ?? 0) !== 0;
      conditionStack.push({ parentActive, conditionEnabled: enabled, active: parentActive && enabled });
      output.push(`;@IF ${argument} ${enabled ? 1 : 0}`);
      return true;
    }
    if (name === "else") {
      const top = conditionStack.at(-1);
      if (top === undefined) throw new Error("Nucleus preview conditional .ELSE without .IF");
      top.active = top.parentActive && !top.conditionEnabled;
      output.push(";@ELSE");
      return true;
    }
    const top = conditionStack.pop();
    if (top === undefined) throw new Error("Nucleus preview conditional .ENDIF without .IF");
    output.push(";@ENDIF");
    return true;
  }

  function expand(file) {
    const real = path.resolve(file);
    const activeIndex = stack.indexOf(real);
    if (activeIndex >= 0) {
      const cycle = [...stack.slice(activeIndex), real]
        .map((item) => path.relative(report.asmRoot, item).split(path.sep).join("/"))
        .join(" -> ");
      throw new Error(`include cycle while flattening Nucleus Atom preview: ${cycle}`);
    }
    stack.push(real);
    const relative = path.relative(report.asmRoot, real).split(path.sep).join("/");
    const lines = readFileSync(real, "utf8").split(/\n/);
    const output = [`;@SOURCE-BEGIN ${relative}`];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const source = stripComment(line);
      const comment = line.slice(source.length);
      if (handlePreprocessorLine(source, output)) {
        continue;
      }
      if (!active()) {
        continue;
      }
      const include = includeSpecifier(source);
      if (include !== undefined) {
        output.push(`;@INCLUDE-BEGIN ${include}${comment === "" ? "" : ` ${comment}`}`);
        output.push(expand(path.resolve(path.dirname(real), include)));
        output.push(`;@INCLUDE-END ${include}`);
        continue;
      }
      output.push(translateNucleusAzmLine(line, {
        sourceName: relative,
        lineNumber: index + 1,
        symbolMap,
        symbolMetadata,
        preprocessorSymbols,
      }));
    }
    output.push(`;@SOURCE-END ${relative}`);
    stack.pop();
    if (stack.length === 0 && conditionStack.length !== 0) {
      throw new Error("Nucleus preview conditional .IF without .ENDIF");
    }
    return output.join("\n");
  }

  return expand(path.resolve(report.asmRoot, entry));
}

function flattenedEntryParts(report, entry, { maxBytes = 0xffff } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 0xffff) {
    throw new Error("flattened Atom-preview part byte limit must be 1 through 65535");
  }
  const text = flattenTranslatedEntry(report, entry);
  const encoder = new TextEncoder();
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
  const parts = [];
  let current = "";
  let currentBytes = 0;

  for (const line of lines) {
    const lineBytes = encoder.encode(line).length;
    if (lineBytes > maxBytes) {
      throw new Error(`flattened Atom-preview line exceeds ${maxBytes} bytes`);
    }
    if (currentBytes !== 0 && currentBytes + lineBytes > maxBytes) {
      const bytes = encoder.encode(current);
      parts.push(Object.freeze({
        ordinal: parts.length,
        bank: 0,
        logicalIdentity: `${entry}#preview-${String(parts.length).padStart(3, "0")}`,
        originalBytes: bytes,
        compilerBytes: bytes,
        binaryIncludes: Object.freeze([]),
      }));
      current = "";
      currentBytes = 0;
    }
    current += line;
    currentBytes += lineBytes;
  }

  if (currentBytes !== 0 || parts.length === 0) {
    const bytes = encoder.encode(current);
    parts.push(Object.freeze({
      ordinal: parts.length,
      bank: 0,
      logicalIdentity: `${entry}#preview-${String(parts.length).padStart(3, "0")}`,
      originalBytes: bytes,
      compilerBytes: bytes,
      binaryIncludes: Object.freeze([]),
    }));
  }

  return Object.freeze(parts);
}

function writeFlattenedEntry(report, entry, output) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${flattenTranslatedEntry(report, entry)}\n`);
}

function recordSymbol(symbols, original, file, line, proofSymbols, definitionKind) {
  const existing = symbols.get(original);
  if (existing !== undefined) {
    existing.definitions.push({ file, line });
    if (existing.definitionKind !== definitionKind) existing.definitionKind = "mixed";
    return;
  }
  symbols.set(original, {
    original,
    file,
    scope: classifyScope(original, file, proofSymbols),
    definitionKind,
    definitions: [{ file, line }],
  });
}

function printTextReport(report) {
  console.log(`Nucleus AZM-to-Atom dry-run: ${report.status}`);
  console.log(`permanentSource=${report.readiness.permanentSource}`);
  console.log(`compatibilityLowering=${report.readiness.compatibilityLowering}`);
  console.log(`compatibilityBlockingIssues=${report.readiness.compatibilityBlockingIssues}`);
  console.log(`files=${report.measured.files}`);
  console.log(`sourceLines=${report.measured.sourceLines}`);
  console.log(`definedSymbols=${report.measured.definedSymbols}`);
  console.log(`longSymbols=${report.measured.longSymbols}`);
  console.log(`contractLines=${report.measured.contractLines}`);
  console.log(`includeAfterHeader=${report.measured.includeAfterHeader}`);
  console.log(`compatibilityLoweringRequired=${report.measured.compatibilityLoweringRequired}`);
  console.log(`localLabelCandidates=${report.measured.localLabelCandidates}`);
  console.log(`globalSymbolRenames=${report.measured.globalSymbolRenames}`);
  console.log(`proofSymbolMappings=${report.measured.proofSymbolMappings}`);
  console.log(`proofLimitMappings=${report.measured.proofLimitMappings}`);
  console.log(`contractMappings=${report.measured.contractMappings}`);
  console.log(`proofManifests=${report.measured.proofManifests}`);
  for (const [status, count] of Object.entries(report.measured.proofMatrix)) {
    console.log(`proofMatrix.${status}=${count}`);
  }
  console.log(`issues=${report.issues.length}`);
  for (const [code, count] of Object.entries(report.measured.issues)) {
    console.log(`issues.${code}=${count}`);
  }
  if (report.issues.length > 0) {
    console.log("");
    console.log("First issues:");
    for (const issue of report.issues.slice(0, 20)) {
      const at = issue.file === undefined ? "" : ` (${issue.file}:${issue.line ?? 0})`;
      console.log(`- ${issue.code}${at}: ${issue.message}`);
    }
  }
}

export {
  flattenTranslatedEntry,
  flattenedEntryParts,
  scanAssembly,
  symbolMapFromLedger,
  symbolMetadataFromLedger,
  translateNucleusAzmLine,
  writeFlattenedEntry,
  writeTranslatedTree,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = scanAssembly(options);
    if (options.ledgerOut !== undefined) {
      writeJsonFile(options.ledgerOut, report.ledger);
    }
    if (options.issuesOut !== undefined) {
      writeJsonFile(options.issuesOut, report.issues);
    }
    if (options.includeReportOut !== undefined) {
      writeJsonFile(options.includeReportOut, report.includeAfterHeaderReport);
    }
    if (options.proofSymbolMapOut !== undefined) {
      writeJsonFile(options.proofSymbolMapOut, report.proofSymbolMap);
    }
    if (options.proofLimitMapOut !== undefined) {
      writeJsonFile(options.proofLimitMapOut, report.proofLimitMap);
    }
    if (options.proofMatrixOut !== undefined) {
      writeJsonFile(options.proofMatrixOut, report.proofMatrix);
    }
    if (options.contractMapOut !== undefined) {
      writeJsonFile(options.contractMapOut, report.contractMap);
    }
    if (options.migrationBundleOut !== undefined) {
      writeJsonFile(options.migrationBundleOut, report);
    }
    if (options.translatedRoot !== undefined) {
      writeTranslatedTree(report, options.translatedRoot, { symbols: options.translatedSymbols });
    }
    if (options.flattenEntry !== undefined || options.flattenOut !== undefined) {
      if (options.flattenEntry === undefined || options.flattenOut === undefined) {
        throw new Error("--flatten-entry and --flatten-out must be used together");
      }
      writeFlattenedEntry(report, options.flattenEntry, options.flattenOut);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }
    if (!options.reportOnly && report.issues.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
