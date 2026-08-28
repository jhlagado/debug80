; Proof-only producer for the optional source-provenance log side channel.

ProofMemoryStart .equ $0000
ProofMemoryEnd   .equ $10000

            .org $0100
ProofStart:
            HALT

            .org $1000
SourceProvenanceLength:
            .dw SourceProvenanceSize
SourceProvenanceLog:
            ; part 1, bank 0, line 10, column 3, $8000..$8003, code, high confidence
            .db 1,0,10,0,3,0,$00,$80,$03,$80,1,2
SourceProvenanceEnd:
SourceProvenanceSize .equ SourceProvenanceEnd-SourceProvenanceLog
