; RAM layout.
; Mutable program state. InitState sets explicit
; defaults and clears buffers that need a known
; startup value.
RamStart:
PlayerX:
        DB      0

PlayerY:
        DB      0

CM_MVCLD:
        DB      0

TW_GRVTY:
        DB      0

TW_CRGRV:
        DB      0

LastKey:
        DB      0

PendingX:
        DB      0

PendingY:
        DB      0

TW_SHFTC:
        DB      0

TW_CRPCP:
        DW      0

TW_CRPCN:
        DB      0

TW_CRRNT:
        DB      0

TW_CRPCR:
        DB      0

TW_CRPCC:
        DB      0

TW_NXTPC:
        DB      0

TW_PNDNG:
        DB      0

Paused:
        DB      0

TW_DRPLC:
        DB      0

GameOver:
        DB      0

; 16-bit restart-delay countdown.
; Accessed as a word via LD HL,(GOverKeyGateLo)
; and written back as HL.
TW_GVRKY:
        DW      0
TW_GVRK1   EQU     TW_GVRKY
TW_GVRK0   EQU     TW_GVRKY + 1

TW_ACTPC:
        DB      0

TW_CLRPN:
        DB      0

TW_CLRMS:
        DB      0

TW_CLRTM:
        DB      0

TW_LNSCL:
        DB      0

; 16-bit Score.
; Accessed as a word via LD HL,(ScoreLo);
; ScoreHi is the high byte, cleared by
; InitStateBase.
Score:
        DW      0
ScoreLo        EQU     Score
ScoreHi        EQU     Score + 1

TW_SPLSH:
        DB      0

RngSeed:
        DB      0

TW_INPTL:
        DB      0

CM_HDSCN:
        DB      0

CM_SPKRP:
        DB      0

CM_SNDTM:
        DB      0

CM_SNDD0:
        DB      0

CM_SNDDV:
        DB      0

CM_HDSGB:
        DS      6

; Full-matrix wrap counter.
; ScanNext increments on each framebuffer wrap.
; Used only by SplashState for RNG entropy;
; not used for gravity, input, or pacing timers.
CM_FRMPH:
        DB      0

ScanMask:
        DB      0

ScanPtr:
        DW      0

TW_BRDRW:
        DS      (RowCount)

BoardRed:
        DS      (RowCount)

TW_BRDGR:
        DS      (RowCount)

TW_BRDBL:
        DS      (RowCount)

TW_BRDMP:
        DB      0

CM_FRMBF EQU $

; Off-screen compose buffer.
; The live Framebuffer is rebuilt from here while
; the matrix is blank between scanned frames.
CM_FRMB0 EQU CM_FRMBF + 32

RamEnd EQU CM_FRMB0 + 32
