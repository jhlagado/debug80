; Nucleus VM spike — variant B: page-aligned frames
;
; Operand addressing costs a subroutine that forms HL from a page byte held as
; an immediate. A frame occupies a whole page whatever its size, and entering
; one patches the immediate at `FramePage`+1.
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
StackTop    .equ $FF00

            .org $0000
Start:
            LD   SP,StackTop
            LD   A,FramePageValue
            LD   (FramePage+1),A
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
; Consumes one slot index from the instruction stream and returns its address
; in HL. Clobbers A only: the page byte is an immediate, so no scratch pair is
; needed to form the address.
;
; The immediate at FramePage+1 is written on entry to a routine. This spike has
; no calls, so it is written once at Start; the two stores it costs per call
; are measured when CALL exists.

Slot:
            LD   A,(DE)
            INC  DE
            ADD  A,A
            LD   L,A
FramePage:
            LD   H,$00
            RET
SlotEnd:

; ---------------------------------------------------------------- handlers

OpHalt:
            HALT
OpHaltEnd:

OpLdi:
            CALL Slot
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
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            CALL Slot
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpMovEnd:

OpAdd:
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            POP  BC
            ADD  HL,BC
            PUSH HL
            CALL Slot
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpAddEnd:

; HL = s1 - s2, byte at a time. SBC HL,BC would cost an ED prefix and a
; carry clear for the same four bytes of work.
OpSub:
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            CALL Slot
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
            CALL Slot
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next
OpSubEnd:

OpJlt:
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            PUSH HL
            CALL Slot
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
