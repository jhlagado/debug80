; RAM layout.
; Mutable program state. InitState sets explicit
; defaults and clears buffers that need a known
; startup value.
RamStart:
PlayerX:
        .db      0

PlayerY:
        .db      0

MoveCooldown:
        .db      0

GravityCooldown:
        .db      0

CurGravPeriod:
        .db      0

LastKey:
        .db      0

PendingX:
        .db      0

PendingY:
        .db      0

ShiftCount:
        .db      0

CurPiecePtr:
        .dw      0

CurPieceIndex:
        .db      0

CurrentRotation:
        .db      0

CurPieceRight:
        .db      0

CurPieceColor:
        .db      0

NextPieceIndex:
        .db      0

PendingRotation:
        .db      0

Paused:
        .db      0

DropLockout:
        .db      0

GameOver:
        .db      0

; 16-bit restart-delay countdown.
; Accessed as a word via LD HL,(GOverKeyGateLo)
; and written back as HL.
GOverKeyGate:
        .dw      0
GOverKeyGateLo   .equ     GOverKeyGate
GOverKeyGateHi   .equ     GOverKeyGate + 1

ActPieceEnabled:
        .db      0

ClearPending:
        .db      0

ClearMask:
        .db      0

ClearTimer:
        .db      0

LinesClearTotal:
        .db      0

; 16-bit Score.
; Accessed as a word via LD HL,(ScoreLo);
; ScoreHi is the high byte, cleared by
; InitStateBase.
Score:
        .dw      0
ScoreLo        .equ     Score
ScoreHi        .equ     Score + 1

SplashTimer:
        .db      0

RngSeed:
        .db      0

InputLockout:
        .db      0

HudScanIndex:
        .db      0

SpeakerPort:
        .db      0

SoundTimer:
        .db      0

SndDivReload:
        .db      0

SndDivCount:
        .db      0

HudSegBuffer:
        .ds      6

; Full-matrix wrap counter.
; ScanNext increments on each framebuffer wrap.
; Used only by SplashState for RNG entropy;
; not used for gravity, input, or pacing timers.
FramePhase:
        .db      0

ScanMask:
        .db      0

ScanPtr:
        .dw      0

BoardRows:
        .ds      RowCount

BoardRed:
        .ds      RowCount

BoardGreen:
        .ds      RowCount

BoardBlue:
        .ds      RowCount

BoardEmpty:
        .db      0

Framebuffer:
        .ds      FramebufferBytes

; Off-screen compose buffer.
; The live Framebuffer is rebuilt from here while
; the matrix is blank between scanned frames.
FramebufferBack:
        .ds      FramebufferBytes

RamEnd:
