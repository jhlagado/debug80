; Prove failable signatures and explicit failure on the packed LL(1) path.

            .include "memory-map.asmi"
            .include "proof-segmented-state.asmi"
            .include "loop-compiler-state.asmi"
            .include "aggregate-call-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 0
AggregateCallSlices  .equ 1
Stage7LL1            .equ 1
TargetStreamingOutput .equ 0
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
LegacyEncoders .equ 0
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
Stage8MainFailSource:
            .db "sub helper() as u8",10
            .db "return 7",10
            .db "end",10
            .db "sub main() fails",10
Stage8MainFailPoint:
            .db "fail helper()",10
            .db "end",10
Stage8MainFailSourceEnd:

Stage8InfallibleFailSource:
            .db "sub main()",10
Stage8InfallibleFailPoint:
            .db "fail 7",10
            .db "end",10
Stage8InfallibleFailSourceEnd:

Stage8FailureRangeSource:
            .db "sub main() fails",10
Stage8FailureRangePoint:
            .db "fail 300",10
            .db "end",10
Stage8FailureRangeSourceEnd:

Stage8FailureFlowSource:
            .db "sub helper() as u8 fails",10
            .db "end",10
Stage8FailureFlowPoint:
            .db "sub main()",10
            .db "end",10
Stage8FailureFlowSourceEnd:

Stage8PropagationSuccessSource:
            .db "sub pass(input as u8) as u8 fails",10
            .db "return input",10
            .db "end",10
            .db "sub relay(value as u8) as u8 fails",10
            .db "var out as u8 = pass(value) else fail",10
            .db "return out",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8 = relay('A') else fail",10
            .db "writeOutputByte(out) else fail",10
            .db "end",10
Stage8PropagationSuccessSourceEnd:

Stage8PropagationFailureSource:
            .db "sub stop(input as u8) as u8 fails",10
            .db "fail input",10
            .db "end",10
            .db "sub relay(value as u8) as u8 fails",10
            .db "var out as u8 = stop(value) else fail",10
            .db "return out",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8 = "
Stage8PropagationFailurePoint:
            .db "relay(10) else fail",10
            .db "end",10
Stage8PropagationFailureSourceEnd:

Stage8BareReturnSource:
            .db "var mark as u8",10
            .db "sub stop() fails",10
            .db "return",10
            .db "mark = 9",10
            .db "end",10
            .db "sub main() fails",10
            .db "stop() else fail",10
            .db "writeOutputByte(mark) else fail",10
            .db "end",10
Stage8BareReturnSourceEnd:

Stage8SixteenArgumentsSource:
            .db "sub pick(a as u8, b as u8, c as u8, d as u8, e as u8, f as u8, g as u8, h as u8, i as u8, j as u8, k as u8, l as u8, m as u8, n as u8, o as u8, p as u8) as u8",10
            .db "return p",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8 = pick(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)",10
            .db "writeOutputByte(out) else fail",10
            .db "end",10
Stage8SixteenArgumentsSourceEnd:

Stage8LocalHandlerSource:
            .db "const sampleFailure = 7",10
            .db "sub alwaysFails() as u8 fails",10
            .db "fail sampleFailure",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "code = alwaysFails() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "writeOutputByte(0) else fail",10
            .db "end",10
Stage8LocalHandlerSourceEnd:

; A program variable is a valid handler destination. The handler performs a
; later expression and service call so a one-byte address operand cannot pass
; by accidentally consuming the following semantic opcode.
Stage8ProgramHandlerSource:
            .db "var saved as u8",10
            .db "const sampleFailure = 7",10
            .db "sub alwaysFails() as u8 fails",10
            .db "fail sampleFailure",10
            .db "end",10
            .db "sub main() fails",10
            .db "var value as u8",10
            .db "value = alwaysFails() handle saved",10
            .db "writeOutputByte(saved + 1) else fail",10
            .db "return",10
            .db "end",10
            .db "writeOutputByte(0) else fail",10
            .db "end",10
Stage8ProgramHandlerSourceEnd:

Stage8ReadInputSuccessSource:
            .db "sub identity(value as u8) as u8",10
            .db "return value",10
            .db "end",10
            .db "sub main() fails",10
            .db "var value as u8 = readInputByte() else fail",10
Stage8ReadInputNestedServicePoint:
            .db "writeOutputByte(identity(value)) else fail",10
            .db "end",10
Stage8ReadInputSuccessSourceEnd:

Stage8ServiceFrameBoundarySource:
            .db "sub one() as u8",10
            .db "return 1",10
            .db "end",10
            .db "sub two(value as u8) as u8",10
            .db "return value",10
            .db "end",10
            .db "sub three(value as u8) as u8",10
            .db "return value",10
            .db "end",10
            .db "sub four(value as u8) as u8",10
            .db "return value",10
            .db "end",10
            .db "sub main() fails",10
            .db "writeOutputByte(four(three(two(one())))) else fail",10
            .db "end",10
Stage8ServiceFrameBoundarySourceEnd:

Stage8ReadInputHandlerSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "var value as u8",10
            .db "value = readInputByte() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "writeOutputByte(value) else fail",10
            .db "end",10
Stage8ReadInputHandlerSourceEnd:

            .org SpareBase
Stage8ConstantsSource:
            .db "sub main() fails",10
            .db "if endOfInput = 1 and inputFailure = 2 and outputFailure = 3 and storageFailure = 4",10
            .db "writeOutputByte('C') else fail",10
            .db "end",10
            .db "end",10
Stage8ConstantsSourceEnd:

Stage8StorageSuccessSource:
            .db "sub main() fails",10
            .db "var first as u8",10
            .db "var again as u8",10
            .db "first = readStorageByte() else fail",10
            .db "rewindStorageInput() else fail",10
            .db "again = readStorageByte() else fail",10
            .db "writeStorageByte(first) else fail",10
            .db "writeStorageByte('B') else fail",10
            .db "seekStorageOutput(0) else fail",10
            .db "writeStorageByte('Z') else fail",10
            .db "writeOutputByte(again) else fail",10
            .db "end",10
Stage8StorageSuccessSourceEnd:

Stage8WriteFailureSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "writeStorageByte('Z') handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8WriteFailureSourceEnd:

Stage8SeekFailureSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "seekStorageOutput(3) handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8SeekFailureSourceEnd:

Stage8RewindFailureSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "rewindStorageInput() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8RewindFailureSourceEnd:

Stage8ReadStorageFailureSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "var value as u8",10
            .db "value = readStorageByte() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8ReadStorageFailureSourceEnd:

Stage8WriteOutputFailureSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "writeOutputByte('X') handle code",10
            .db "if code = outputFailure",10
            .db "return",10
            .db "end",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8WriteOutputFailureSourceEnd:

Stage8MutualForwardSource:
            .db "forward sub odd(value as u16) as boolean fails",10
            .db "sub even(value as u16) as boolean fails",10
            .db "var result as boolean",10
            .db "if value = 0",10
            .db "return true",10
            .db "end",10
            .db "result = odd(value - 1) else fail",10
            .db "return result",10
            .db "end",10
            .db "sub odd",10
            .db "var result as boolean",10
            .db "if value = 0",10
            .db "return false",10
            .db "end",10
            .db "result = even(value - 1) else fail",10
            .db "return result",10
            .db "end",10
            .db "sub main() fails",10
            .db "var result as boolean = even(2) else fail",10
            .db "if result",10
            .db "writeOutputByte('M') else fail",10
            .db "end",10
            .db "end",10
Stage8MutualForwardSourceEnd:

Stage8IncompleteForwardSource:
            .db "forward sub missing(value as u8)",10
            .db "sub main()",10
            .db "end",10
Stage8IncompleteForwardSourceEnd:

            ; Later negative and trap sources live beyond the transactional
            ; backup region so repeated encoding cannot overwrite them.
            .org BackupLimit
Stage8PredefinedVariableSource:
            .db "var "
Stage8PredefinedVariablePoint:
            .db "readInputByte as u8 = 1 + 2",10
            .db "sub main()",10
            .db "end",10
Stage8PredefinedVariableSourceEnd:

Stage8PredefinedRoutineSource:
            .db "sub "
Stage8PredefinedRoutinePoint:
            .db "writeStorageByte(value as u8) fails",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage8PredefinedRoutineSourceEnd:

Stage8PredefinedParameterSource:
            .db "sub helper("
Stage8PredefinedParameterPoint:
            .db "outputFailure as u8)",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage8PredefinedParameterSourceEnd:

Stage8WriteStorageTypeSource:
            .db "sub main() fails",10
            .db "var word as u16 = 300",10
            .db "writeStorageByte("
Stage8WriteStorageTypePoint:
            .db "word) else fail",10
            .db "end",10
Stage8WriteStorageTypeSourceEnd:

Stage8SeekStorageTypeSource:
            .db "sub main() fails",10
            .db "var flag as boolean = true",10
            .db "seekStorageOutput("
Stage8SeekStorageTypePoint:
            .db "flag) else fail",10
            .db "end",10
Stage8SeekStorageTypeSourceEnd:

Stage8SecondForwardSource:
            .db "forward sub duplicate(value as u8)",10
            .db "forward sub "
Stage8SecondForwardPoint:
            .db "duplicate(value as u8)",10
            .db "sub duplicate",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage8SecondForwardSourceEnd:

Stage8UnknownCompletionSource:
            .db "sub "
Stage8UnknownCompletionPoint:
            .db "missing",10
            .db "end",10
            .db "sub main()",10
            .db "end",10
Stage8UnknownCompletionSourceEnd:

Stage8UnconsumedServiceSource:
            .db "sub main() fails",10
            .db "writeOutputByte('A')",10
Stage8UnconsumedServicePoint:
            .db "end",10
Stage8UnconsumedServiceSourceEnd:

Stage8NestedServiceSource:
            .db "sub main() fails",10
            .db "writeOutputByte(readInputByte()"
Stage8NestedServicePoint:
            .db ") else fail",10
            .db "end",10
Stage8NestedServiceSourceEnd:

Stage8ServiceArgumentSource:
            .db "sub take(value as u8)",10
            .db "end",10
            .db "sub main() fails",10
            .db "take("
Stage8ServiceArgumentPoint:
            .db "readInputByte())",10
            .db "end",10
Stage8ServiceArgumentSourceEnd:

Stage8TrapBypassesHandlerSource:
            .db "sub dive(value as u16) as u8 fails",10
            .db "var result as u8",10
            .db "if value = 0",10
            .db "return 0",10
            .db "end",10
            .db "result = "
Stage8TrapRecursiveCallPoint:
            .db "dive(value - 1) else fail",10
            .db "return result",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "var result as u8",10
            .db "result = "
Stage8TrapBypassesHandlerPoint:
            .db "dive(2) handle code",10
            .db "writeOutputByte('H') else fail",10
            .db "end",10
            .db "end",10
Stage8TrapBypassesHandlerSourceEnd:

Stage8ResultFreeReturnSource:
            .db "sub emitMarker() fails",10
            .db "writeOutputByte('R') else fail",10
            .db "return",10
            .db "end",10
            .db "sub relay() fails",10
            .db "emitMarker() else fail",10
            .db "return",10
            .db "end",10
            .db "sub main() fails",10
            .db "relay() else fail",10
            .db "return",10
            .db "end",10
Stage8ResultFreeReturnSourceEnd:

Stage8ForwardMainSource:
            .db "var depth as u8",10
            .db "forward sub main() fails",10
            .db "sub relay() fails",10
            .db "main() else fail",10
            .db "return",10
            .db "end",10
            .db "sub main",10
            .db "if depth = 0",10
            .db "depth = 1",10
            .db "relay() else fail",10
            .db "writeOutputByte('M') else fail",10
            .db "end",10
            .db "return",10
            .db "end",10
Stage8ForwardMainSourceEnd:

Stage8RecursiveMainSource:
            .db "var depth as u8",10
            .db "sub main() fails",10
            .db "if depth = 0",10
            .db "depth = 1",10
            .db "main() else fail",10
            .db "writeOutputByte('D') else fail",10
            .db "end",10
            .db "return",10
            .db "end",10
Stage8RecursiveMainSourceEnd:

Stage8IncompleteForwardMainSource:
            .db "forward sub main() fails",10
Stage8IncompleteForwardMainSourceEnd:

Stage8BoundsTrapSource:
            .db "var bytes as u8[2]",10
            .db "sub main() fails",10
            .db "var index as u8 = readInputByte() else fail",10
            .db "bytes"
Stage8BoundsTrapPoint:
            .db "[index] = 1",10
            .db "end",10
Stage8BoundsTrapSourceEnd:

Stage8NarrowTrapSource:
            .db "var wide as u16 = 300",10
            .db "sub main() fails",10
            .db "var out as u8",10
            .db "out = "
Stage8NarrowTrapPoint:
            .db "u8(wide)",10
            .db "end",10
Stage8NarrowTrapSourceEnd:

Stage8DivideTrapSource:
            .db "sub main() fails",10
            .db "var divisor as u16 = readInputByte() else fail",10
            .db "var result as u16",10
            .db "result = 8 "
Stage8DivideTrapPoint:
            .db "/ divisor",10
            .db "end",10
Stage8DivideTrapSourceEnd:

Stage8LoopRangeTrapSource:
            .db "sub main()",10
            .db "var index as u8",10
            .db "for "
Stage8LoopRangeTrapPoint:
            .db "index = 250 to 300 step 10",10
            .db "end",10
            .db "end",10
Stage8LoopRangeTrapSourceEnd:

Stage8ComposedFailableSource:
            .db "sub read() as u8 fails",10
            .db "return 1",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8",10
            .db "out = read() "
Stage8ComposedFailablePoint:
            .db "+ 1 else fail",10
            .db "end",10
Stage8ComposedFailableSourceEnd:

Stage8AggregateSuffixFailableSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var stored as Box = (1)",10
            .db "sub get() as Box fails",10
            .db "return stored",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8",10
            .db "out = get()"
Stage8AggregateSuffixFailablePoint:
            .db ".value else fail",10
            .db "end",10
Stage8AggregateSuffixFailableSourceEnd:

Stage8IndexFailableSource:
            .db "var items as u8[2]",10
            .db "sub main() fails",10
            .db "var out as u8",10
            .db "out = items[readInputByte()"
Stage8IndexFailablePoint:
            .db "] else fail",10
            .db "end",10
Stage8IndexFailableSourceEnd:

Stage8AggregateArgumentFailableSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var stored as Box",10
            .db "sub get() as Box fails",10
            .db "return stored",10
            .db "end",10
            .db "sub take(value as Box)",10
            .db "end",10
            .db "sub main() fails",10
            .db "take(get("
Stage8AggregateArgumentFailablePoint:
            .db "))",10
            .db "end",10
Stage8AggregateArgumentFailableSourceEnd:

Stage8NestedFrameSource:
            .db "sub inner() as u8",10
            .db "return 'N'",10
            .db "end",10
            .db "sub outer(value as u8) as u8 fails",10
            .db "return value",10
            .db "end",10
            .db "sub main() fails",10
            .db "var out as u8 = outer(inner()) else fail",10
            .db "writeOutputByte(out) else fail",10
            .db "end",10
Stage8NestedFrameSourceEnd:

Stage8PredefinedStepSource:
            .db "sub main() fails",10
            .db "var index as u8",10
            .db "for index = 0 until 4 step outputFailure",10
            .db "writeOutputByte('S') else fail",10
            .db "end",10
            .db "end",10
Stage8PredefinedStepSourceEnd:

Stage8IndirectHandlerSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var target as Box = (9)",10
            .db "sub stop() as u8 fails",10
            .db "fail 7",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "target.value = stop() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "writeOutputByte(target.value) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8IndirectHandlerSourceEnd:

Stage8AggregateCopyHandlerSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var source as Box = (5)",10
            .db "var target as Box = (9)",10
            .db "sub choose(shouldFail as boolean) as Box fails",10
            .db "if shouldFail",10
            .db "fail 7",10
            .db "end",10
            .db "return source",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "target = choose(false) else fail",10
            .db "writeOutputByte(target.value) else fail",10
            .db "target = choose(true) handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "writeOutputByte(target.value) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8AggregateCopyHandlerSourceEnd:

Stage8RetainedResetSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var source as Box = (1)",10
            .db "var target as Box = (2)",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "target = source",10
            .db "rewindStorageInput() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8RetainedResetSourceEnd:

Stage8IndirectServiceHandlerSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var target as Box = (9)",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "target.value = readInputByte() handle code",10
            .db "writeOutputByte(code) else fail",10
            .db "writeOutputByte(target.value) else fail",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8IndirectServiceHandlerSourceEnd:

; Keep the indirect destination count distinct from the following handler's
; symbol metadata. This source leaves the original failable call as the last
; consumer in the transcript so its backpatched fields remain inspectable.
Stage8RetainedFieldSource:
            .db "record Box",10
            .db "value as u8",10
            .db "end",10
            .db "var target as Box = (9)",10
            .db "sub stop() as u8 fails",10
            .db "fail 7",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "target.value = stop() handle code",10
            .db "return",10
            .db "end",10
            .db "fail 99",10
            .db "end",10
Stage8RetainedFieldSourceEnd:

; The redesigned surface keeps handling attached to the call's logical line.
; This one program discriminates success-handler skipping, same-destination
; error storage, handler fallthrough, conditional `else` on the next line,
; and the release of `on` and `error` as ordinary identifiers.
Stage8ImmediateConsumerSource:
            .db "var on as u8 = 1",10
            .db "var error as u8 = 2",10
            .db "var value as u8",10
            .db "sub pass(input as u8) as u8 fails",10
            .db "return input",10
            .db "end",10
            .db "sub stop(input as u8) as u8 fails",10
            .db "fail input",10
            .db "end",10
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "value = pass(5) handle code",10
            .db "fail 90",10
            .db "end",10
            .db "if on + error = 3",10
            .db "value = pass(6) else fail",10
            .db "else",10
            .db "fail 91",10
            .db "end",10
            .db "value = stop(7) handle value",10
            .db "if value = 7",10
            .db "writeOutputByte('H') else fail",10
            .db "end",10
            .db "end",10
            .db "writeOutputByte(value) else fail",10
            .db "end",10
Stage8ImmediateConsumerSourceEnd:

Stage8HandlerPropagatesSource:
            .db "sub main() fails",10
            .db "var code as u8",10
            .db "writeOutputByte('X') handle code",10
Stage8HandlerExplicitFailPoint:
            .db "fail code",10
            .db "end",10
            .db "end",10
Stage8HandlerPropagatesSourceEnd:

Stage8BareLocalSource:
            .db "sub main() fails",10
            .db "var value as u8 = readInputByte()"
Stage8BareLocalPoint: .db 10,"end",10
Stage8BareLocalSourceEnd:
Stage8BareAssignmentSource:
            .db "sub main() fails",10,"var value as u8",10
            .db "value = readInputByte()"
Stage8BareAssignmentPoint: .db 10,"end",10
Stage8BareAssignmentSourceEnd:
Stage8LegacyOrFailSource:
            .db "sub main() fails",10,"var value as u8",10
            .db "value = readInputByte() "
Stage8LegacyOrFailPoint: .db "or fail",10,"end",10
Stage8LegacyOrFailSourceEnd:
Stage8LegacyOnErrorSource:
            .db "sub main() fails",10,"var code as u8",10
            .db "writeOutputByte(1)"
Stage8LegacyOnErrorPoint: .db 10,"on error code",10,"end",10,"end",10
Stage8LegacyOnErrorSourceEnd:
Stage8InfalliblePropagationSource:
            .db "sub main()",10,"var value as u8",10
            .db "value = readInputByte() "
Stage8InfalliblePropagationPoint: .db "else fail",10,"end",10
Stage8InfalliblePropagationSourceEnd:
Stage8InfallibleHandleSource:
            .db "sub helper()",10,"end",10,"sub main()",10
            .db "var code as u8",10,"helper() "
Stage8InfallibleHandlePoint: .db "handle code",10,"end",10,"end",10
Stage8InfallibleHandleSourceEnd:
Stage8DoubleConsumerSource:
            .db "sub main() fails",10,"var code as u8",10
            .db "writeOutputByte(1) else fail "
Stage8DoubleConsumerPoint: .db "handle code",10,"end",10,"end",10
Stage8DoubleConsumerSourceEnd:
Stage8LocalHandleSource:
            .db "sub main() fails",10
            .db "var value as u8 = 1 "
Stage8LocalHandlePoint: .db "handle value",10,"end",10,"end",10
Stage8LocalHandleSourceEnd:
Stage8ResultReturnPropagationSource:
            .db "sub result() as u8 fails",10,"return readInputByte() "
Stage8ResultReturnPropagationPoint: .db "else fail",10,"end",10
            .db "sub main()",10,"end",10
Stage8ResultReturnPropagationSourceEnd:
Stage8FreeReturnPropagationSource:
            .db "sub helper() fails",10,"end",10,"sub main() fails",10,"return "
Stage8FreeReturnPropagationPoint: .db "helper() else fail",10,"end",10
Stage8FreeReturnPropagationSourceEnd:

Stage8MissingHandleNameSource:
            .db "sub main() fails",10,"writeOutputByte(1) handle"
Stage8MissingHandleNamePoint: .db 10,"end",10,"end",10
Stage8MissingHandleNameSourceEnd:
Stage8UnknownHandleNameSource:
            .db "sub main() fails",10,"writeOutputByte(1) handle "
Stage8UnknownHandleNamePoint: .db "missing",10,"end",10,"end",10
Stage8UnknownHandleNameSourceEnd:
Stage8WideHandleNameSource:
            .db "sub main() fails",10,"var code as u16",10
            .db "writeOutputByte(1) handle "
Stage8WideHandleNamePoint: .db "code",10,"end",10,"end",10
Stage8WideHandleNameSourceEnd:
Stage8ConstantHandleNameSource:
            .db "const code = 1",10,"sub main() fails",10
            .db "writeOutputByte(1) handle "
Stage8ConstantHandleNamePoint: .db "code",10,"end",10,"end",10
Stage8ConstantHandleNameSourceEnd:
Stage8AggregateHandleNameSource:
            .db "record Box",10,"value as u8",10,"end",10
            .db "var box as Box",10,"sub main() fails",10
            .db "writeOutputByte(1) handle "
Stage8AggregateHandleNamePoint: .db "box",10,"end",10,"end",10
Stage8AggregateHandleNameSourceEnd:
Stage8CounterHandleNameSource:
            .db "sub main() fails",10,"var index as u8",10
            .db "for index = 0 until 1",10
            .db "writeOutputByte(1) handle "
Stage8CounterHandleNamePoint: .db "index",10,"end",10,"end",10,"end",10
Stage8CounterHandleNameSourceEnd:

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "proof-z80-runtime.asm"
RuntimeCodeEnd:

            ; Stage 8's combined proof needs more than the original 2 KiB
            ; proof partition but remains below the machine stack.
            .org $D000
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofStatus),A
            LD   (ProofCase),A

            LD   A,170
            LD   HL,Stage8MainFailSource
            LD   DE,Stage8MainFailSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFrameFailure
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofTrapStateFailure
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofTrapReasonFailure
            LD   A,(TrapError)
            CP   7
            JP   NZ,ProofTrapErrorFailure
            LD   HL,(TrapOffset)
            LD   DE,Stage8MainFailPoint-Stage8MainFailSource
            LD   (ProofActualTrapOffset),HL
            LD   (ProofExpectedTrapOffset),DE
            OR   A
            SBC  HL,DE
            JP   NZ,ProofTrapOffsetFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofActivationFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8InfallibleFailPoint-Stage8InfallibleFailSource
            LD   HL,Stage8InfallibleFailSource
            LD   DE,Stage8InfallibleFailSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofInfallibleFailure

            LD   A,DiagnosticIntegerRange
            LD   BC,Stage8FailureRangePoint+5-Stage8FailureRangeSource
            LD   HL,Stage8FailureRangeSource
            LD   DE,Stage8FailureRangeSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRangeFailure

            LD   A,DiagnosticRoutineFlow
            LD   BC,Stage8FailureFlowPoint-1-Stage8FailureFlowSource
            LD   HL,Stage8FailureFlowSource
            LD   DE,Stage8FailureFlowSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofFlowFailure

            LD   A,172
            LD   HL,Stage8PropagationSuccessSource
            LD   DE,Stage8PropagationSuccessSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofPropagationSuccessCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofPropagationSuccessEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofPropagationSuccessRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofPropagationSuccessRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofPropagationSuccessRunFailure
            LD   A,(ServiceOutputBase)
            CP   'A'
            JP   NZ,ProofPropagationSuccessRunFailure

            LD   A,173
            LD   HL,Stage8PropagationFailureSource
            LD   DE,Stage8PropagationFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofPropagationFailureCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofPropagationFailureEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofPropagationFailureRunFailure
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofPropagationFailureRunFailure
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofPropagationFailureRunFailure
            LD   A,(TrapError)
            CP   10
            JP   NZ,ProofPropagationFailureRunFailure
            LD   HL,(TrapOffset)
            LD   DE,Stage8PropagationFailurePoint-Stage8PropagationFailureSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofPropagationFailureRunFailure

            LD   A,174
            LD   HL,Stage8BareReturnSource
            LD   DE,Stage8BareReturnSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofBareReturnCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofBareReturnEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofBareReturnRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofBareReturnRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofBareReturnRunFailure
            LD   A,(ServiceOutputBase)
            OR   A
            JP   NZ,ProofBareReturnRunFailure

            LD   A,175
            LD   HL,Stage8SixteenArgumentsSource
            LD   DE,Stage8SixteenArgumentsSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofSixteenCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofSixteenEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofSixteenRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofSixteenRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofSixteenRunFailure
            LD   A,(ServiceOutputBase)
            CP   16
            JP   NZ,ProofSixteenRunFailure

            LD   A,176
            LD   HL,Stage8LocalHandlerSource
            LD   DE,Stage8LocalHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofHandlerCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofHandlerEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofHandlerRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   7
            JP   NZ,ProofHandlerRunFailure

            LD   A,204
            LD   HL,Stage8ProgramHandlerSource
            LD   DE,Stage8ProgramHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofProgramHandlerCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofProgramHandlerEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofProgramHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofProgramHandlerRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofProgramHandlerRunFailure
            LD   A,(ProgramBssBase)
            CP   7
            JP   NZ,ProofProgramHandlerRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofProgramHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   8
            JP   NZ,ProofProgramHandlerRunFailure

            LD   A,177
            LD   HL,Stage8ReadInputSuccessSource
            LD   DE,Stage8ReadInputSuccessSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofReadSuccessCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofReadSuccessEncodeFailure
            CALL Reset
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,'Q'
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofReadSuccessRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofReadSuccessRunFailure
            LD   A,(ServiceInputCursor)
            CP   1
            JP   NZ,ProofReadSuccessRunFailure
            LD   A,(ServiceOutputBase)
            CP   'Q'
            JP   NZ,ProofReadSuccessRunFailure
            CALL Reset
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,'Q'
            LD   (ServiceInputBase),A
            LD   A,1
            LD   (ServiceFailureCall),A
            CALL ProofCallGenerated
            JP   C,ProofReadSuccessRunFailure
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofReadSuccessRunFailure
            LD   A,(TrapError)
            CP   3
            JP   NZ,ProofReadSuccessRunFailure
            LD   HL,(TrapOffset)
            LD   DE,Stage8ReadInputNestedServicePoint-Stage8ReadInputSuccessSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofReadSuccessRunFailure

            LD   A,117
            LD   (ProofCase),A
            LD   A,178
            LD   HL,Stage8ServiceFrameBoundarySource
            LD   DE,Stage8ServiceFrameBoundarySourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRedesignFailure
            CALL EncodeAggregateProgram
            JP   C,ProofRedesignFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofRedesignFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRedesignFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofRedesignFailure
            LD   A,(ServiceOutputBase)
            CP   1
            JP   NZ,ProofRedesignFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRedesignFailure

            LD   A,178
            LD   HL,Stage8ReadInputHandlerSource
            LD   DE,Stage8ReadInputHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofReadHandlerCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofReadHandlerEncodeFailure
            CALL Reset
            XOR  A
            LD   (ServiceInputLength),A
            CALL ProofCallGenerated
            JP   C,ProofReadHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceInputCursor)
            OR   A
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   1
            JP   NZ,ProofReadHandlerRunFailure

            ; The same handler must receive inputFailure without advancing the
            ; cursor or converting the recoverable error into a trap.
            CALL Reset
            LD   A,2
            LD   (ServiceInputFailure),A
            CALL ProofCallGenerated
            JP   C,ProofReadHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceInputCursor)
            OR   A
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   2
            JP   NZ,ProofReadHandlerRunFailure

            ; A distinct reset run must not inherit the configured failure.
            CALL Reset
            LD   A,(ServiceInputFailure)
            OR   A
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,'Q'
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofReadHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceInputCursor)
            CP   1
            JP   NZ,ProofReadHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   'Q'
            JP   NZ,ProofReadHandlerRunFailure

            LD   A,179
            LD   HL,Stage8ConstantsSource
            LD   DE,Stage8ConstantsSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofConstantsCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofConstantsEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofConstantsRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofConstantsRunFailure
            LD   A,(ServiceOutputBase)
            CP   'C'
            JP   NZ,ProofConstantsRunFailure

            LD   A,180
            LD   HL,Stage8StorageSuccessSource
            LD   DE,Stage8StorageSuccessSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofStorageCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofStorageEncodeFailure
            CALL Reset
            XOR  A
            LD   (ServiceStorageInputFailure),A
            LD   (ServiceStorageOutputFailure),A
            INC  A
            LD   (ServiceStorageInputLength),A
            LD   A,'A'
            LD   (ServiceStorageInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofStorageRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceStorageInputCursor)
            CP   1
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceStorageOutputLength)
            CP   2
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceStorageOutputCursor)
            CP   1
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceStorageOutputBase)
            CP   'Z'
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceStorageOutputBase+1)
            CP   'B'
            JP   NZ,ProofStorageRunFailure
            LD   A,(ServiceOutputBase)
            CP   'A'
            JP   NZ,ProofStorageRunFailure

            LD   A,181
            LD   HL,Stage8WriteFailureSource
            LD   DE,Stage8WriteFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofWriteFailureCompile
            CALL EncodeAggregateProgram
            JP   C,ProofWriteFailureEncode
            CALL Reset
            LD   A,1
            LD   (ServiceStorageOutputFailure),A
            LD   (ServiceStorageOutputCursor),A
            INC  A
            LD   (ServiceStorageOutputLength),A
            LD   A,'X'
            LD   (ServiceStorageOutputBase),A
            LD   A,'Y'
            LD   (ServiceStorageOutputBase+1),A
            CALL ProofCallGenerated
            JP   C,ProofWriteFailureRun
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofWriteFailureRun
            LD   A,(ServiceStorageOutputLength)
            CP   2
            JP   NZ,ProofWriteFailureRun
            LD   A,(ServiceStorageOutputCursor)
            CP   1
            JP   NZ,ProofWriteFailureRun
            LD   A,(ServiceStorageOutputBase)
            CP   'X'
            JP   NZ,ProofWriteFailureRun
            LD   A,(ServiceStorageOutputBase+1)
            CP   'Y'
            JP   NZ,ProofWriteFailureRun
            LD   A,(ServiceOutputBase)
            CP   4
            JP   NZ,ProofWriteFailureRun

            LD   A,182
            LD   HL,Stage8SeekFailureSource
            LD   DE,Stage8SeekFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofSeekFailureCompile
            CALL EncodeAggregateProgram
            JP   C,ProofSeekFailureEncode
            CALL Reset
            XOR  A
            LD   (ServiceStorageOutputFailure),A
            INC  A
            LD   (ServiceStorageOutputCursor),A
            INC  A
            LD   (ServiceStorageOutputLength),A
            CALL ProofCallGenerated
            JP   C,ProofSeekFailureRun
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofSeekFailureRun
            LD   A,(ServiceStorageOutputCursor)
            CP   1
            JP   NZ,ProofSeekFailureRun
            LD   A,(ServiceOutputBase)
            CP   4
            JP   NZ,ProofSeekFailureRun

            LD   A,183
            LD   HL,Stage8RewindFailureSource
            LD   DE,Stage8RewindFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRewindFailureCompile
            CALL EncodeAggregateProgram
            JP   C,ProofRewindFailureEncode
            CALL Reset
            LD   A,1
            LD   (ServiceStorageInputFailure),A
            INC  A
            LD   (ServiceStorageInputCursor),A
            CALL ProofCallGenerated
            JP   C,ProofRewindFailureRun
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRewindFailureRun
            LD   A,(ServiceStorageInputCursor)
            CP   2
            JP   NZ,ProofRewindFailureRun
            LD   A,(ServiceOutputBase)
            CP   4
            JP   NZ,ProofRewindFailureRun

            LD   A,184
            LD   HL,Stage8ReadStorageFailureSource
            LD   DE,Stage8ReadStorageFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofReadStorageFailureCompile
            CALL EncodeAggregateProgram
            JP   C,ProofReadStorageFailureEncode
            CALL Reset
            XOR  A
            LD   (ServiceStorageInputFailure),A
            LD   (ServiceStorageInputLength),A
            CALL ProofCallGenerated
            JP   C,ProofReadStorageFailureRun
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofReadStorageFailureRun
            LD   A,(ServiceStorageInputCursor)
            OR   A
            JP   NZ,ProofReadStorageFailureRun
            LD   A,(ServiceOutputBase)
            CP   1
            JP   NZ,ProofReadStorageFailureRun

            LD   A,185
            LD   HL,Stage8WriteOutputFailureSource
            LD   DE,Stage8WriteOutputFailureSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofWriteOutputFailureCompile
            CALL EncodeAggregateProgram
            JP   C,ProofWriteOutputFailureEncode
            CALL Reset
            LD   A,1
            LD   (ServiceFailureCall),A
            CALL ProofCallGenerated
            JP   C,ProofWriteOutputFailureRun
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofWriteOutputFailureRun
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofWriteOutputFailureRun
            XOR  A
            LD   (ServiceFailureCall),A

            LD   A,186
            LD   HL,Stage8MutualForwardSource
            LD   DE,Stage8MutualForwardSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofMutualCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofMutualEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofMutualRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofMutualRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofMutualRunFailure
            LD   A,(ServiceOutputBase)
            CP   'M'
            JP   NZ,ProofMutualRunFailure

            LD   A,DiagnosticForwardIncomplete
            LD   BC,Stage8IncompleteForwardSourceEnd-Stage8IncompleteForwardSource
            LD   HL,Stage8IncompleteForwardSource
            LD   DE,Stage8IncompleteForwardSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofIncompleteForwardFailure

            LD   A,DiagnosticDuplicateName
            LD   BC,Stage8PredefinedVariablePoint-Stage8PredefinedVariableSource
            LD   HL,Stage8PredefinedVariableSource
            LD   DE,Stage8PredefinedVariableSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofPredefinedVariableFailure
            LD   HL,(DiagnosticLine)
            LD   DE,1
            OR   A
            SBC  HL,DE
            JP   NZ,ProofPredefinedVariableFailure
            LD   HL,(DiagnosticColumn)
            LD   DE,5
            OR   A
            SBC  HL,DE
            JP   NZ,ProofPredefinedVariableFailure

            LD   A,DiagnosticDuplicateName
            LD   BC,Stage8PredefinedRoutinePoint-Stage8PredefinedRoutineSource
            LD   HL,Stage8PredefinedRoutineSource
            LD   DE,Stage8PredefinedRoutineSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofPredefinedRoutineFailure

            LD   A,DiagnosticDuplicateName
            LD   BC,Stage8PredefinedParameterPoint-Stage8PredefinedParameterSource
            LD   HL,Stage8PredefinedParameterSource
            LD   DE,Stage8PredefinedParameterSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofPredefinedParameterFailure

            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage8WriteStorageTypePoint+4-Stage8WriteStorageTypeSource
            LD   HL,Stage8WriteStorageTypeSource
            LD   DE,Stage8WriteStorageTypeSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofWriteStorageTypeFailure

            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage8SeekStorageTypePoint+4-Stage8SeekStorageTypeSource
            LD   HL,Stage8SeekStorageTypeSource
            LD   DE,Stage8SeekStorageTypeSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofSeekStorageTypeFailure

            LD   A,DiagnosticDuplicateName
            LD   BC,Stage8SecondForwardPoint-Stage8SecondForwardSource
            LD   HL,Stage8SecondForwardSource
            LD   DE,Stage8SecondForwardSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofSecondForwardFailure

            LD   A,DiagnosticUnknownName
            LD   BC,Stage8UnknownCompletionPoint-Stage8UnknownCompletionSource
            LD   HL,Stage8UnknownCompletionSource
            LD   DE,Stage8UnknownCompletionSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofUnknownCompletionFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8UnconsumedServicePoint-1-Stage8UnconsumedServiceSource
            LD   HL,Stage8UnconsumedServiceSource
            LD   DE,Stage8UnconsumedServiceSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofUnconsumedServiceFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8NestedServicePoint-Stage8NestedServiceSource
            LD   HL,Stage8NestedServiceSource
            LD   DE,Stage8NestedServiceSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofNestedServiceFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8ServiceArgumentPoint+15-Stage8ServiceArgumentSource
            LD   HL,Stage8ServiceArgumentSource
            LD   DE,Stage8ServiceArgumentSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofServiceArgumentFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8ComposedFailablePoint-Stage8ComposedFailableSource
            LD   HL,Stage8ComposedFailableSource
            LD   DE,Stage8ComposedFailableSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofComposedFailableFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8AggregateSuffixFailablePoint-Stage8AggregateSuffixFailableSource
            LD   HL,Stage8AggregateSuffixFailableSource
            LD   DE,Stage8AggregateSuffixFailableSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofAggregateSuffixFailableFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8IndexFailablePoint-Stage8IndexFailableSource
            LD   HL,Stage8IndexFailableSource
            LD   DE,Stage8IndexFailableSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofIndexFailableFailure

            LD   A,DiagnosticFailureContext
            LD   BC,Stage8AggregateArgumentFailablePoint-Stage8AggregateArgumentFailableSource
            LD   HL,Stage8AggregateArgumentFailableSource
            LD   DE,Stage8AggregateArgumentFailableSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofAggregateArgumentFailableFailure

            LD   A,192
            LD   HL,Stage8NestedFrameSource
            LD   DE,Stage8NestedFrameSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofNestedFrameCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofNestedFrameEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofNestedFrameRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofNestedFrameRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofNestedFrameRunFailure
            LD   A,(ServiceOutputBase)
            CP   'N'
            JP   NZ,ProofNestedFrameRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofNestedFrameRunFailure

            LD   A,193
            LD   HL,Stage8PredefinedStepSource
            LD   DE,Stage8PredefinedStepSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofPredefinedStepCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofPredefinedStepEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofPredefinedStepRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofPredefinedStepRunFailure
            LD   A,(ServiceOutputLength)
            CP   2
            JP   NZ,ProofPredefinedStepRunFailure
            LD   A,(ServiceOutputBase)
            CP   'S'
            JP   NZ,ProofPredefinedStepRunFailure
            LD   A,(ServiceOutputBase+1)
            CP   'S'
            JP   NZ,ProofPredefinedStepRunFailure

            LD   A,115
            LD   (ProofCase),A
            LD   A,198
            LD   HL,Stage8RetainedFieldSource
            LD   DE,Stage8RetainedFieldSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRetainedFieldCompileFailure
            LD   HL,(Stage8CallModePointer)
            INC  HL
            INC  HL
            LD   A,(HL)
            CP   1
            JP   NZ,ProofRetainedFieldValueFailure
            INC  HL
            LD   A,(HL)
            CP   SemanticStoreIndirect8
            JP   NZ,ProofRetainedFieldWidthFailure

            LD   A,194
            LD   HL,Stage8IndirectHandlerSource
            LD   DE,Stage8IndirectHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofIndirectHandlerCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofIndirectHandlerEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofIndirectHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofIndirectHandlerRunFailure
            LD   A,(ServiceOutputLength)
            CP   2
            JP   NZ,ProofIndirectHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   7
            JP   NZ,ProofIndirectHandlerRunFailure
            LD   A,(ServiceOutputBase+1)
            CP   9
            JP   NZ,ProofIndirectHandlerRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofIndirectHandlerRunFailure

            LD   A,195
            LD   HL,Stage8AggregateCopyHandlerSource
            LD   DE,Stage8AggregateCopyHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofAggregateCopyHandlerCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofAggregateCopyHandlerEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofAggregateCopyHandlerRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofAggregateCopyHandlerRunFailure
            LD   A,(ServiceOutputLength)
            CP   3
            JP   NZ,ProofAggregateCopyHandlerRunFailure
            LD   A,(ServiceOutputBase)
            CP   5
            JP   NZ,ProofAggregateCopyHandlerRunFailure
            LD   A,(ServiceOutputBase+1)
            CP   7
            JP   NZ,ProofAggregateCopyHandlerRunFailure
            LD   A,(ServiceOutputBase+2)
            CP   5
            JP   NZ,ProofAggregateCopyHandlerRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofAggregateCopyHandlerRunFailure

            LD   A,196
            LD   HL,Stage8RetainedResetSource
            LD   DE,Stage8RetainedResetSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRetainedResetCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofRetainedResetEncodeFailure
            CALL Reset
            LD   A,4
            LD   (ServiceStorageInputFailure),A
            CALL ProofCallGenerated
            JP   C,ProofRetainedResetRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRetainedResetRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofRetainedResetRunFailure
            LD   A,(ServiceOutputBase)
            CP   4
            JP   NZ,ProofRetainedResetRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRetainedResetRunFailure

            LD   A,197
            LD   HL,Stage8IndirectServiceHandlerSource
            LD   DE,Stage8IndirectServiceHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofIndirectServiceCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofIndirectServiceEncodeFailure
            CALL Reset
            XOR  A
            LD   (ServiceInputLength),A
            CALL ProofCallGenerated
            JP   C,ProofIndirectServiceRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofIndirectServiceRunFailure
            LD   A,(ServiceOutputLength)
            CP   2
            JP   NZ,ProofIndirectServiceRunFailure
            LD   A,(ServiceOutputBase)
            CP   1
            JP   NZ,ProofIndirectServiceRunFailure
            LD   A,(ServiceOutputBase+1)
            CP   9
            JP   NZ,ProofIndirectServiceRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofIndirectServiceRunFailure

            LD   A,187
            LD   HL,Stage8TrapBypassesHandlerSource
            LD   DE,Stage8TrapBypassesHandlerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofTrapBypassCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofTrapBypassEncodeFailure
            CALL Reset
            LD   A,2
            LD   (ActivationLimit),A
            CALL ProofCallGenerated
            JP   C,ProofTrapBypassFrameFailure
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofTrapBypassRunFailure
            LD   A,(TrapNumber)
            CP   5
            JP   NZ,ProofTrapBypassRunFailure
            LD   HL,(TrapOffset)
            LD   DE,Stage8TrapRecursiveCallPoint-Stage8TrapBypassesHandlerSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofTrapBypassRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofTrapBypassRunFailure
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofTrapBypassRunFailure

            LD   A,188
            LD   HL,Stage8ResultFreeReturnSource
            LD   DE,Stage8ResultFreeReturnSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofResultFreeReturnCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofResultFreeReturnEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofResultFreeReturnRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofResultFreeReturnRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofResultFreeReturnRunFailure
            LD   A,(ServiceOutputBase)
            CP   'R'
            JP   NZ,ProofResultFreeReturnRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofResultFreeReturnRunFailure

            LD   A,189
            LD   HL,Stage8ForwardMainSource
            LD   DE,Stage8ForwardMainSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofForwardMainCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofForwardMainEncodeFailure
            CALL ProofValidatePublication
            JP   C,ProofPublicationFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofForwardMainRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofForwardMainRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofForwardMainRunFailure
            LD   A,(ServiceOutputBase)
            CP   'M'
            JP   NZ,ProofForwardMainRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofForwardMainRunFailure

            LD   A,191
            LD   HL,Stage8RecursiveMainSource
            LD   DE,Stage8RecursiveMainSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRecursiveMainCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofRecursiveMainEncodeFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofRecursiveMainRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRecursiveMainRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofRecursiveMainRunFailure
            LD   A,(ServiceOutputBase)
            CP   'D'
            JP   NZ,ProofRecursiveMainRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRecursiveMainRunFailure

            LD   A,DiagnosticForwardIncomplete
            LD   BC,Stage8IncompleteForwardMainSourceEnd-Stage8IncompleteForwardMainSource
            LD   HL,Stage8IncompleteForwardMainSource
            LD   DE,Stage8IncompleteForwardMainSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofIncompleteForwardMainFailure

            LD   A,1
            LD   BC,Stage8BoundsTrapPoint-Stage8BoundsTrapSource
            LD   HL,Stage8BoundsTrapSource
            LD   DE,Stage8BoundsTrapSourceEnd
            CALL ProofExpectRuntimeTrap
            JP   C,ProofBoundsTrapFailure

            LD   A,2
            LD   BC,Stage8NarrowTrapPoint-Stage8NarrowTrapSource
            LD   HL,Stage8NarrowTrapSource
            LD   DE,Stage8NarrowTrapSourceEnd
            CALL ProofExpectRuntimeTrap
            JP   C,ProofNarrowTrapFailure

            LD   A,3
            LD   BC,Stage8DivideTrapPoint-Stage8DivideTrapSource
            LD   HL,Stage8DivideTrapSource
            LD   DE,Stage8DivideTrapSourceEnd
            CALL ProofExpectRuntimeTrap
            JP   C,ProofDivideTrapFailure

            LD   A,4
            LD   BC,Stage8LoopRangeTrapPoint-Stage8LoopRangeTrapSource
            LD   HL,Stage8LoopRangeTrapSource
            LD   DE,Stage8LoopRangeTrapSourceEnd
            CALL ProofExpectRuntimeTrap
            JP   C,ProofLoopRangeTrapFailure

            LD   A,198
            LD   HL,Stage8ImmediateConsumerSource
            LD   DE,Stage8ImmediateConsumerSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRedesignFailure
            CALL EncodeAggregateProgram
            JP   C,ProofRedesignFailure
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofRedesignFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRedesignFailure
            LD   A,(ServiceOutputLength)
            CP   2
            JP   NZ,ProofRedesignFailure
            LD   A,(ServiceOutputBase)
            CP   'H'
            JP   NZ,ProofRedesignFailure
            LD   A,(ServiceOutputBase+1)
            CP   7
            JP   NZ,ProofRedesignFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRedesignFailure

            LD   A,116
            LD   (ProofCase),A
            LD   A,199
            LD   HL,Stage8HandlerPropagatesSource
            LD   DE,Stage8HandlerPropagatesSourceEnd
            CALL CompileAggregateCallSlice
            JP   C,ProofRedesignFailure
            CALL EncodeAggregateProgram
            JP   C,ProofRedesignFailure
            CALL Reset
            LD   A,1
            LD   (ServiceFailureCall),A
            CALL ProofCallGenerated
            JP   C,ProofRedesignFailure
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofRedesignFailure
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofRedesignFailure
            LD   A,(TrapError)
            CP   3
            JP   NZ,ProofRedesignFailure
            LD   HL,(TrapOffset)
            LD   DE,Stage8HandlerExplicitFailPoint-Stage8HandlerPropagatesSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofRedesignFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRedesignFailure

            LD   A,117
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8BareLocalPoint-Stage8BareLocalSource
            LD   HL,Stage8BareLocalSource
            LD   DE,Stage8BareLocalSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,118
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8BareAssignmentPoint-Stage8BareAssignmentSource
            LD   HL,Stage8BareAssignmentSource
            LD   DE,Stage8BareAssignmentSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,119
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8LegacyOrFailPoint-Stage8LegacyOrFailSource
            LD   HL,Stage8LegacyOrFailSource
            LD   DE,Stage8LegacyOrFailSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,120
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8LegacyOnErrorPoint-Stage8LegacyOnErrorSource
            LD   HL,Stage8LegacyOnErrorSource
            LD   DE,Stage8LegacyOnErrorSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,121
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8InfalliblePropagationPoint-Stage8InfalliblePropagationSource
            LD   HL,Stage8InfalliblePropagationSource
            LD   DE,Stage8InfalliblePropagationSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,122
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8InfallibleHandlePoint-Stage8InfallibleHandleSource
            LD   HL,Stage8InfallibleHandleSource
            LD   DE,Stage8InfallibleHandleSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,123
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8DoubleConsumerPoint-Stage8DoubleConsumerSource
            LD   HL,Stage8DoubleConsumerSource
            LD   DE,Stage8DoubleConsumerSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,124
            LD   (ProofCase),A
            LD   A,DiagnosticExpectedLine
            LD   BC,Stage8LocalHandlePoint-Stage8LocalHandleSource
            LD   HL,Stage8LocalHandleSource
            LD   DE,Stage8LocalHandleSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,125
            LD   (ProofCase),A
            LD   A,DiagnosticFailureContext
            LD   BC,Stage8ResultReturnPropagationPoint-Stage8ResultReturnPropagationSource
            LD   HL,Stage8ResultReturnPropagationSource
            LD   DE,Stage8ResultReturnPropagationSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,126
            LD   (ProofCase),A
            LD   A,DiagnosticRoutineFlow
            LD   BC,Stage8FreeReturnPropagationPoint-Stage8FreeReturnPropagationSource
            LD   HL,Stage8FreeReturnPropagationSource
            LD   DE,Stage8FreeReturnPropagationSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure

            LD   A,127
            LD   (ProofCase),A
            LD   A,DiagnosticExpectedName
            LD   BC,Stage8MissingHandleNamePoint-Stage8MissingHandleNameSource
            LD   HL,Stage8MissingHandleNameSource
            LD   DE,Stage8MissingHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,128
            LD   (ProofCase),A
            LD   A,DiagnosticUnknownName
            LD   BC,Stage8UnknownHandleNamePoint-Stage8UnknownHandleNameSource
            LD   HL,Stage8UnknownHandleNameSource
            LD   DE,Stage8UnknownHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,129
            LD   (ProofCase),A
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage8WideHandleNamePoint-Stage8WideHandleNameSource
            LD   HL,Stage8WideHandleNameSource
            LD   DE,Stage8WideHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,130
            LD   (ProofCase),A
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage8ConstantHandleNamePoint-Stage8ConstantHandleNameSource
            LD   HL,Stage8ConstantHandleNameSource
            LD   DE,Stage8ConstantHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,131
            LD   (ProofCase),A
            LD   A,DiagnosticTypeMismatch
            LD   BC,Stage8AggregateHandleNamePoint-Stage8AggregateHandleNameSource
            LD   HL,Stage8AggregateHandleNameSource
            LD   DE,Stage8AggregateHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure
            LD   A,132
            LD   (ProofCase),A
            LD   A,DiagnosticActiveCounter
            LD   BC,Stage8CounterHandleNamePoint-Stage8CounterHandleNameSource
            LD   HL,Stage8CounterHandleNameSource
            LD   DE,Stage8CounterHandleNameSourceEnd
            CALL ProofExpectDiagnostic
            JP   C,ProofRedesignFailure

            XOR  A
            LD   (ProofCase),A
            LD   A,$A5
            LD   (ProofStatus),A
            HALT

