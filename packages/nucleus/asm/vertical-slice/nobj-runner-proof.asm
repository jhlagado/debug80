; Proof-only producer for the optional NOBJ manifest path.

ProofMemoryStart .equ $0000
ProofMemoryEnd   .equ $10000

            .org $0100
ProofStart:
            HALT

            .org $1000
NobjAdapterLength:
            .dw NobjAdapterEnd-NobjAdapterLog
NobjAdapterLog:
            ; IMAGE bank 0, $8000: LD A,$5A / LD ($8081),A / HALT
            .db 1,0,$00,$80,6,0,$3E,$5A,$32,$81,$80,$76
            ; IMAGE bank 0, $8080: loaded initialized bytes
            .db 1,0,$80,$80,2,0,0,0
NobjAdapterEnd:
