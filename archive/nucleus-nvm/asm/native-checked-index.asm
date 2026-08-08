; Nucleus native-backend spike — checked fixed-array selection
;
; This is a direct-Z80 expansion of one checked selection from a four-byte
; program-lifetime array. The base carrier already has the exact array type;
; source construction therefore guarantees that it denotes the array object.
; The generated code still checks the dynamic index before reading memory.
;
; Two entry points exercise the success and bounds-trap paths. The selection
; body is identical in both runs. It performs no register allocation across
; semantic operations and no peephole optimisation.

Frame       .equ $0400
Data        .equ $0500
StackTop    .equ $FF00
ArrayLength .equ 4
BoundsTrap  .equ 1

            .org $0000
Start:
            LD   SP,StackTop
            LD   HL,2
            LD   (Frame+2),HL
            JP   Select

StartOutOfBounds:
            LD   SP,StackTop
            LD   HL,4
            LD   (Frame+2),HL
            JP   Select

Select:
            LD   HL,(Frame+2)
            LD   DE,ArrayLength
            OR   A
            SBC  HL,DE
            JP   NC,TrapBounds

            LD   HL,(Frame+2)
            LD   DE,(Frame+0)
            ADD  HL,DE
            LD   A,(HL)
            LD   (Frame+4),A
            HALT

TrapBounds:
            LD   A,BoundsTrap
            LD   (Frame+5),A
            HALT
NativeEnd:

            .org Frame
            .dw  Data
            .dw  0
            .db  0
            .db  0

            .org Data
            .db  11,22,33,44

            .end