; A is the expected diagnostic, BC its offset, HL/DE the source range.
.routine in A,BC,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectDiagnostic:
            LD   (ProofExpectedDiagnostic),A
            LD   (ProofExpectedOffset),BC
            LD   A,171
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
            RET  Z
ProofExpectedDiagnosticFailure:
            SCF
            RET

; Check publication before a later diagnostic overlays the emission cursor.
.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
ProofValidatePublication:
            LD   HL,(GeneratedSize)
            LD   DE,GeneratedBase
            ADD  HL,DE
            LD   DE,(EmitCursor)
            OR   A
            SBC  HL,DE
            RET  Z
            SCF
            RET

; A/BC select the exact trap and source offset; HL/DE select the source. Input
; byte zero is supplied for the bounds/division cases and is inert otherwise.
.routine in A,BC,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectRuntimeTrap:
            LD   (ProofExpectedTrap),A
            LD   (ProofExpectedOffset),BC
            LD   A,190
            CALL CompileAggregateCallSlice
            RET  C
            CALL EncodeAggregateProgram
            RET  C
            CALL Reset
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,(ProofExpectedTrap)
            CP   1
            LD   A,0
            JR   NZ,ProofTrapInputReady
            LD   A,2
ProofTrapInputReady:
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            RET  C
            LD   A,(RunState)
            CP   RunTrapped
            JR   NZ,ProofExpectedRuntimeTrapFailure
            LD   A,(ProofExpectedTrap)
            LD   HL,TrapNumber
            CP   (HL)
            JR   NZ,ProofExpectedRuntimeTrapFailure
            LD   HL,(TrapOffset)
            LD   DE,(ProofExpectedOffset)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofExpectedRuntimeTrapFailure
            LD   A,(ActivationDepth)
            OR   A
            JR   NZ,ProofExpectedRuntimeTrapFailure
            LD   A,(ServiceOutputLength)
            OR   A
            RET  Z
