; Two-segment endpoint scan alternative. It stops at the saved start address.

CandidateTextBase         .equ $2000
CandidateTextLength       .equ $1EC8
CandidateCursor           .equ $1ECA
CandidateStatus           .equ $1ED3
CandidateScratchStart     .equ $1ED7
CandidateScratchScan      .equ $1ED9
CandidateScratchFlag      .equ $1EDB
CandidateCommittedLength  .equ $1EE4
CandidateCommittedBuffer  .equ CandidateCommittedLength+1
CandidateBellCount        .equ $F000
CandidatePromptCursor     .equ $F001
CandidateStatusFound      .equ 1
CandidateStatusWrapped    .equ 2
CandidateStatusMissing    .equ 3
CandidateStatusNoQuery    .equ 4

            .org $0100
CandidateCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateRing:
            LD   HL,CandidateBellCount
            INC  (HL)
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
CandidateReset:
            XOR  A
            LD   (CandidateCommittedLength),A
            LD   (CandidateStatus),A
            LD   (CandidateBellCount),A
            LD   HL,0
            LD   (CandidateCursor),HL
            RET

CandidateScanCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
CandidateSearchInitial:
            LD   A,(CandidateCommittedLength)
            OR   A
            JR   Z,CandidateSearchNoQuery
            LD   HL,(CandidateCursor)
            JR   CandidateSearchStart

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateSearchRepeat:
            LD   A,(CandidateCommittedLength)
            OR   A
            JR   Z,CandidateSearchNoQuery
            LD   HL,(CandidateCursor)
            INC  HL

CandidateSearchStart:
            XOR  A
            LD   (CandidateScratchFlag),A
            LD   DE,(CandidateTextLength)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,CandidateSearchStartReady
            LD   (CandidateScratchStart),DE
            LD   HL,0
            LD   A,1
            LD   (CandidateScratchFlag),A
            JR   CandidateSearchLoop
CandidateSearchStartReady:
            LD   (CandidateScratchStart),HL

CandidateSearchLoop:
            LD   A,(CandidateScratchFlag)
            OR   A
            JR   Z,CandidateSearchBeforeWrap
            LD   DE,(CandidateScratchStart)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   Z,CandidateSearchNotFound
            JR   CandidateSearchTry
CandidateSearchBeforeWrap:
            LD   DE,(CandidateTextLength)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,CandidateSearchTry
            LD   HL,0
            LD   A,1
            LD   (CandidateScratchFlag),A
            JR   CandidateSearchLoop

CandidateSearchTry:
            LD   (CandidateScratchScan),HL
            CALL CandidateMatch
            JR   Z,CandidateSearchFound
            LD   HL,(CandidateScratchScan)
            INC  HL
            JR   CandidateSearchLoop

CandidateSearchFound:
            LD   HL,(CandidateScratchScan)
            LD   (CandidateCursor),HL
            LD   A,(CandidateScratchFlag)
            OR   A
            LD   A,CandidateStatusFound
            JR   Z,CandidateSearchStatus
            LD   A,CandidateStatusWrapped
CandidateSearchStatus:
            LD   (CandidateStatus),A
            OR   A
            RET

CandidateSearchNoQuery:
            LD   A,CandidateStatusNoQuery
            JR   CandidateSearchFailure
CandidateSearchNotFound:
            LD   A,CandidateStatusMissing
CandidateSearchFailure:
            LD   (CandidateStatus),A
            CALL CandidateRing
            SCF
            RET

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateMatch:
            LD   (CandidateScratchScan),HL
            LD   A,(CandidateCommittedLength)
            LD   E,A
            LD   D,0
            ADD  HL,DE
            LD   DE,(CandidateTextLength)
            OR   A
            SBC  HL,DE
            JR   C,CandidateMatchFits
            JR   Z,CandidateMatchFits
            LD   A,1
            OR   A
            RET
CandidateMatchFits:
            LD   HL,(CandidateScratchScan)
            LD   DE,CandidateTextBase
            ADD  HL,DE
            LD   DE,CandidateCommittedBuffer
            LD   A,(CandidateCommittedLength)
            LD   B,A
CandidateMatchLoop:
            LD   A,(DE)
            CP   (HL)
            RET  NZ
            INC  DE
            INC  HL
            DJNZ CandidateMatchLoop
            XOR  A
            RET
CandidateScanCodeEnd:
CandidateCodeEnd:
            .end
