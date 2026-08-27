; CP/M transient-program starter. Debug80 assembles this at 0100H, writes the
; matching .COM artifact, and installs MAIN.COM in the session's drive A.

        ORG     0100H

START:
        LD      DE,MESSAGE
        LD      C,9
        CALL    0005H
        RET

MESSAGE:
        DB      "Hello from Debug80 CP/M",13,10,"$"