ProofExpectedRuntimeTrapFailure:
            SCF
            RET

; Generated code must restore the root SP and IX on terminal failure.
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
            JR   NZ,ProofCallGeneratedFailure
            LD   HL,0
            ADD  HL,SP
            LD   DE,(ProofExpectedSP)
            OR   A
            SBC  HL,DE
            RET  Z
ProofCallGeneratedFailure:
            SCF
            RET

ProofCompileFailure:     LD A,1
                         JP ProofFailed
ProofEncodeFailure:      LD A,2
                         JP ProofFailed
ProofFrameFailure:       LD A,3
                         JP ProofFailed
ProofTrapStateFailure:   LD A,4
                         JP ProofFailed
ProofTrapReasonFailure:  LD A,5
                         JP ProofFailed
ProofTrapErrorFailure:   LD A,6
                         JP ProofFailed
ProofTrapOffsetFailure:  LD A,7
                         JP ProofFailed
ProofActivationFailure:  LD A,8
                         JP ProofFailed
ProofInfallibleFailure:  LD A,9
                         JP ProofFailed
ProofRangeFailure:       LD A,10
                         JP ProofFailed
ProofFlowFailure:        LD A,11
                         JP ProofFailed
ProofPropagationSuccessCompileFailure: LD A,12
                         JP ProofFailed
