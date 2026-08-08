; Phase 0 gate. Reads source bytes until the 0xFF terminator, writes each
; one twice to the code port, then reports success and halts.
;
; Exercises every part of the bootstrap contract that has no compiler in it:
; the source port and its terminator, the code port, the status port, and
; halting as the success condition.

.org $0000

Start:
_next:
    IN   A,($00)        ; readSourceByte
    CP   $FF            ; framing terminator
    JR   Z,_done
    OUT  ($01),A        ; writeCodeByte
    OUT  ($01),A        ; ... twice
    JR   _next

_done:
    XOR  A
    OUT  ($02),A        ; setExitStatus 0
    HALT
