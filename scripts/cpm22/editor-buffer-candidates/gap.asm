; Movable-gap editor text arena candidate. The cursor is always at the gap.

EditorBufferBase      .equ $2000
EditorBufferLimit     .equ $D800
EditorBufferCapacity  .equ EditorBufferLimit-EditorBufferBase
CandidateGapLow       .equ $1E00
CandidateGapHigh      .equ $1E02
CandidateChecksum     .equ $1E04
CandidateLoadLength   .equ $1E05

            .org $0100
CandidateCodeStart:
CandidateRepresentationStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateReset:
            LD   HL,EditorBufferBase
            LD   (CandidateGapLow),HL
            LD   HL,EditorBufferLimit
            LD   (CandidateGapHigh),HL
            XOR  A
            RET

; Input bytes occupy EditorBufferBase..EditorBufferBase+HL. Move them to the
; post-gap span so the initial cursor is byte zero.
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateSetLoaded:
            LD   (CandidateLoadLength),HL
            LD   B,H
            LD   C,L
            LD   A,H
            OR   L
            JR   Z,CandidateReset
            LD   DE,EditorBufferBase-1
            ADD  HL,DE
            LD   DE,EditorBufferLimit-1
            LDDR
            LD   HL,EditorBufferBase
            LD   (CandidateGapLow),HL
            LD   HL,EditorBufferLimit
            LD   DE,(CandidateLoadLength)
            OR   A
            SBC  HL,DE
            LD   (CandidateGapHigh),HL
            XOR  A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateInsert:
            LD   HL,(CandidateGapLow)
            LD   DE,(CandidateGapHigh)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   Z,CandidateEditBoundary
            LD   (HL),A
            INC  HL
            LD   (CandidateGapLow),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateBackspace:
            LD   HL,(CandidateGapLow)
            LD   DE,EditorBufferBase
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            ADD  HL,DE
            DEC  HL
            LD   (CandidateGapLow),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateDelete:
            LD   HL,(CandidateGapHigh)
            LD   DE,EditorBufferLimit
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            ADD  HL,DE
            INC  HL
            LD   (CandidateGapHigh),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateLeft:
            LD   HL,(CandidateGapLow)
            LD   DE,EditorBufferBase
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            ADD  HL,DE
            DEC  HL
            LD   (CandidateGapLow),HL
            LD   A,(HL)
            LD   HL,(CandidateGapHigh)
            DEC  HL
            LD   (HL),A
            LD   (CandidateGapHigh),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateRight:
            LD   HL,(CandidateGapHigh)
            LD   DE,EditorBufferLimit
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            ADD  HL,DE
            LD   A,(HL)
            INC  HL
            LD   (CandidateGapHigh),HL
            LD   HL,(CandidateGapLow)
            LD   (HL),A
            INC  HL
            LD   (CandidateGapLow),HL
            OR   A
            RET

CandidateEditBoundary:
            SCF
            RET

.routine in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
CandidateByteAt:
            PUSH HL
            LD   HL,EditorBufferLimit
            LD   DE,(CandidateGapHigh)
            OR   A
            SBC  HL,DE
            EX   DE,HL
            LD   HL,(CandidateGapLow)
            LD   BC,EditorBufferBase
            OR   A
            SBC  HL,BC
            ADD  HL,DE
            EX   DE,HL
            POP  HL
            OR   A
            SBC  HL,DE
            JR   NC,CandidateByteAtEnd
            ADD  HL,DE
            LD   DE,EditorBufferBase
            ADD  HL,DE
            LD   DE,(CandidateGapLow)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,CandidateByteAtReady
            PUSH HL
            LD   HL,(CandidateGapHigh)
            LD   DE,(CandidateGapLow)
            OR   A
            SBC  HL,DE
            EX   DE,HL
            POP  HL
            ADD  HL,DE
CandidateByteAtReady:
            LD   A,(HL)
            OR   A
            RET
CandidateByteAtEnd:
            SCF
            RET
CandidateRepresentationEnd:

            .include "common.asmi"
CandidateCodeEnd:
            .end
