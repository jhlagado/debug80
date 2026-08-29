; Prove the Stage 7 packed LL(1) parser against aggregate calls and paths.

            .include "stage7-ll1-aggregate-call-z80-slice-proof-config.asmi"
            .include "memory-map.asmi"
            .include "proof-segmented-state.asmi"
            .include "loop-compiler-state.asmi"
            .include "aggregate-call-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
S7CSLOF .equ Stage7CorruptStringLengthPoint-Stage7CorruptStringSource ; corrupt string length source offset
S7CSIOF .equ Stage7CorruptStringIndexPoint-Stage7CorruptStringIndexSource ; corrupt string index source offset
S7SACP  .equ Stage7SealedArrayCapacityPoint-Stage7SealedArraySource ; sealed array capacity source offset
S7RDOF  .equ GeneratedRoDataBase-GeneratedBase ; read-only data offset from generated image base
S7BRDO  .equ BackupBase+S7RDOF ; backup address corresponding to generated read-only data
S7SREB  .equ SegmentRoDataEntry+SegmentEntryBase ; read-only segment entry base field
SourceAdapterCodeStart:
            .include "source-adapter.asm"
SourceAdapterCodeEnd:
TokenizerCodeStart:
            .include "loop-tokenizer.asm"
TokenizerCodeEnd:
SemanticSinkCodeStart:
            .include "loop-semantic-sink.asm"
SemanticSinkCodeEnd:
SymbolCodeStart:
            .include "loop-symbols.asm"
SymbolCodeEnd:
ParserCodeStart:
            .include "loop-parser.asm"
ParserCodeEnd:
CompilerCommonCodeEnd:
SinkCodeStart:
            .include "loop-z80-sink.asm"
TypedSinkCodeStart:
            .include "typed-expression-z80.asm"
            .include "aggregate-z80.asm"
TypedSinkCodeEnd:
SinkCodeEnd:
CompilerCodeEnd:
CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
Stage7CopySource:
            .db "record Counter",10
            .db "value as u8",10
            .db "end",10
            .db "var source as Counter = (1)",10
            .db "var destination as Counter",10
            .db "sub copyAndIncrement(input as Counter, output as Counter)",10
            .db "output = input",10
            .db "output.value = output.value + 1",10
            .db "end",10
            .db "sub main() fails",10
            .db "source = source",10
            .db "copyAndIncrement(source, destination)",10
            .db "if source.value = 1 and destination.value = 2",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10
            .db "end",10
Stage7CopySourceEnd:

Stage7ForwardSource:
            .db "record Sample",10
            .db "value as u8",10
            .db "end",10
            .db "var samples as Sample[2] = [(3), (7)]",10
            .db "sub select(items as Sample[2], index as u8) as Sample",10
            .db "return items[index]",10
            .db "end",10
            .db "sub forwardSelection(items as Sample[2], index as u8) as Sample",10
            .db "return select(items, index)",10
            .db "end",10
            .db "sub nine() as u8",10
            .db "return 9",10
            .db "end",10
            .db "sub replace(item as Sample, value as u8)",10
            .db "item.value = value",10
            .db "end",10
            .db "sub main() fails",10
            .db "replace(forwardSelection(samples, 1), nine())",10
            .db "if samples[1].value = 9",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10
            .db "end",10
Stage7ForwardSourceEnd:

Stage7StringSource:
            .db "var text as string[3] = \"ABC\"",10
            .db "sub mutate(item as string[3], index as u8)",10
            .db "item[index] = 'Y'",10
            .db "end",10
            .db "sub main() fails",10
            .db "mutate(text, 1)",10
            .db "if text.length = 3 and text[1] = 'Y'",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10
            .db "end",10
Stage7StringSourceEnd:

Stage7BoundsSource:
            .db "record Sample",10
            .db "value as u8",10
            .db "end",10
            .db "var samples as Sample[2] = [(3), (7)]",10
            .db "sub select(items as Sample[2], index as u8) as Sample",10
            .db "return items[index]",10
            .db "end",10
            .db "sub main() fails",10
            .db "select(samples, 2)",10
            .db "writeOutputByte('N') else fail",10
            .db "end",10
Stage7BoundsSourceEnd:

Stage7ConstantBoundsSource:
            .db "record Sample",10
            .db "value as u8",10
            .db "end",10
            .db "var samples as Sample[2] = [(3), (7)]",10
            .db "sub main()",10
            .db "samples[2].value = 9",10
            .db "end",10
Stage7ConstantBoundsSourceEnd:

Stage7NominalMismatchSource:
            .db "record Left",10
            .db "value as u8",10
            .db "end",10
            .db "record Right",10
            .db "value as u8",10
            .db "end",10
            .db "var left as Left",10
            .db "var right as Right",10
            .db "sub main()",10
            .db "right = left",10
            .db "end",10
Stage7NominalMismatchSourceEnd:

Stage7TransientMisuseSource:
            .db "record Sample",10
            .db "value as u8",10
            .db "end",10
            .db "var samples as Sample[2] = [(3), (7)]",10
            .db "sub select(items as Sample[2], index as u8) as Sample",10
            .db "return items[index]",10
            .db "end",10
            .db "sub main() fails",10
            .db "writeOutputByte(u8(select(samples, 0))) else fail",10
            .db "end",10
Stage7TransientMisuseSourceEnd:

Stage7RoutineCapacitySource:
            .db "sub a()",10,"end",10
            .db "sub b()",10,"end",10
            .db "sub c()",10,"end",10
            .db "sub d()",10,"end",10
            .db "sub e()",10,"end",10
Stage7RoutineCapacitySourceEnd:

Stage7ParameterCapacitySource:
            .db "sub many(a as u8, b as u8, c as u8, d as u8, e as u8, f as u8, g as u8, h as u8, i as u8, j as u8, k as u8, l as u8, m as u8, n as u8, o as u8, p as u8, "
            .db "q as u8"
Stage7ParameterCapacityPoint:
            .db ")",10
            .db "end",10
Stage7ParameterCapacitySourceEnd:

Stage7CallDepthSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var box as Box",10
            .db "sub keep(item as Box) as Box",10
            .db "return item",10
            .db "end",10
            .db "sub main()",10
            .db "keep(keep(keep(keep(keep(box)))))",10
            .db "end",10
Stage7CallDepthSourceEnd:

            ; Additional adversarial source fixtures live after the Z80
            ; transaction backup rather than consuming the 2 KiB source bank.
            .org BackupLimit

Stage7LargeDataSource:
            .db "var first as string[253] = \"A\"",10
            .db "var second as string[253] = \"B\"",10
            .db "sub main() fails",10
            .db "if first.length = 1 and second[0] = 'B'",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10
            .db "end",10
Stage7LargeDataSourceEnd:

Stage7DataCapacityAcceptedSource:
            .db "var a as string[253] = \"\"",10
            .db "var b as string[253] = \"\"",10
            .db "var c as string[253] = \"\"",10
            .db "var d as string[253] = \"\"",10
            .db "var tail as u8[4] = [0,0,0,0]",10
            .db "sub main()",10,"end",10
Stage7DataCapacityAcceptedSourceEnd:

Stage7DataCapacityRejectedSource:
            .db "var a as string[253] = \"\"",10
            .db "var b as string[253] = \"\"",10
            .db "var c as string[253] = \"\"",10
            .db "var d as string[253] = \"\"",10
            .db "var tail as u8[4] = [0,0,0,0]",10
            .db "var e as u8 = 1"
Stage7DataCapacityRejectedPoint:
            .db 10
Stage7DataCapacityRejectedSourceEnd:

Stage7BssCapacityAcceptedSource:
            .db "var bytes as u8[1024]",10
            .db "sub main() fails",10
            .db "bytes[1023] = 'Y'",10
            .db "writeOutputByte(bytes[1023]) else fail",10
            .db "end",10
Stage7BssCapacityAcceptedSourceEnd:

Stage7BssCapacityRejectedSource:
            .db "var bytes as u8[1025"
