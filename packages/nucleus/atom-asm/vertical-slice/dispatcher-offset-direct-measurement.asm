; Ideal one-byte semantic dispatcher when every handler begins in one page.

            %INCLUDE "memory-map.asmi"

            ORG CMPLRCRB
CMPLRCDS: ;@NUC-GLOBAL CompilerCodeStart PERMANENT CMPLRCDS
OFFSTDRC: ;@NUC-GLOBAL OffsetDirectSelectionStart PERMANENT OFFSTDRC
OFFSTDR0: ;@NUC-GLOBAL OffsetDirectPage PERMANENT OFFSTDR0
            DB OD0OFF
            DB OD1OFF
            DB OD2OFF
            DB OD3OFF
            DB OD4OFF
            DB OD5OFF
            DB OD6OFF
            DB OD7OFF
;@ROUTINE IN A OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
.L00000:
            SUB  12
            CP   8
            JR   NC,.L00001
            LD   L,A
            LD   H,0
            LD   L,(HL)
            LD   H,0
            JP   (HL)
.L00001:
            SCF
            RET
OFFSTDR1: ;@NUC-GLOBAL OffsetDirectSelectionEnd PERMANENT OFFSTDR1

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00000: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00001: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00002: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00003: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00004: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00005: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00006: OR A
               RET
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
.L00007: OR A
               RET
OD0OFF EQU .L00000-OFFSTDR0 ; direct dispatcher page offset 0
OD1OFF EQU .L00001-OFFSTDR0 ; direct dispatcher page offset 1
OD2OFF EQU .L00002-OFFSTDR0 ; direct dispatcher page offset 2
OD3OFF EQU .L00003-OFFSTDR0 ; direct dispatcher page offset 3
OD4OFF EQU .L00004-OFFSTDR0 ; direct dispatcher page offset 4
OD5OFF EQU .L00005-OFFSTDR0 ; direct dispatcher page offset 5
OD6OFF EQU .L00006-OFFSTDR0 ; direct dispatcher page offset 6
OD7OFF EQU .L00007-OFFSTDR0 ; direct dispatcher page offset 7
CMPLRCDE: ;@NUC-GLOBAL CompilerCodeEnd PERMANENT CMPLRCDE
CMPLRCRE: ;@NUC-GLOBAL CompilerCoreEnd PERMANENT CMPLRCRE

            ORG PRFBS
PRFSTRT: ;@NUC-GLOBAL ProofStart PERMANENT PRFSTRT
            LD   A,$A5
            LD   (PRFSTTS),A
            HALT
PRFSTTS: DB 0 ;@NUC-GLOBAL ProofStatus PERMANENT PRFSTTS
ProofEnd:

            ;@AZM-END
