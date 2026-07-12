; Pacmo fixed-dwell frame scanner.
; Scans all eight matrix rows with a fixed delay,
; then blanks the matrix so game work can run
; without changing any visible row dwell time.

; ScanFrame —
; Emit one full 8-row matrix frame. Each row is
; left on for PacScanDwell DJNZ iterations.
; Sound and HUD services still run once per row
; through ScanTick. The matrix is blank on return.
;!      out       carry
;!      clobbers  A,BC,DE,HL
@ScanFrame:
        LD      B,RowCount
ScanFrameLp:
        PUSH    BC
        CALL    ScanTick
        CALL    ScanDwell
        POP     BC
        DJNZ    ScanFrameLp
        XOR     A
        OUT     (PortRow),A
        RET

; ScanDwell —
; Fixed visible-row dwell delay.
;!      clobbers  B
ScanDwell:
        LD      B,PacScanDwell
ScanDwellLp:
        DJNZ    ScanDwellLp
        RET
