; Nucleus VM spike — checked byte-array selection
;
; This partial interpreter implements the assigned NVM encodings needed by one
; checked byte-array selection: LDI16, INDEX, LOAD8, and RET. INDEX accepts its
; general positive stride. A small repeated-add multiplication keeps this proof
; simple; later measurements can replace it without changing the operation.

OptabPage   .equ $02
Optab       .equ $0200
Program     .equ $0300
Frame       .equ $0400
FramePageValue .equ $04
DataRegion  .equ $0500
DataSize    .equ 4
TrapMarker  .equ $0600
StackTop    .equ $FF00
BoundsTrap  .equ 1

            .org $0000
Start:
            LD   SP,StackTop
            LD   A,FramePageValue
            LD   (FramePage+1),A
            LD   IX,Program
            JP   Next

; IP lives in IX. The sparse table contains the assigned NVM opcode positions.
Next:
            LD   A,(IX+0)
            INC  IX
            ADD  A,A
            LD   L,A
            LD   H,OptabPage
            LD   A,(HL)
            INC  L
            LD   H,(HL)
            LD   L,A
            JP   (HL)

; Consume a slot operand and return its address in HL.
Slot:
            LD   A,(IX+0)
            INC  IX
            ADD  A,A
            LD   L,A
FramePage:
            LD   H,$00
            RET

; Consume a slot operand and return its word value in HL.
LoadSlotWord:
            CALL Slot
            LD   A,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,A
            RET

; Consume a little-endian immediate and return it in BC.
ReadImmediateWord:
            LD   A,(IX+0)
            INC  IX
            LD   C,A
            LD   A,(IX+0)
            INC  IX
            LD   B,A
            RET

OpLdi16:
            CALL ReadImmediateWord
            CALL Slot
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next

OpIndex:
            CALL LoadSlotWord       ; base offset
            PUSH HL
            CALL LoadSlotWord       ; index
            PUSH HL
            CALL ReadImmediateWord  ; length
            POP  HL
            PUSH HL
            OR   A
            SBC  HL,BC
            POP  HL
            JP   NC,TrapBounds

            CALL ReadImmediateWord  ; stride
            PUSH BC                 ; retain stride for the region check
            EX   DE,HL              ; DE = index
            LD   HL,0               ; HL = product
IndexMultiply:
            LD   A,D
            OR   E
            JR   Z,IndexProductReady
            ADD  HL,BC
            JP   C,TrapBounds
            DEC  DE
            JR   IndexMultiply
IndexProductReady:
            POP  BC                 ; stride
            POP  DE                 ; base offset
            ADD  HL,DE
            JP   C,TrapBounds

            PUSH HL                 ; selected offset
            ADD  HL,BC              ; end-exclusive selected region
            JP   C,TrapBounds
            LD   BC,DataSize
            OR   A
            SBC  HL,BC
            JP   C,IndexRegionReady
            JP   Z,IndexRegionReady
            JP   TrapBounds
IndexRegionReady:
            POP  BC                 ; selected offset
            CALL Slot               ; destination carrier
            LD   (HL),C
            INC  HL
            LD   (HL),B
            JP   Next

OpLoad8:
            CALL LoadSlotWord       ; checked data offset
            PUSH HL
            LD   BC,DataSize
            OR   A
            SBC  HL,BC
            JP   NC,TrapBounds
            POP  HL
            LD   BC,DataRegion
            ADD  HL,BC
            LD   A,(HL)
            PUSH AF
            CALL Slot
            POP  AF
            LD   (HL),A
            INC  HL
            LD   (HL),0
            JP   Next

OpRet:
            HALT

TrapBounds:
            LD   A,BoundsTrap
            LD   (TrapMarker),A
            HALT
VmEnd:

            .org Optab+$02*2
            .dw  OpLdi16
            .org Optab+$42*2
            .dw  OpIndex
            .org Optab+$48*2
            .dw  OpLoad8
            .org Optab+$52*2
            .dw  OpRet
OptabEnd:

            .org Frame
            .ds  8

            .org DataRegion
            .db  11,22,33,44

            .org TrapMarker
            .db  0

            .end