Stage7BssCapacityRejectedPoint:
            .db "]",10
Stage7BssCapacityRejectedSourceEnd:

Stage7WideAggregateSource:
            .db "record Wide",10
            .db "padding as u8[300]",10
            .db "values as u8[200]",10
            .db "tail as u8",10
            .db "end",10
            .db "var items as Wide[2]",10
            .db "sub main() fails",10
            .db "items[0].values[199] = 'Y'",10
            .db "items[1] = items[0]",10
            .db "writeOutputByte(items[1].values[199]) else fail",10
            .db "end",10
Stage7WideAggregateSourceEnd:

Stage7WideRecordRejectedSource:
            .db "record TooLarge",10
            .db "bytes as u8[1024]",10
            .db "extra as u8"
Stage7WideRecordRejectedPoint:
            .db 10
            .db "end",10
Stage7WideRecordRejectedSourceEnd:

Stage7WideInitializedSource:
            .db "var bytes as u8[256] = ["
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]",10
            .db "sub main()",10,"end",10
Stage7WideInitializedSourceEnd:

; These word lengths share their low byte. Structural interning must compare
; the high byte and retain two different array descriptors.
Stage7WordLengthInterningSource:
            .db "var small as u8[1]",10
            .db "var wide as u8[257]",10
            .db "sub main() fails",10
            .db "end",10
Stage7WordLengthInterningSourceEnd:

Stage7ParameterRoutineCollisionSource:
            .db "sub choose(choose as u8)",10
            .db "end",10
Stage7ParameterRoutineCollisionSourceEnd:

Stage7StringLengthWriteSource:
            .db "var text as string[3] = \"ABC\"",10
            .db "sub main()",10
            .db "text.length = 0",10
            .db "end",10
Stage7StringLengthWriteSourceEnd:

Stage7MainParameterSource:
            .db "sub f(main as u8)",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage7MainParameterSourceEnd:

Stage7MainParameterSyntaxSource:
            .db "sub main(value as u8)",10
            .db "end",10
Stage7MainParameterSyntaxSourceEnd:

Stage7MainResultSource:
            .db "sub main() as u8",10
            .db "end",10
Stage7MainResultSourceEnd:

Stage7RoutineFailsSource:
            .db "sub f() fails",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage7RoutineFailsSourceEnd:

Stage7MissingMainSource:
            .db "sub f()",10
            .db "end",10
Stage7MissingMainSourceEnd:

Stage7AfterMainSource:
            .db "sub main()",10
            .db "end",10
            .db "var x as u8",10
Stage7AfterMainSourceEnd:

Stage7ServiceRoutineSource:
            .db "sub writeOutputByte(value as u8)",10
            .db "end",10
Stage7ServiceRoutineSourceEnd:

Stage7ServiceParameterSource:
            .db "sub f(writeOutputByte as u8)",10
            .db "end",10
Stage7ServiceParameterSourceEnd:

Stage7ServiceVariableSource:
            .db "var writeOutputByte as u8",10
            .db "sub main()",10
            .db "end",10
Stage7ServiceVariableSourceEnd:

; Payload index 137 becomes StaticImageBase+138. Before the scalar-type guard,
; u8 descriptor underflow could reinterpret this controlled byte as a string
; descriptor and admit r.value.length.
Stage7ScalarSuffixPoisonSource:
            .db "var poison as string[140] = \""
            .db "AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA"
            .db "AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA"
            .db "AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA","AAAAAAAAAA"
            .db "AAAAAAAAAA","AAAAAAA\\x05AA\"",10
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var r as R",10
            .db "sub main()",10
            .db "writeOutputByte(r.value.length)",10
            .db "end",10
Stage7ScalarSuffixPoisonSourceEnd:

Stage7RecordIndexSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var r as R",10
            .db "sub main()",10
            .db "writeOutputByte(r[0].value)",10
            .db "end",10
Stage7RecordIndexSourceEnd:

Stage7ShortCircuitSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var items as R[2]",10
            .db "sub main()",10
            .db "if false and items[2].value = 0",10
            .db "end",10
            .db "if true or items[2].value = 0",10
            .db "end",10
            .db "end",10
Stage7ShortCircuitSourceEnd:

Stage7StructuredRoutineSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var items as R[2]",10
            .db "sub identity(flag as boolean) as boolean",10
            .db "return flag",10
            .db "end",10
            .db "sub first(flag as boolean) as u8",10
            .db "if flag",10
            .db "return 1",10
            .db "else",10
            .db "return 0",10
            .db "end",10
            .db "end",10
            .db "sub second(word as u16) as u16",10
            .db "if word > 0",10
            .db "return word",10
            .db "else",10
            .db "return 0",10
            .db "end",10
            .db "end",10
            .db "sub main() fails",10
            .db "if identity(false and items[2].value = 0)",10
            .db "writeOutputByte('X') else fail",10
            .db "end",10
            .db "if identity(true or items[2].value = 0)",10
            .db "else",10
            .db "writeOutputByte('X') else fail",10
            .db "end",10
            .db "if first(true) = 1 and second(513) = 513",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10
            .db "end",10
Stage7StructuredRoutineSourceEnd:

Stage7RecursiveCapacitySource:
            .db "var marker as u8",10
            .db "sub descend(level as u8)",10
            .db "if level = 0",10
            .db "marker = 1",10
            .db "else",10
            .db "descend(level - 1)",10
            .db "end",10
            .db "end",10
            .db "sub main()",10
            .db "descend(8)",10
            .db "end",10
Stage7RecursiveCapacitySourceEnd:

Stage7SuffixLengthSource: .db ".length",10
Stage7SuffixLengthSourceEnd:
Stage7SuffixFieldSource: .db ".value",10
Stage7SuffixFieldSourceEnd:
Stage7SuffixIndexSource: .db "[0]",10
Stage7SuffixIndexSourceEnd:

Stage7TooFewArgumentsSource:
            .db "sub pair(a as u8, b as u8)",10
            .db "end",10
            .db "sub main()",10
            .db "pair(1)",10
            .db "end",10
Stage7TooFewArgumentsSourceEnd:

Stage7TooManyArgumentsSource:
            .db "sub one(a as u8)",10
            .db "end",10
            .db "sub main()",10
            .db "one(1, 2)",10
            .db "end",10
Stage7TooManyArgumentsSourceEnd:

Stage7ScalarForAggregateSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var r as R",10
            .db "var x as u8",10
            .db "sub take(item as R)",10
            .db "end",10
            .db "sub main()",10
            .db "take(x)",10
            .db "end",10
Stage7ScalarForAggregateSourceEnd:

Stage7AggregateForScalarSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var r as R",10
            .db "sub take(value as u8)",10
            .db "end",10
            .db "sub main()",10
            .db "take(r)",10
            .db "end",10
Stage7AggregateForScalarSourceEnd:

Stage7ScalarResultAggregateSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var r as R",10
            .db "sub get() as u8",10
            .db "return r",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage7ScalarResultAggregateSourceEnd:

Stage7AggregateResultScalarSource:
            .db "record R",10
            .db "value as u8",10
            .db "end",10
            .db "var x as u8",10
            .db "sub get() as R",10
            .db "return x",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage7AggregateResultScalarSourceEnd:

Stage7AggregateConstantSource:
            .db "record Pair",10
            .db "left as u8",10
            .db "right as u16",10
            .db "end",10
            .db "const Origin as Pair = (7, 300)",10
            .db "const Values as u8[3] = [1, 2, 3]",10
            .db "const Text as string[3] = \"A\\0B\"",10
            ; Declaring initialized data after constants forces the compiler
            ; to shift the read-only suffix without changing constant offsets.
            .db "var target as Pair = (1, 2)",10
            .db "sub mutate(item as Pair)",10
            .db "item.left = 9",10
            .db "end",10
            .db "sub returnOrigin() as Pair",10
            .db "return Origin",10
            .db "end",10
            .db "sub main() fails",10
            .db "target = Origin",10
            .db "if target.left = 7 and target.right = 300 and Values[1] = 2 and Text.length = 3 and Text[2] = 'B'",10
            .db "mutate(Origin)",10
            .db "if Origin.left = 9 and target.left = 7",10
            .db "target = returnOrigin()",10
            .db "if target.left = 9",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10,"end",10,"end",10,"end",10
