; Proof-only producer for the optional source-provenance log side channel.

PRFMMRYS EQU $0000 ;@NUC-GLOBAL ProofMemoryStart PERMANENT PRFMMRYS
PRFMMRYE   EQU 0 ;@NUC-GLOBAL ProofMemoryEnd PERMANENT PRFMMRYE ;@ATOM-PROOF-LIMIT ProofMemoryEnd 65536

            ORG $0100
PRFSTRT: ;@NUC-GLOBAL ProofStart PERMANENT PRFSTRT
            HALT

            ORG $1000
SRCPRVN0: ;@NUC-GLOBAL SourceProvenanceLength PERMANENT SRCPRVN0
            DW SRCPRVNE
SRCPRVND: ;@NUC-GLOBAL SourceProvenanceLog PERMANENT SRCPRVND
            ; part 1, bank 0, line 10, column 3, $8000..$8003, code, high confidence
            DB 1,0,10,0,3,0,$00,$80,$03,$80,1,2
SRCPRVN5: ;@NUC-GLOBAL SourceProvenanceEnd PERMANENT SRCPRVN5
SRCPRVNE EQU SRCPRVN5-SRCPRVND ;@NUC-GLOBAL SourceProvenanceSize PERMANENT SRCPRVNE
