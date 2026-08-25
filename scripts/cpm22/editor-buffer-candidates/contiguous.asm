; Contiguous editor text arena candidate.

EditorBufferBase      .equ $2000
EditorBufferLimit     .equ $D800
EditorBufferCapacity  .equ EditorBufferLimit-EditorBufferBase
CandidateLength       .equ $1E00
CandidateCursor       .equ $1E02
CandidateChecksum     .equ $1E04
CandidateScratch      .equ $1E05

            .org $0100
CandidateCodeStart:
CandidateRepresentationStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateReset:
            LD   HL,0
            LD   (CandidateLength),HL
            LD   (CandidateCursor),HL
            XOR  A
            RET

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateSetLoaded:
            LD   (CandidateLength),HL
            LD   HL,0
            LD   (CandidateCursor),HL
            XOR  A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateInsert:
            LD   (CandidateScratch),A
            LD   HL,(CandidateLength)
            LD   DE,EditorBufferCapacity
            OR   A
            SBC  HL,DE
            JR   Z,CandidateInsertFull
            LD   HL,(CandidateLength)
            LD   DE,(CandidateCursor)
            OR   A
            SBC  HL,DE
            LD   B,H
            LD   C,L
            LD   HL,(CandidateLength)
            LD   DE,EditorBufferBase
            ADD  HL,DE
            LD   D,H
            LD   E,L
            DEC  HL
            LD   A,B
            OR   C
            JR   Z,CandidateInsertStore
            LDDR
CandidateInsertStore:
            LD   HL,(CandidateCursor)
            LD   DE,EditorBufferBase
            ADD  HL,DE
            LD   A,(CandidateScratch)
            LD   (HL),A
            LD   HL,(CandidateCursor)
            INC  HL
            LD   (CandidateCursor),HL
            LD   HL,(CandidateLength)
            INC  HL
            LD   (CandidateLength),HL
            OR   A
            RET
CandidateInsertFull:
            LD   A,(CandidateScratch)
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateBackspace:
            LD   HL,(CandidateCursor)
            LD   A,H
            OR   L
            JR   Z,CandidateEditBoundary
            DEC  HL
            LD   (CandidateCursor),HL
            JP   CandidateDeleteShift

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateDelete:
            LD   HL,(CandidateLength)
            LD   DE,(CandidateCursor)
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            JP   CandidateDeleteShift

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateDeleteShift:
            LD   HL,(CandidateLength)
            LD   DE,(CandidateCursor)
            OR   A
            SBC  HL,DE
            DEC  HL
            LD   B,H
            LD   C,L
            LD   HL,(CandidateCursor)
            LD   DE,EditorBufferBase
            ADD  HL,DE
            LD   D,H
            LD   E,L
            INC  HL
            LD   A,B
            OR   C
            JR   Z,CandidateDeleteDone
            LDIR
CandidateDeleteDone:
            LD   HL,(CandidateLength)
            DEC  HL
            LD   (CandidateLength),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateLeft:
            LD   HL,(CandidateCursor)
            LD   A,H
            OR   L
            JR   Z,CandidateEditBoundary
            DEC  HL
            LD   (CandidateCursor),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
CandidateRight:
            LD   HL,(CandidateCursor)
            LD   DE,(CandidateLength)
            OR   A
            SBC  HL,DE
            JR   Z,CandidateEditBoundary
            ADD  HL,DE
            INC  HL
            LD   (CandidateCursor),HL
            OR   A
            RET

CandidateEditBoundary:
            SCF
            RET

.routine in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
CandidateByteAt:
            LD   DE,(CandidateLength)
            OR   A
            SBC  HL,DE
            JR   NC,CandidateByteAtEnd
            ADD  HL,DE
            LD   DE,EditorBufferBase
            ADD  HL,DE
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