Stage7AggregateConstantSourceEnd:

Stage7ReadOnlyWholeAssignmentSource:
            .db "record Pair",10,"value as u8",10,"end",10
            .db "const Origin as Pair = (1)",10
            .db "var target as Pair",10,"sub main()",10
Stage7ReadOnlyWholeAssignmentPoint:
            .db "Origin = target",10,"end",10
Stage7ReadOnlyWholeAssignmentSourceEnd:

Stage7ReadOnlyFieldAssignmentSource:
            .db "record Pair",10,"value as u8",10,"end",10
            .db "const Origin as Pair = (1)",10,"sub main()",10
Stage7ReadOnlyFieldAssignmentPoint:
            .db "Origin.value = 2",10,"end",10
Stage7ReadOnlyFieldAssignmentSourceEnd:

Stage7ReadOnlyArrayAssignmentSource:
            .db "const Values as u8[2] = [1, 2]",10,"sub main()",10
Stage7ReadOnlyArrayAssignmentPoint:
            .db "Values[0] = 2",10,"end",10
Stage7ReadOnlyArrayAssignmentSourceEnd:

Stage7ReadOnlyStringAssignmentSource:
            .db "const Text as string[2] = \"AB\"",10,"sub main()",10
Stage7ReadOnlyStringAssignmentPoint:
            .db "Text[0] = 'C'",10,"end",10
Stage7ReadOnlyStringAssignmentSourceEnd:

Stage7AggregateConstantIncompleteSource:
            .db "record Pair",10,"left as u8",10,"right as u8",10,"end",10
            .db "const Bad as Pair = (1"
Stage7AggregateConstantIncompletePoint:
            .db ")",10,"sub main()",10,"end",10
Stage7AggregateConstantIncompleteSourceEnd:

Stage7AggregateConstantWrongTypeSource:
            .db "const Bad as u8[1] = [true"
Stage7AggregateConstantWrongTypePoint:
            .db "]",10,"sub main()",10,"end",10
Stage7AggregateConstantWrongTypeSourceEnd:

Stage7AggregateConstantRuntimeSource:
            .db "const Bad as u8[1] = [readInputByte()"
Stage7AggregateConstantRuntimePoint:
            .db "]",10,"sub main()",10,"end",10
Stage7AggregateConstantRuntimeSourceEnd:

Stage7AggregateConstantScalarTypeSource:
            .db "const Bad as u8 "
Stage7AggregateConstantScalarTypePoint:
            .db "= [1]",10,"sub main()",10,"end",10
Stage7AggregateConstantScalarTypeSourceEnd:

Stage7ReadOnlyCapacityAcceptedSource:
            .db "const a as string[253] = \"\"",10
            .db "const b as string[253] = \"\"",10
            .db "const c as string[253] = \"\"",10
            .db "const d as string[253] = \"\"",10
            .db "const tail as u8[4] = [0,0,0,0]",10
            .db "sub main()",10,"end",10
Stage7ReadOnlyCapacityAcceptedSourceEnd:

Stage7ReadOnlyCapacityRejectedSource:
            .db "const a as string[253] = \"\"",10
            .db "const b as string[253] = \"\"",10
            .db "const c as string[253] = \"\"",10
            .db "const d as string[253] = \"\"",10
            .db "const tail as u8[4] = [0,0,0,0]",10
            .db "const "
Stage7ReadOnlyCapacityRejectedPoint:
            .db "extra as u8[1] = [0]",10
