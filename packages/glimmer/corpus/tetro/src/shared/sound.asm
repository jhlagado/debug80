; Generic speaker divider state machine.
; Game-local sound event wrappers load
; duration and divider values, then jump to
; SndStart.

; SndStart —
; (Re)start a sound cue.
; A contains the duration in scan ticks. C contains
; the divider; smaller values mean a shorter
; half-period and higher pitch.
; Resets SpeakerPort to off before the new cue.
;!      in        A,C
;!      out       carry,zero
;!      clobbers  A
SndStart:
        LD      (CM_SNDTM),A
        LD      A,C
        LD      (CM_SNDD0),A
        LD      (CM_SNDDV),A
        XOR     A
        LD      (CM_SPKRP),A
        RET

; SndService —
; Tick the speaker state machine once per scan.
; Decrements SoundTimer; silences when it hits
; zero. While active, counts SndDivCount down
; and toggles SpeakerBit on each reload.
;!      out       carry,zero
;!      clobbers  A
SS_SNDSR:
        LD      A,(CM_SNDTM)
        OR      A
        RET     Z
        DEC     A
        LD      (CM_SNDTM),A
        JR      NZ,SS_SNDCT
        XOR     A
        LD      (CM_SPKRP),A
        LD      (CM_SNDDV),A
        RET
SS_SNDCT:
        LD      A,(CM_SNDDV)
        DEC     A
        LD      (CM_SNDDV),A
        RET     NZ
        LD      A,(CM_SNDD0)
        LD      (CM_SNDDV),A
        LD      A,(CM_SPKRP)
        XOR     SC_SPKRB
        LD      (CM_SPKRP),A
        RET
