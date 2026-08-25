; Dedicated committed and staging query buffers.

CandidateTextBase         .equ $2000
CandidateTextLength       .equ $1EC8
CandidateCursor           .equ $1ECA
CandidateStatus           .equ $1ED3
CandidateScratchStart     .equ $1ED7
CandidateScratchScan      .equ $1ED9
CandidateScratchFlag      .equ $1EDB
CandidateBellCount        .equ $F000
CandidatePromptCursor     .equ $F001
CandidatePromptRow        .equ $F010
CandidatePromptAttributes .equ $F060

CandidateNewWorkspaceStart .equ $1EE4
CandidateCommittedLength   .equ CandidateNewWorkspaceStart
CandidateCommittedBuffer   .equ CandidateCommittedLength+1
CandidateStagingLength     .equ CandidateCommittedBuffer+64
CandidateStagingBuffer     .equ CandidateStagingLength+1
CandidateNewWorkspaceEnd   .equ CandidateStagingBuffer+64
CandidateOverlayBytes      .equ 0
CandidateActiveLength      .equ CandidateStagingLength
CandidateActiveBuffer      .equ CandidateStagingBuffer

            .org $0100
CandidateCodeStart:
CandidateStorageCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateBegin:
            LD   HL,CandidateCommittedLength
            LD   DE,CandidateStagingLength
            JP   CandidateCopyQuery

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CandidateCommit:
            LD   HL,CandidateStagingLength
            LD   DE,CandidateCommittedLength
            JP   CandidateCopyQuery

.routine out A,carry,zero clobbers sign,parity,halfCarry
CandidateCancel:
            XOR  A
            RET
CandidateStorageCodeEnd:

            .include "common.asmi"
CandidateCodeEnd:
            .end