Stage7ReadOnlyCapacityRejectedSourceEnd:

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "proof-z80-runtime.asm"
RuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   A,160
            LD   HL,Stage7CopySource
            LD   DE,Stage7CopySourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   (ProofCopyGeneratedSize),HL
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailRun
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailOutput
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailOutput
            LD   A,(ProgramDataBase)
            CP   1
            JP   NZ,ProofFailStorage
            LD   A,(ProgramBssBase)
            CP   2
            JP   NZ,ProofFailStorage
            LD   A,160
            LD   HL,Stage7ForwardSource
            LD   DE,Stage7ForwardSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailForwardCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailForwardEncode
            LD   HL,(GeneratedSize)
            LD   (ProofForwardGeneratedSize),HL
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailForwardFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailForwardRun
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailForwardOutput
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailForwardOutput
            LD   A,(ProgramDataBase)
            CP   3
            JP   NZ,ProofFailForwardStorage
            LD   A,(ProgramDataBase+1)
            CP   9
            JP   NZ,ProofFailForwardStorage
            LD   A,160
            LD   HL,Stage7StringSource
            LD   DE,Stage7StringSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailStringCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailStringEncode
            LD   HL,(GeneratedSize)
            LD   (ProofStringGeneratedSize),HL
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailStringFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailStringRun
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailStringOutput
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailStringOutput
            LD   A,(ProgramDataBase)
            CP   3
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+1)
            CP   'A'
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+2)
            CP   'Y'
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+3)
            CP   'C'
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+4)    ; sealed byte at capacity+1
            OR   A
            JP   NZ,ProofFailStringStorage
            LD   A,161
            LD   HL,Stage7CorruptStringSource
            LD   DE,Stage7CorruptStringSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailBoundsCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailBoundsEncode
            LD   A,$FF                    ; L=255 remains invalid
            LD   (GeneratedRoDataBase),A
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailBoundsFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailBoundsRun
            LD   A,(TrapNumber)
            CP   1
            JP   NZ,ProofFailBoundsRun
            LD   HL,(TrapOffset)
            LD   DE,S7CSLOF
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBoundsRun
            LD   A,163
            LD   HL,Stage7CorruptStringIndexSource
            LD   DE,Stage7CorruptStringIndexSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailBoundsCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailBoundsEncode
            LD   A,$FF                    ; indexing rejects the same corruption
            LD   (GeneratedRoDataBase),A
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailBoundsFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailBoundsRun
            LD   A,(TrapNumber)
            CP   1
            JP   NZ,ProofFailBoundsRun
            LD   HL,(TrapOffset)
            LD   DE,S7CSIOF
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBoundsRun
            LD   A,162
            LD   HL,Stage7SealedArraySource
            LD   DE,Stage7SealedArraySourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailStringCompile
            LD   HL,(ProgramBssLength)
            LD   DE,1020
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringStorage
            CALL EncodeAggregateProgram
            JP   C,ProofFailStringEncode
            LD   A,(ProgramBssBase+1019)  ; terminator in final 255-byte element
            OR   A
            JP   NZ,ProofFailStringStorage
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailStringFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailStringRun
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailStringOutput
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailStringOutput
            LD   A,166
            LD   HL,Stage7LargeDataSource
            LD   DE,Stage7LargeDataSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailStringCompile
            LD   HL,(StaticImageLength)
            LD   DE,510
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringStorage
            CALL EncodeAggregateProgram
            JP   C,ProofFailStringEncode
            LD   HL,(GeneratedRoDataSize)
            LD   DE,510
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringStorage
            LD   HL,(GeneratedDataSize)
            LD   DE,510
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringStorage
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailStringFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailStringRun
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailStringOutput
            LD   A,(ProgramDataBase)
            CP   1
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+255)
            CP   1
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+256)
            CP   'B'
            JP   NZ,ProofFailStringStorage
            LD   A,(ProgramDataBase+509)
            OR   A
            JP   NZ,ProofFailStringStorage

            ; Four complete sealed strings plus a four-byte tail exactly fill
            ; the initialized-data and rodata regions. Startup must copy all
            ; 1024 bytes without changing the first byte beyond the region.
            LD   A,167
            LD   HL,Stage7DataCapacityAcceptedSource
            LD   DE,Stage7DataCapacityAcceptedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailDataCapacityAccepted
            LD   HL,(StaticImageLength)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDataCapacityAccepted
            CALL EncodeAggregateProgram
            JP   C,ProofFailDataCapacityAccepted
            LD   HL,(GeneratedRoDataSize)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDataCapacityAccepted
            LD   HL,(GeneratedDataSize)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDataCapacityAccepted
            LD   A,$A5
            LD   (ProgramDataLimit),A
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailDataCapacityAccepted
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailDataCapacityAccepted
            LD   A,(ProgramDataBase)
            OR   A
            JP   NZ,ProofFailDataCapacityAccepted
            LD   A,(ProgramDataLimit-1)
            OR   A
            JP   NZ,ProofFailDataCapacityAccepted
            LD   A,(ProgramDataLimit)
            CP   $A5
            JP   NZ,ProofFailDataCapacityAccepted

            LD   A,168
            LD   HL,Stage7DataCapacityRejectedSource
            LD   DE,Stage7DataCapacityRejectedSourceEnd
            LD   A,DiagnosticProgramDataCapacity
            LD   BC,Stage7DataCapacityRejectedPoint-Stage7DataCapacityRejectedSource
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailDataCapacityRejected
            LD   A,169
            LD   HL,Stage7DataCapacityAcceptedSource
            LD   DE,Stage7DataCapacityAcceptedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailDataCapacityRejected

            ; The same exact-fill and first-rejection boundary applies
            ; independently to default-initialized BSS storage.
            LD   A,170
            LD   HL,Stage7BssCapacityAcceptedSource
            LD   DE,Stage7BssCapacityAcceptedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailBssCapacityAccepted
            LD   HL,(ProgramBssLength)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBssCapacityAccepted
            CALL EncodeAggregateProgram
            JP   C,ProofFailBssCapacityAccepted
            LD   HL,(GeneratedBssSize)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBssCapacityAccepted
            LD   A,$A5
            LD   (ProgramBssLimit),A
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailBssCapacityAccepted
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailBssCapacityAccepted
            LD   A,(ProgramBssBase)
            OR   A
            JP   NZ,ProofFailBssCapacityAccepted
            LD   A,(ProgramBssLimit-1)
            CP   'Y'
            JP   NZ,ProofFailBssCapacityAccepted
            LD   A,(ProgramBssLimit)
            CP   $A5
            JP   NZ,ProofFailBssCapacityAccepted

            LD   A,171
            LD   HL,Stage7BssCapacityRejectedSource
            LD   DE,Stage7BssCapacityRejectedSourceEnd
            LD   A,DiagnosticProgramDataCapacity
            LD   BC,Stage7BssCapacityRejectedPoint-Stage7BssCapacityRejectedSource
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailBssCapacityRejected
            LD   A,172
            LD   HL,Stage7BssCapacityAcceptedSource
            LD   DE,Stage7BssCapacityAcceptedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailBssCapacityRejected

            ; One record may exceed 255 bytes. Its word field offset, array
            ; length, 501-byte outer-array stride, nested element address and
            ; complete 501-byte copy must all survive. The array occupies 1002
            ; BSS bytes.
            LD   A,173
            LD   HL,Stage7WideAggregateSource
            LD   DE,Stage7WideAggregateSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailWideAggregate
            LD   HL,(ProgramBssLength)
            LD   DE,1002
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailWideAggregate
            CALL EncodeAggregateProgram
            JP   C,ProofFailWideAggregate
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailWideAggregate
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailWideAggregate
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailWideAggregate
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailWideAggregate
            LD   A,(ProgramBssBase+499)
            CP   'Y'
            JP   NZ,ProofFailWideAggregate
            LD   A,(ProgramBssBase+1000)
            CP   'Y'
            JP   NZ,ProofFailWideAggregate

            ; Growing an already-1024-byte field by one byte is rejected at
            ; the final field declaration rather than wrapping its extent.
            LD   A,174
            LD   HL,Stage7WideRecordRejectedSource
            LD   DE,Stage7WideRecordRejectedSourceEnd
            LD   A,DiagnosticProgramDataCapacity
            LD   BC,Stage7WideRecordRejectedPoint-Stage7WideRecordRejectedSource
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailWideRecordCapacity

            ; Explicit initialization also crosses the old byte ceiling. The
            ; 256th source element must be retained and copied into RAM.
            LD   A,175
            LD   HL,Stage7WideInitializedSource
            LD   DE,Stage7WideInitializedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailWideInitializer
            LD   HL,(StaticImageLength)
            LD   DE,256
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailWideInitializer
            LD   A,(StaticImageBase)
            CP   1
            JP   NZ,ProofFailWideInitializer
            LD   A,(StaticImageBase+255)
            CP   1
            JP   NZ,ProofFailWideInitializer
            CALL EncodeAggregateProgram
            JP   C,ProofFailWideInitializer
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailWideInitializer
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailWideInitializer
            LD   A,(ProgramDataBase)
            CP   1
            JP   NZ,ProofFailWideInitializer
            LD   A,(ProgramDataBase+255)
            CP   1
            JP   NZ,ProofFailWideInitializer

            LD   A,176
            LD   HL,Stage7WordLengthInterningSource
            LD   DE,Stage7WordLengthInterningSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailWordLengthInterning
            LD   A,(AggregateTypeCount)
            CP   2
            JP   NZ,ProofFailWordLengthInterning

            LD   A,'4'
            LD   (Stage7SealedArrayCapacityDigit),A
            LD   A,164
            LD   HL,Stage7SealedArraySource
            LD   DE,Stage7SealedArraySourceEnd
            CALL CompileAggregateCallSlice
            JP   NC,ProofFailStringCapacity
            LD   A,(DiagnosticCode)
            CP   DiagnosticStringCapacity
            JP   NZ,ProofFailStringCapacity
            LD   HL,(DiagnosticOffset)
            LD   DE,S7SACP
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringCapacity
            LD   A,'5'
            LD   (Stage7SealedArrayCapacityDigit),A
            LD   A,165
            LD   HL,Stage7SealedArraySource
            LD   DE,Stage7SealedArraySourceEnd
            CALL CompileAggregateCallSlice
            JP   NC,ProofFailStringCapacity
            LD   A,(DiagnosticCode)
            CP   DiagnosticStringCapacity
            JP   NZ,ProofFailStringCapacity
            LD   HL,(DiagnosticOffset)
            LD   DE,S7SACP
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringCapacity
            LD   A,160
            LD   HL,Stage7BoundsSource
            LD   DE,Stage7BoundsSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailBoundsCompile
            CALL EncodeAggregateProgram
            JP   C,ProofFailBoundsEncode
            LD   HL,(GeneratedSize)
            LD   (ProofBoundsGeneratedSize),HL
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailBoundsFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailBoundsRun
            LD   A,(TrapNumber)
            CP   1
            JP   NZ,ProofFailBoundsRun
            LD   HL,(TrapOffset)
            LD   DE,134
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBoundsRun
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailBoundsRun
            LD   A,(ProgramDataBase)
            CP   3
            JP   NZ,ProofFailBoundsStorage
            LD   A,(ProgramDataBase+1)
            CP   7
            JP   NZ,ProofFailBoundsStorage
            LD   A,DiagnosticIntegerRange
            LD   BC,86
            LD   HL,Stage7ConstantBoundsSource
            LD   DE,Stage7ConstantBoundsSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailConstantBounds
            LD   A,DiagnosticTypeMismatch
            LD   BC,116
            LD   HL,Stage7NominalMismatchSource
            LD   DE,Stage7NominalMismatchSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailNominalMismatch
            LD   A,DiagnosticTypeMismatch
            LD   BC,200
            LD   HL,Stage7TransientMisuseSource
            LD   DE,Stage7TransientMisuseSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailTransientMisuse
            LD   A,DiagnosticRoutineCapacity
            LD   BC,52
            LD   HL,Stage7RoutineCapacitySource
            LD   DE,Stage7RoutineCapacitySourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailRoutineCapacity
            LD   A,DiagnosticParameterCapacity
            LD   BC,Stage7ParameterCapacityPoint-Stage7ParameterCapacitySource
            LD   HL,Stage7ParameterCapacitySource
            LD   DE,Stage7ParameterCapacitySourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailParameterCapacity
            LD   A,DiagnosticExpressionCapacity
            LD   BC,118
            LD   HL,Stage7CallDepthSource
            LD   DE,Stage7CallDepthSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailCallDepth
            LD   A,DiagnosticDuplicateName
            LD   BC,11
            LD   HL,Stage7ParameterRoutineCollisionSource
            LD   DE,Stage7ParameterRoutineCollisionSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailParameterRoutineCollision
            LD   A,DiagnosticTypeMismatch
            LD   BC,46
            LD   HL,Stage7StringLengthWriteSource
            LD   DE,Stage7StringLengthWriteSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailStringLengthWrite
            LD   A,DiagnosticDuplicateName
            LD   BC,6
            LD   HL,Stage7MainParameterSource
            LD   DE,Stage7MainParameterSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailMainParameter
            LD   A,DiagnosticExpectedRight
            LD   BC,9
            LD   HL,Stage7MainParameterSyntaxSource
            LD   DE,Stage7MainParameterSyntaxSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailMainParameterSyntax
            LD   A,DiagnosticExpectedLine
            LD   BC,11
            LD   HL,Stage7MainResultSource
            LD   DE,Stage7MainResultSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailMainResult
            LD   A,160
            LD   HL,Stage7RoutineFailsSource
            LD   DE,Stage7RoutineFailsSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailRoutineFails
            LD   A,DiagnosticExpectedTopLevel
            LD   BC,12
            LD   HL,Stage7MissingMainSource
            LD   DE,Stage7MissingMainSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailMissingMain
            LD   A,DiagnosticExpectedEof
            LD   BC,15
            LD   HL,Stage7AfterMainSource
            LD   DE,Stage7AfterMainSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAfterMain
            LD   A,DiagnosticDuplicateName
            LD   BC,4
            LD   HL,Stage7ServiceRoutineSource
            LD   DE,Stage7ServiceRoutineSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailServiceRoutine
            LD   A,DiagnosticDuplicateName
            LD   BC,6
            LD   HL,Stage7ServiceParameterSource
            LD   DE,Stage7ServiceParameterSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailServiceParameter
            LD   A,DiagnosticDuplicateName
            LD   BC,4
            LD   HL,Stage7ServiceVariableSource
            LD   DE,Stage7ServiceVariableSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailServiceVariable
            LD   A,DiagnosticTypeMismatch
            LD   BC,245
            LD   HL,Stage7ScalarSuffixPoisonSource
            LD   DE,Stage7ScalarSuffixPoisonSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailScalarSuffix
            LD   A,DiagnosticTypeMismatch
            LD   BC,66
            LD   HL,Stage7RecordIndexSource
            LD   DE,Stage7RecordIndexSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailRecordIndex
            LD   HL,Stage7ShortCircuitSource
            LD   DE,Stage7ShortCircuitSourceEnd
            CALL ProofCompileAndRunSuccess
            JP   C,ProofFailShortCircuit
            LD   HL,Stage7StructuredRoutineSource
            LD   DE,Stage7StructuredRoutineSourceEnd
            CALL ProofCompileAndRunSuccess
            JP   C,ProofFailStructuredRoutines
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailStructuredRoutines
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailStructuredRoutines
            CALL ProofRunRecursiveCapacity
            JP   C,ProofFailRecursiveCapacity
            CALL ProofRunSuffixFailures
            JP   C,ProofFailSuffixCapacity
            LD   A,DiagnosticExpectedComma
            LD   BC,48
            LD   HL,Stage7TooFewArgumentsSource
            LD   DE,Stage7TooFewArgumentsSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailTooFewArguments
            LD   A,DiagnosticExpectedRight
            LD   BC,37
            LD   HL,Stage7TooManyArgumentsSource
            LD   DE,Stage7TooManyArgumentsSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailTooManyArguments
            LD   A,DiagnosticTypeMismatch
            LD   BC,88
            LD   HL,Stage7ScalarForAggregateSource
            LD   DE,Stage7ScalarForAggregateSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailScalarForAggregate
            LD   A,DiagnosticTypeMismatch
            LD   BC,79
            LD   HL,Stage7AggregateForScalarSource
            LD   DE,Stage7AggregateForScalarSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateForScalar
            LD   A,DiagnosticTypeMismatch
            LD   BC,60
            LD   HL,Stage7ScalarResultAggregateSource
            LD   DE,Stage7ScalarResultAggregateSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailScalarResultAggregate
            LD   A,DiagnosticTypeMismatch
            LD   BC,59
            LD   HL,Stage7AggregateResultScalarSource
            LD   DE,Stage7AggregateResultScalarSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateResultScalar

            ; Aggregate constants retain their complete initialized bytes in
            ; the rodata suffix. A later data declaration shifts that suffix,
            ; direct reads/copies remain valid, and passing the alias to a
            ; writable parameter deliberately permits target mutation.
            LD   HL,Stage7AggregateConstantSource
            LD   DE,Stage7AggregateConstantSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailAggregateConstant
            LD   HL,(StaticImageLength)
            LD   DE,3
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAggregateConstant
            LD   HL,(ReadOnlyImageLength)
            LD   DE,11
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAggregateConstant
            LD   A,(StaticImageBase)
            CP   1
            JP   NZ,ProofFailAggregateConstant
            LD   A,(StaticImageBase+3)
            CP   7
            JP   NZ,ProofFailAggregateConstant
            LD   A,(StaticImageBase+7)
            CP   2
            JP   NZ,ProofFailAggregateConstant
            LD   A,(StaticImageBase+9)
            CP   3
            JP   NZ,ProofFailAggregateConstant
            LD   A,(StaticImageBase+11)
            OR   A
            JP   NZ,ProofFailAggregateConstant
            CALL EncodeAggregateProgram
            JP   C,ProofFailAggregateConstant
            LD   HL,(GeneratedRoDataSize)
            LD   DE,14
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAggregateConstant
            LD   HL,(GeneratedDataSize)
            LD   DE,3
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAggregateConstant
            LD   A,$A5
            LD   (ProgramDataBase+3),A
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailAggregateConstant
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailAggregateConstant
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailAggregateConstant
            LD   A,(ServiceOutputBase)
            CP   'Y'
            JP   NZ,ProofFailAggregateConstant
            LD   A,(ProgramDataBase)
            CP   9
            JP   NZ,ProofFailAggregateConstant
            LD   A,(ProgramDataBase+3)
            CP   $A5
            JP   NZ,ProofFailAggregateConstant
            LD   A,(GeneratedRoDataBase+3)
            CP   9
            JP   NZ,ProofFailAggregateConstant

            LD   A,DiagnosticReadOnlyAssignment
            LD   BC,Stage7ReadOnlyWholeAssignmentPoint-Stage7ReadOnlyWholeAssignmentSource
            LD   HL,Stage7ReadOnlyWholeAssignmentSource
            LD   DE,Stage7ReadOnlyWholeAssignmentSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailReadOnlyAssignment
            LD   A,DiagnosticReadOnlyAssignment
            LD   BC,Stage7ReadOnlyFieldAssignmentPoint-Stage7ReadOnlyFieldAssignmentSource
            LD   HL,Stage7ReadOnlyFieldAssignmentSource
            LD   DE,Stage7ReadOnlyFieldAssignmentSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailReadOnlyAssignment
            LD   A,DiagnosticReadOnlyAssignment
            LD   BC,Stage7ReadOnlyArrayAssignmentPoint-Stage7ReadOnlyArrayAssignmentSource
            LD   HL,Stage7ReadOnlyArrayAssignmentSource
            LD   DE,Stage7ReadOnlyArrayAssignmentSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailReadOnlyAssignment
            LD   A,DiagnosticReadOnlyAssignment
            LD   BC,Stage7ReadOnlyStringAssignmentPoint-Stage7ReadOnlyStringAssignmentSource
            LD   HL,Stage7ReadOnlyStringAssignmentSource
            LD   DE,Stage7ReadOnlyStringAssignmentSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailReadOnlyAssignment

            LD   A,DiagnosticInitializerCount
            LD   BC,Stage7AggregateConstantIncompletePoint-Stage7AggregateConstantIncompleteSource
            LD   HL,Stage7AggregateConstantIncompleteSource
            LD   DE,Stage7AggregateConstantIncompleteSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateConstantInitializer
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage7AggregateConstantWrongTypePoint-Stage7AggregateConstantWrongTypeSource
            LD   HL,Stage7AggregateConstantWrongTypeSource
            LD   DE,Stage7AggregateConstantWrongTypeSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateConstantWrongType
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage7AggregateConstantRuntimePoint-Stage7AggregateConstantRuntimeSource
            LD   HL,Stage7AggregateConstantRuntimeSource
            LD   DE,Stage7AggregateConstantRuntimeSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateConstantRuntime
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage7AggregateConstantScalarTypePoint-Stage7AggregateConstantScalarTypeSource
            LD   HL,Stage7AggregateConstantScalarTypeSource
            LD   DE,Stage7AggregateConstantScalarTypeSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailAggregateConstantScalarType

            LD   HL,Stage7ReadOnlyCapacityAcceptedSource
            LD   DE,Stage7ReadOnlyCapacityAcceptedSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailReadOnlyCapacity
            LD   HL,(ReadOnlyImageLength)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailReadOnlyCapacity
            CALL EncodeAggregateProgram
            JP   C,ProofFailReadOnlyCapacity
            LD   HL,(GeneratedRoDataSize)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailReadOnlyCapacity
            LD   HL,(GeneratedDataSize)
            LD   A,H
            OR   L
            JP   NZ,ProofFailReadOnlyCapacity
            LD   A,$A5
            LD   (GeneratedRoDataBase),A
            LD   A,$5A
            LD   (GeneratedRoDataBase+1023),A
            LD   A,DiagnosticReadOnlyCapacity
            LD   BC,Stage7ReadOnlyCapacityRejectedPoint-Stage7ReadOnlyCapacityRejectedSource
            LD   HL,Stage7ReadOnlyCapacityRejectedSource
            LD   DE,Stage7ReadOnlyCapacityRejectedSourceEnd
            CALL ProofExpectCompileDiagnostic
            JP   C,ProofFailReadOnlyCapacity
            LD   HL,(GeneratedRoDataSize)
            LD   DE,1024
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailReadOnlyCapacity
            LD   A,(GeneratedRoDataBase)
            CP   $A5
            JP   NZ,ProofFailReadOnlyCapacity
            LD   A,(GeneratedRoDataBase+1023)
            CP   $5A
            JP   NZ,ProofFailReadOnlyCapacity
            ; The failed declaration must not poison the next compilation.
            LD   HL,Stage7AggregateConstantSource
            LD   DE,Stage7AggregateConstantSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofFailReadOnlyCapacity
            LD   B,0
            LD   C,2
            CALL ProofRunInvalidCopy
            JP   C,ProofFailInvalidCopySource
            LD   B,2
            LD   C,0
            CALL ProofRunInvalidCopy
            JP   C,ProofFailInvalidCopyDestination
            CALL ProofCheckEncodeRollback
            JP   C,ProofFailEncodeRollback
            CALL ProofCheckSegmentOverlap
            JP   C,ProofFailSegmentOverlap
            LD   A,$A5
            LD   (ProofStatus),A
            HALT

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofCallGenerated:
            LD   HL,0
            ADD  HL,SP
            LD   (ProofExpectedSP),HL
            LD   IX,$A55A
            CALL GeneratedBase
            PUSH IX
            POP  DE
            LD   HL,$A55A
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCallGeneratedNo
            LD   HL,0
            ADD  HL,SP
            LD   DE,(ProofExpectedSP)
            OR   A
            SBC  HL,DE
            RET  Z
