; Nucleus native-backend spike — fixed-slot scalar loop
;
; This is the direct-Z80 expansion of the same semantic program used by the
; three NVM frame-addressing variants:
;
;   counter = 0
;   total = 0
;   limit = 100
;   one = 1
;   repeat
;       total = total + counter
;       counter = counter + one
;   until counter >= limit
;
; Values remain in the same page-aligned memory slots used by NVM. The spike
; deliberately performs no register allocation or peephole optimisation. It
; therefore measures native template expansion, not hand-shaped Z80 code.

Frame       .equ $0400
StackTop    .equ $FF00

            .org $0000
Start:
            LD   SP,StackTop

            LD   HL,0
            LD   (Frame+0),HL
            LD   HL,0
            LD   (Frame+2),HL
            LD   HL,100
            LD   (Frame+4),HL
            LD   HL,1
            LD   (Frame+6),HL

Loop:
            LD   HL,(Frame+2)
            LD   DE,(Frame+0)
            ADD  HL,DE
            LD   (Frame+2),HL

            LD   HL,(Frame+0)
            LD   DE,(Frame+6)
            ADD  HL,DE
            LD   (Frame+0),HL

            LD   HL,(Frame+0)
            LD   DE,(Frame+4)
            OR   A
            SBC  HL,DE
            JP   C,Loop
            HALT
NativeEnd:

            .org Frame
            .ds  8

            .end
