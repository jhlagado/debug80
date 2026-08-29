; Proof-only producer for the optional NOBJ manifest path.

PRFMMRYS EQU $0000 ;@NUC-GLOBAL ProofMemoryStart PERMANENT PRFMMRYS
PRFMMRYE   EQU 0 ;@NUC-GLOBAL ProofMemoryEnd PERMANENT PRFMMRYE ;@ATOM-PROOF-LIMIT ProofMemoryEnd 65536

            ORG $0100
PRFSTRT: ;@NUC-GLOBAL ProofStart PERMANENT PRFSTRT
            HALT

            ORG $1000
NBJADPTR: ;@NUC-GLOBAL NobjAdapterLength PERMANENT NBJADPTR
            DW NBJADPT1
NBJADPT0: ;@NUC-GLOBAL NobjAdapterLog PERMANENT NBJADPT0
            ; IMAGE bank 0, $8000: LD A,$5A / LD ($8081),A / HALT
            DB 1,0,$00,$80,6,0,$3E,$5A,$32,$81,$80,$76
            ; IMAGE bank 0, $8080: loaded initialized bytes
            DB 1,0,$80,$80,2,0,0,0
.L00000:
NBJADPT1 EQU .L00000-NBJADPT0 ;@NUC-GLOBAL NobjAdapterSize PERMANENT NBJADPT1