ProofCallGeneratedNo:
            SCF
            RET

; Require one exact compile-time diagnostic and source offset. A is the
; diagnostic, BC the offset, and HL..DE the complete source range.
.routine in A,BC,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectCompileDiagnostic:
            LD   (ProofExpectedDiagnostic),A
            LD   (ProofExpectedOffset),BC
            LD   A,160
            CALL CompileAggregateCallSlice
            JR   NC,ProofExpectedDiagnosticFailure
            LD   A,(ProofExpectedDiagnostic)
            LD   HL,DiagnosticCode
            CP   (HL)
            JR   NZ,ProofExpectedDiagnosticFailure
            LD   HL,(DiagnosticOffset)
            LD   DE,(ProofExpectedOffset)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofExpectedDiagnosticFailure
            XOR  A
            RET
ProofExpectedDiagnosticFailure:
            SCF
            RET

; Compile, encode, and execute one source that must return normally without a
; generated trap. HL..DE is its complete source range.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofCompileAndRunSuccess:
            LD   A,160
            CALL CompileAggregateCallSlice
            RET  C
            CALL EncodeAggregateProgram
            RET  C
            CALL Reset
            CALL ProofCallGenerated
            RET  C
            LD   A,(RunState)
            CP   RunSucceeded
            RET  Z
            SCF
            RET