ProofPropagationSuccessEncodeFailure:  LD A,13
                         JP ProofFailed
ProofPropagationSuccessRunFailure:     LD A,14
                         JP ProofFailed
ProofPropagationFailureCompileFailure: LD A,15
                         JP ProofFailed
ProofPropagationFailureEncodeFailure:  LD A,16
                         JP ProofFailed
ProofPropagationFailureRunFailure:     LD A,17
                         JP ProofFailed
ProofBareReturnCompileFailure: LD A,18
                         JP ProofFailed
ProofBareReturnEncodeFailure:  LD A,19
                         JP ProofFailed
ProofBareReturnRunFailure:     LD A,20
                         JP ProofFailed
ProofSixteenCompileFailure:    LD A,21
                         JP ProofFailed
ProofSixteenEncodeFailure:     LD A,22
                         JP ProofFailed
ProofSixteenRunFailure:        LD A,23
                         JP ProofFailed
ProofHandlerCompileFailure:    LD A,24
                         JP ProofFailed
ProofHandlerEncodeFailure:     LD A,25
                         JP ProofFailed
ProofHandlerRunFailure:        LD A,26
                         JP ProofFailed
ProofReadSuccessCompileFailure: LD A,27
                         JP ProofFailed
ProofReadSuccessEncodeFailure:  LD A,28
                         JP ProofFailed
ProofReadSuccessRunFailure:     LD A,29
                         JP ProofFailed
ProofReadHandlerCompileFailure: LD A,30
                         JP ProofFailed
ProofReadHandlerEncodeFailure:  LD A,31
                         JP ProofFailed
ProofReadHandlerRunFailure:     LD A,32
                         JP ProofFailed
ProofConstantsCompileFailure:   LD A,33
                         JP ProofFailed
ProofConstantsEncodeFailure:    LD A,34
                         JP ProofFailed
ProofConstantsRunFailure:       LD A,35
                         JP ProofFailed
ProofStorageCompileFailure:     LD A,36
                         JP ProofFailed
ProofStorageEncodeFailure:      LD A,37
                         JP ProofFailed
ProofStorageRunFailure:         LD A,38
                         JP ProofFailed
ProofWriteFailureCompile:       LD A,39
                         JP ProofFailed
ProofWriteFailureEncode:        LD A,40
                         JP ProofFailed
ProofWriteFailureRun:           LD A,41
                         JP ProofFailed
ProofSeekFailureCompile:        LD A,42
                         JP ProofFailed
ProofSeekFailureEncode:         LD A,43
                         JP ProofFailed
ProofSeekFailureRun:            LD A,44
                         JP ProofFailed
ProofRewindFailureCompile:      LD A,45
                         JP ProofFailed
ProofRewindFailureEncode:       LD A,46
                         JP ProofFailed
ProofRewindFailureRun:          LD A,47
                         JP ProofFailed
ProofReadStorageFailureCompile: LD A,48
                         JP ProofFailed
ProofReadStorageFailureEncode:  LD A,49
                         JP ProofFailed
ProofReadStorageFailureRun:     LD A,50
                         JP ProofFailed
ProofWriteOutputFailureCompile: LD A,51
                         JP ProofFailed
ProofWriteOutputFailureEncode:  LD A,52
                         JP ProofFailed
ProofWriteOutputFailureRun:     LD A,53
                         JP ProofFailed
ProofMutualCompileFailure:      LD A,54
                         JP ProofFailed
ProofMutualEncodeFailure:       LD A,55
                         JP ProofFailed
ProofMutualRunFailure:          LD A,56
                         JP ProofFailed
ProofIncompleteForwardFailure:  LD A,57
                         JP ProofFailed
ProofPredefinedVariableFailure: LD A,58
                         JP ProofFailed
ProofPredefinedRoutineFailure:  LD A,59
                         JP ProofFailed
ProofPredefinedParameterFailure: LD A,60
                         JP ProofFailed
ProofWriteStorageTypeFailure:   LD A,61
                         JP ProofFailed
ProofSeekStorageTypeFailure:    LD A,62
                         JP ProofFailed
ProofSecondForwardFailure:      LD A,63
                         JP ProofFailed
ProofUnknownCompletionFailure:  LD A,64
                         JP ProofFailed
ProofUnconsumedServiceFailure:  LD A,65
                         JP ProofFailed
ProofNestedServiceFailure:      LD A,66
                         JP ProofFailed
ProofTrapBypassCompileFailure:  LD A,67
                         JP ProofFailed
ProofTrapBypassEncodeFailure:   LD A,68
                         JP ProofFailed
ProofTrapBypassFrameFailure:    LD A,69
                         JP ProofFailed
ProofTrapBypassRunFailure:      LD A,70
                         JP ProofFailed
ProofResultFreeReturnCompileFailure: LD A,71
                         JP ProofFailed
ProofResultFreeReturnEncodeFailure:  LD A,72
                         JP ProofFailed
ProofResultFreeReturnRunFailure:     LD A,73
                         JP ProofFailed
ProofForwardMainCompileFailure: LD A,74
                         JP ProofFailed
ProofForwardMainEncodeFailure:  LD A,75
                         JP ProofFailed
ProofForwardMainRunFailure:     LD A,76
                         JP ProofFailed
ProofIncompleteForwardMainFailure: LD A,77
                         JP ProofFailed
ProofPublicationFailure:          LD A,78
                         JP ProofFailed
ProofBoundsTrapFailure:           LD A,79
                         JP ProofFailed
ProofNarrowTrapFailure:           LD A,80
                         JP ProofFailed
ProofDivideTrapFailure:           LD A,81
                         JP ProofFailed
ProofLoopRangeTrapFailure:        LD A,82
                         JP ProofFailed
ProofRecursiveMainCompileFailure: LD A,83
                         JP ProofFailed
ProofRecursiveMainEncodeFailure:  LD A,84
                         JP ProofFailed
ProofRecursiveMainRunFailure:     LD A,85
                         JP ProofFailed
ProofServiceArgumentFailure:      LD A,86
                         JP ProofFailed
ProofComposedFailableFailure:     LD A,87
                         JP ProofFailed
ProofAggregateSuffixFailableFailure: LD A,88
                         JP ProofFailed
ProofIndexFailableFailure:        LD A,89
                         JP ProofFailed
ProofAggregateArgumentFailableFailure: LD A,102
                         JP ProofFailed
ProofNestedFrameCompileFailure:   LD A,90
                         JP ProofFailed
ProofNestedFrameEncodeFailure:    LD A,91
                         JP ProofFailed
ProofNestedFrameRunFailure:       LD A,92
                         JP ProofFailed
ProofPredefinedStepCompileFailure: LD A,93
                         JP ProofFailed
ProofPredefinedStepEncodeFailure: LD A,94
                         JP ProofFailed
ProofPredefinedStepRunFailure:    LD A,95
                         JP ProofFailed
ProofIndirectHandlerCompileFailure: LD A,96
                         JP ProofFailed
ProofIndirectHandlerEncodeFailure: LD A,97
                         JP ProofFailed
ProofIndirectHandlerRunFailure:   LD A,98
                         JP ProofFailed
ProofAggregateCopyHandlerCompileFailure: LD A,99
                         JP ProofFailed
ProofAggregateCopyHandlerEncodeFailure: LD A,100
                         JP ProofFailed
ProofAggregateCopyHandlerRunFailure: LD A,101
                         JP ProofFailed
ProofRetainedResetCompileFailure: LD A,103
                         JP ProofFailed
ProofRetainedResetEncodeFailure: LD A,104
                         JP ProofFailed
ProofRetainedResetRunFailure: LD A,105
                         JP ProofFailed
ProofIndirectServiceCompileFailure: LD A,106
                         JP ProofFailed
ProofIndirectServiceEncodeFailure: LD A,107
                         JP ProofFailed
ProofIndirectServiceRunFailure: LD A,108
                         JP ProofFailed
ProofRetainedFieldCompileFailure: LD A,109
                         JP ProofFailed
ProofRetainedFieldValueFailure: LD A,110
                         JP ProofFailed
ProofRetainedFieldWidthFailure: LD A,111
                         JP ProofFailed
ProofProgramHandlerCompileFailure: LD A,112
                         JP ProofFailed
ProofProgramHandlerEncodeFailure: LD A,113
                         JP ProofFailed
ProofProgramHandlerRunFailure: LD A,114
                         JP ProofFailed
ProofRedesignFailure:
            HALT
ProofFailed:
            LD   (ProofCase),A
            HALT

ProofExpectedSP:         .dw 0
ProofActualTrapOffset:   .dw 0
ProofExpectedTrapOffset: .dw 0
ProofExpectedOffset:     .dw 0
ProofExpectedDiagnostic: .db 0
ProofExpectedTrap:       .db 0
ProofStatus:             .db 0
ProofCase:               .db 0
ProofEnd:
