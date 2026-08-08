; Nucleus VM spike — variant C: page-aligned frames, operand fetch inlined
;
; Variant B without the CALL. The frame page is read from a fixed cell rather
; than held as an immediate, because inlining multiplies the patch sites: an
; immediate would cost one store per site on every call, and there are three
; sites in each arithmetic handler.
;
; This is the speed bound for page-aligned addressing. It buys T-states with
; bytes, and the ratio is the measurement.
;
; Six opcodes, enough to run a counted loop over three-address arithmetic:
;   0 HALT
;   1 LDI  d, imm16
;   2 MOV  s, d
;   3 ADD  s1, s2, d
;   4 SUB  s1, s2, d
;   5 JLT  s1, s2, target        ; unsigned
;   6 NOP                          ; dispatch overhead, measured alone
;
; Operands are encoded source-first, destination-last. Destination-first would
; force the handler to hold an address across two more operand fetches, and on
; a machine this short of registers that is a push and a pop it does not need.

OptabPage   .equ $02
Optab       .equ $0200
Program     .equ $0300
Frame       .equ $0400
FramePageValue .equ $04
FrameCell   .equ $01F0
StackTop    .equ $FF00

            .org $0000
Start:
            LD   SP,StackTop
            LD   A,FramePageValue
            LD   (FrameCell),A
            LD   DE,Program
            JP   Next

; ---------------------------------------------------------------- dispatch
; IP lives in DE. Every handler ends by jumping here.

Next:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   H,OptabPage
            LD   A,(HL)
            INC  L
            LD   H,(HL)
            LD   L,A
            JP   (HL)
NextEnd:

; ------------------------------------------------------------ operand fetch
; Inlined at every use. Consumes one slot index from the instruction stream and
; leaves its address in HL, clobbering A only.
;
;           LD   A,(DE)
;           INC  DE
;           ADD  A,A
;           LD   L,A
;           LD   A,(FrameCell)
;           LD   H,A

Slot:
SlotEnd:

; ---------------------------------------------------------------- handlers

OpHalt:
            HALT
OpHaltEnd:

OpLdi:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(DE)
            INC  DE
            LD   (HL),A
            INC  HL
            LD   A,(DE)
            INC  DE
            LD   (HL),A
            JP   Next
OpLdiEnd:

OpMov:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpMovEnd:

OpAdd:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            POP  BC
            ADD  HL,BC
            PUSH HL
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpAddEnd:

; HL = s1 - s2, byte at a time. SBC HL,BC would cost an ED prefix and a
; carry clear for the same four bytes of work.
OpSub:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            POP  BC
            LD   A,C
            SUB  L
            LD   C,A
            LD   A,B
            SBC  A,H
            LD   B,A
            PUSH BC
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpSubEnd:

OpJlt:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
            LD   A,(FrameCell)
            LD   H,A
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            POP  BC
            LD   A,C
            SUB  L
            LD   A,B
            SBC  A,H
            JR   C,JltTaken
            INC  DE
            INC  DE
            JP   Next
JltTaken:
            EX   DE,HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            JP   Next
OpJltEnd:

; Does nothing, so its measured cost is the dispatch loop and nothing else.
OpNop:
            JP   Next
OpNopEnd:

VmEnd:

; ------------------------------------------------------------ dispatch table

            .org Optab
            .dw  OpHalt
            .dw  OpLdi
            .dw  OpMov
            .dw  OpAdd
            .dw  OpSub
            .dw  OpJlt
            .dw  OpNop

; Bytecode is injected at `Program` by the harness, so one assembled VM serves
; every measurement.

            .end