; The ninth active generated call must trap before entering the final body.
; Root unwinding restores SP/IX, clears activation depth, and leaves marker 0.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofRunRecursiveCapacity:
            LD   A,160
            LD   HL,Stage7RecursiveCapacitySource
            LD   DE,Stage7RecursiveCapacitySourceEnd
            CALL CompileAggregateCallSlice
            RET  C
            CALL EncodeAggregateProgram
            RET  C
            CALL Reset
            CALL ProofCallGenerated
            RET  C
            LD   A,(RunState)
            CP   RunTrapped
            JR   NZ,ProofRecursiveCapacityFailure
            LD   A,(TrapNumber)
            CP   5
            JR   NZ,ProofRecursiveCapacityFailure
            LD   HL,(TrapOffset)
            LD   DE,71
            OR   A
            SBC  HL,DE
            JR   NZ,ProofRecursiveCapacityFailure
            LD   A,(ActivationDepth)
            OR   A
            JR   NZ,ProofRecursiveCapacityFailure
            LD   A,(ProgramBssBase)
            OR   A
            RET  Z
ProofRecursiveCapacityFailure:
            SCF
            RET

; Exercise every saved-type unwind phase in the aggregate suffix parser. The
; field and index cases fail on late operands; length fails on its first byte.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofRunSuffixFailures:
            LD   A,170
            LD   HL,Stage7SuffixLengthSource
            LD   DE,Stage7SuffixLengthSourceEnd
            CALL ProofPrepareSuffix
            LD   A,AggregateTypeKindString
            LD   (AggregateTypeTableBase),A
            LD   A,3
            LD   (AggregateTypeTableBase+1),A
            LD   HL,SemanticBufferLimit
            LD   (SinkCursor),HL
            LD   A,AggregateFirstDynamicTypeId
            CALL ProofExpectSuffixCapacity
            RET  C

            LD   A,171
            LD   HL,Stage7SuffixFieldSource
            LD   DE,Stage7SuffixFieldSourceEnd
            CALL ProofPrepareSuffix
            LD   A,AggregateTypeKindRecord
            LD   (AggregateTypeTableBase),A
            XOR  A
            LD   (AggregateTypeTableBase+1),A
            LD   (AggregateRecordTableBase),A
            INC  A
            LD   (AggregateRecordTableBase+1),A
            LD   HL,Stage7SuffixFieldSource+1
            LD   (AggregateFieldTableBase),HL
            LD   A,5
            LD   (AggregateFieldTableBase+2),A
            LD   A,ScalarTypeU8
            LD   (AggregateFieldTableBase+3),A
            XOR  A
            LD   (AggregateFieldTableBase+4),A
            LD   HL,SemanticBufferLimit-1
            LD   (SinkCursor),HL
            LD   A,AggregateFirstDynamicTypeId
            CALL ProofExpectSuffixCapacity
            RET  C

            LD   A,172
            LD   HL,Stage7SuffixIndexSource
            LD   DE,Stage7SuffixIndexSourceEnd
            CALL ProofPrepareSuffix
            LD   A,AggregateTypeKindArray
            LD   (AggregateTypeTableBase),A
            LD   A,ScalarTypeU8
            LD   (AggregateTypeTableBase+1),A
            LD   A,2
            LD   (AggregateTypeTableBase+2),A
            LD   (AggregateTypeExtentBase),A
            LD   HL,SemanticBufferLimit-7
            LD   (SinkCursor),HL
            LD   A,AggregateFirstDynamicTypeId
            CALL ProofExpectSuffixCapacity
            RET  C

            LD   A,173
            LD   HL,Stage7SuffixIndexSource
            LD   DE,Stage7SuffixIndexSourceEnd
            CALL ProofPrepareSuffix
            LD   A,AggregateTypeKindString
            LD   (AggregateTypeTableBase),A
            LD   A,3
            LD   (AggregateTypeTableBase+1),A
            LD   (AggregateTypeTableBase+2),A
            INC  A
            LD   (AggregateTypeExtentBase),A
            LD   HL,SemanticBufferLimit-6
            LD   (SinkCursor),HL
            LD   A,AggregateFirstDynamicTypeId
            CALL ProofExpectSuffixCapacity
            RET  C

            LD   A,174
            LD   HL,Stage7SuffixIndexSource
            LD   DE,Stage7SuffixIndexSourceEnd
            CALL ProofPrepareSuffix
            LD   A,AggregateTypeKindRecord
            LD   (AggregateTypeTableBase),A
            LD   A,AggregateFirstDynamicTypeId
            CALL ProofExpectSuffixTypeFailure
            RET

.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofPrepareSuffix:
            CALL CompileSliceInitialize
            LD   A,1
            LD   (ExpressionEmitEnabled),A
            LD   A,ScalarTypeU16
            LD   (ExpressionExpectedType),A
            XOR  A
            LD   (ExpressionSuppressFault),A
            LD   (ExpressionStackDepth),A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectSuffixCapacity:
            LD   (Stage7PathType),A
            LD   HL,0
            ADD  HL,SP
            LD   (ProofExpectedSP),HL
            LD   A,(Stage7PathType)
            CALL Stage7ParsePathSuffix
            JR   NC,ProofSuffixFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticSinkCapacity
            JR   NZ,ProofSuffixFailure
            JP   ProofCheckCurrentSP

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectSuffixTypeFailure:
            LD   (Stage7PathType),A
            LD   HL,0
            ADD  HL,SP
            LD   (ProofExpectedSP),HL
            LD   A,(Stage7PathType)
            CALL Stage7ParsePathSuffix
            JR   NC,ProofSuffixFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTypeMismatch
            JR   NZ,ProofSuffixFailure
ProofCheckCurrentSP:
            LD   HL,0
            ADD  HL,SP
            LD   DE,(ProofExpectedSP)
            OR   A
            SBC  HL,DE
            RET  Z
ProofSuffixFailure:
            SCF
            RET

; Build one structurally valid Z80 stream with an intentionally invalid
; opaque carrier. Zero selects the prepared data object; nonzero selects the
; first address beyond the complete program-data region. The
; complete data bytes must survive either region-check trap unchanged.
.routine in B,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
ProofRunInvalidCopy:
            LD   A,2
            LD   (StaticImageLength),A
            LD   A,$11
            LD   (StaticImageBase),A
            LD   A,$22
            LD   (StaticImageBase+1),A
            LD   HL,SemanticBufferBase
            LD   (HL),5
            INC  HL
            LD   (HL),SemanticBeginMain
            INC  HL
            LD   (HL),SemanticLoadProgramAlias
            INC  HL
            LD   DE,ProgramDataBase
            LD   A,B
            OR   A
            JR   Z,ProofInvalidCopyDestinationReady
            LD   DE,ProgramDataRegionLimit
ProofInvalidCopyDestinationReady:
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),SemanticLoadProgramAlias
            INC  HL
            LD   DE,ProgramDataBase
            LD   A,C
            OR   A
            JR   Z,ProofInvalidCopySourceReady
            LD   DE,ProgramDataRegionLimit
ProofInvalidCopySourceReady:
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),SemanticCopyAggregate
            INC  HL
            LD   (HL),1
            INC  HL
            LD   (HL),0
            INC  HL
            LD   (HL),$34
            INC  HL
            LD   (HL),$12
            INC  HL
            LD   (HL),SemanticEndMain
            CALL EncodeAggregateProgram
            JR   C,ProofInvalidCopyFailure
            CALL Reset
            CALL ProofCallGenerated
            JR   C,ProofInvalidCopyFailure
            LD   A,(RunState)
            CP   RunTrapped
            JR   NZ,ProofInvalidCopyFailure
            LD   A,(TrapNumber)
            CP   1
            JR   NZ,ProofInvalidCopyFailure
            LD   HL,(TrapOffset)
            LD   DE,$1234
            OR   A
            SBC  HL,DE
            JR   NZ,ProofInvalidCopyFailure
            LD   A,(ProgramDataBase)
            CP   $11
            JR   NZ,ProofInvalidCopyFailure
            LD   A,(ProgramDataBase+1)
            CP   $22
            JR   NZ,ProofInvalidCopyFailure
            OR   A
            RET
ProofInvalidCopyFailure:
            SCF
            RET

; Force failure after the staged image has diverged from the publication, then
; compare every formerly published byte with the transaction backup.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
ProofCheckEncodeRollback:
            LD   HL,(GeneratedSize)
            LD   (ProofExpectedOffset),HL
            LD   HL,(GeneratedRoDataSize)
            LD   (ProofExpectedRoDataSize),HL
            LD   A,$99
            LD   (StaticImageBase),A
            LD   A,1
            LD   (StaticImageLength),A
            LD   HL,SemanticBufferBase
            LD   (HL),2
            INC  HL
            LD   (HL),SemanticBeginMain
            INC  HL
            LD   (HL),SemanticEndMain
            LD   HL,GeneratedBase+4
            CALL EncodeAggregateProgramWithinLimit
            JR   NC,ProofEncodeRollbackFailure
            LD   HL,(GeneratedSize)
            LD   DE,(ProofExpectedOffset)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofEncodeRollbackFailure
            LD   HL,(GeneratedRoDataSize)
            LD   DE,(ProofExpectedRoDataSize)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofEncodeRollbackFailure
            LD   BC,(GeneratedSize)
            LD   HL,GeneratedBase
            LD   DE,BackupBase
ProofEncodeRollbackCompare:
            LD   A,B
            OR   C
            JR   Z,ProofEncodeRollbackReady
            LD   A,(DE)
            CP   (HL)
            JR   NZ,ProofEncodeRollbackFailure
            INC  DE
            INC  HL
            DEC  BC
            JR   ProofEncodeRollbackCompare
ProofEncodeRollbackReady:
            LD   BC,(GeneratedRoDataSize)
            LD   HL,GeneratedRoDataBase
            LD   DE,S7BRDO
ProofEncodeRollbackRoDataCompare:
            LD   A,B
            OR   C
            JR   Z,ProofEncodeRollbackRoDataReady
            LD   A,(DE)
            CP   (HL)
            JR   NZ,ProofEncodeRollbackFailure
            INC  DE
            INC  HL
            DEC  BC
            JR   ProofEncodeRollbackRoDataCompare
ProofEncodeRollbackRoDataReady:
            LD   A,(GeneratedRoDataBase)
            CP   $11
            JR   NZ,ProofEncodeRollbackFailure
            OR   A
            RET
ProofEncodeRollbackFailure:
            SCF
            RET

; A malformed target adapter must be rejected before publication. The
; compiler then restores the complete preceding code and rodata image.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofCheckSegmentOverlap:
            LD   HL,GeneratedCodeLimit
            CALL BeginSegmentedProgram
            RET  C
            LD   HL,GeneratedCodeBase+1
            LD   (S7SREB),HL
            CALL ValidateSegmentTable
            JR   NC,ProofSegmentOverlapFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticOutputSegment
            JR   NZ,ProofSegmentOverlapFailure
            CALL AbortSegmentedProgram
            OR   A
            RET
ProofSegmentOverlapFailure:
            SCF
            RET

ProofFailCompile: LD A,(DiagnosticCode)
                  LD (ProofStatus),A
                  LD A,(DiagnosticOffset)
                  JP ProofFailed
ProofFailEncode:  LD A,2
                  JP ProofFailed
ProofFailFrame:   LD A,3
                  JP ProofFailed
ProofFailRun:     LD A,4
                  JP ProofFailed
ProofFailOutput:  LD A,5
                  JP ProofFailed
ProofFailStorage: LD A,6
                  JP ProofFailed
ProofFailForwardCompile: LD A,7
                  JP ProofFailed
ProofFailForwardEncode: LD A,8
                  JP ProofFailed
ProofFailForwardFrame: LD A,9
                  JP ProofFailed
ProofFailForwardRun: LD A,10
                  JP ProofFailed
ProofFailForwardOutput: LD A,11
                  JP ProofFailed
ProofFailForwardStorage: LD A,12
                  JP ProofFailed
ProofFailStringCompile: LD A,13
                  JP ProofFailed
ProofFailStringEncode: LD A,14
                  JP ProofFailed
ProofFailStringFrame: LD A,15
                  JP ProofFailed
ProofFailStringRun: LD A,16
                  JP ProofFailed
ProofFailStringOutput: LD A,17
                  JP ProofFailed
ProofFailStringStorage: LD A,18
                  JP ProofFailed
ProofFailBoundsCompile: LD A,19
                  JP ProofFailed
ProofFailBoundsEncode: LD A,20
                  JP ProofFailed
ProofFailBoundsFrame: LD A,21
                  JP ProofFailed
ProofFailBoundsRun: LD A,22
                  JP ProofFailed
ProofFailBoundsStorage: LD A,23
                  JP ProofFailed
ProofFailConstantBounds: LD A,24
                  JP ProofFailed
ProofFailNominalMismatch: LD A,25
                  JP ProofFailed
ProofFailTransientMisuse: LD A,26
                  JP ProofFailed
ProofFailRoutineCapacity: LD A,27
                  JP ProofFailed
ProofFailParameterCapacity: LD A,28
                  JP ProofFailed
ProofFailCallDepth: LD A,29
                  JP ProofFailed
ProofFailInvalidCopySource: LD A,30
                  JP ProofFailed
ProofFailInvalidCopyDestination: LD A,31
                  JP ProofFailed
ProofFailEncodeRollback: LD A,32
                  JP ProofFailed
ProofFailParameterRoutineCollision: LD A,33
                  JP ProofFailed
ProofFailStringLengthWrite: LD A,34
                           JP ProofFailed
ProofFailStringCapacity: LD A,40
                         JP ProofFailed
ProofFailMainParameter: LD A,35
                  JP ProofFailed
ProofFailServiceRoutine: LD A,36
                  JP ProofFailed
ProofFailServiceParameter: LD A,37
                  JP ProofFailed
ProofFailServiceVariable: LD A,38
                  JP ProofFailed
ProofFailScalarSuffix: LD A,39
                  JP ProofFailed
ProofFailRecordIndex: LD A,40
                  JP ProofFailed
ProofFailShortCircuit: LD A,41
                  JP ProofFailed
ProofFailStructuredRoutines: LD A,42
                  JP ProofFailed
ProofFailRecursiveCapacity: LD A,43
                  JP ProofFailed
ProofFailSuffixCapacity: LD A,44
                  JP ProofFailed
ProofFailTooFewArguments: LD A,45
                  JP ProofFailed
ProofFailTooManyArguments: LD A,46
                  JP ProofFailed
ProofFailScalarForAggregate: LD A,47
                  JP ProofFailed
ProofFailAggregateForScalar: LD A,48
                  JP ProofFailed
ProofFailScalarResultAggregate: LD A,49
                  JP ProofFailed
ProofFailAggregateResultScalar: LD A,50
                  JP ProofFailed
ProofFailMainParameterSyntax: LD A,51
                  JP ProofFailed
ProofFailMainResult: LD A,52
                  JP ProofFailed
ProofFailRoutineFails: LD A,53
                  JP ProofFailed
ProofFailMissingMain: LD A,54
                  JP ProofFailed
ProofFailAfterMain: LD A,55
                  JP ProofFailed
ProofFailSegmentOverlap: LD A,56
                  JP ProofFailed
ProofFailDataCapacityAccepted: LD A,57
                  JP ProofFailed
ProofFailDataCapacityRejected: LD A,58
                  JP ProofFailed
ProofFailBssCapacityAccepted: LD A,59
                  JP ProofFailed
ProofFailBssCapacityRejected: LD A,60
                  JP ProofFailed
ProofFailWideAggregate: LD A,61
                  JP ProofFailed
ProofFailWideRecordCapacity: LD A,62
                  JP ProofFailed
ProofFailWordLengthInterning: LD A,64
                  JR ProofFailed
ProofFailWideInitializer: LD A,63
                  JP ProofFailed
ProofFailAggregateConstant: LD A,65
                  JP ProofFailed
ProofFailReadOnlyAssignment: LD A,66
                  JP ProofFailed
ProofFailAggregateConstantInitializer: LD A,67
                  JP ProofFailed
ProofFailReadOnlyCapacity: LD A,68
                  JP ProofFailed
ProofFailAggregateConstantWrongType: LD A,69
                  JP ProofFailed
ProofFailAggregateConstantRuntime: LD A,70
                  JP ProofFailed
ProofFailAggregateConstantScalarType: LD A,71
ProofFailed:
            LD   (ProofCase),A
            HALT

ProofExpectedSP: .dw 0
ProofExpectedOffset: .dw 0
ProofExpectedRoDataSize: .dw 0
ProofExpectedDiagnostic: .db 0
ProofCopyGeneratedSize: .dw 0
ProofForwardGeneratedSize: .dw 0
ProofStringGeneratedSize: .dw 0
ProofBoundsGeneratedSize: .dw 0
ProofStatus:     .db 0
ProofCase:       .db 0
Stage7CorruptStringSource:
            .db "var text as string[3] = \"\"",10
            .db "sub main() fails",10
            .db "if text."
Stage7CorruptStringLengthPoint:
            .db "length = 0",10
            .db "end",10
            .db "end",10
Stage7CorruptStringSourceEnd:
Stage7CorruptStringIndexSource:
            .db "var text as string[3] = \"\"",10
            .db "sub main() fails",10
            .db "if text"
Stage7CorruptStringIndexPoint:
            .db "[0] = 0",10
            .db "end",10
            .db "end",10
Stage7CorruptStringIndexSourceEnd:
Stage7SealedArraySource:
            .db "var texts as string[25"
Stage7SealedArrayCapacityDigit:
            .db "3"
Stage7SealedArrayCapacityPoint:
            .db "][4]",10
            .db "sub main() fails",10
            .db "texts[3] = texts[3]",10
            .db "if texts[3].length = 0",10
            .db "writeOutputByte('Y') else fail",10
            .db "end",10,"end",10
Stage7SealedArraySourceEnd:
ProofEnd:
