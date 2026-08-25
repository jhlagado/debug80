; CP/M transient-program starter. Debug80 assembles this at $0100, writes the
; matching .COM artifact, and installs MAIN.COM in the session's drive A.

        .org    $0100

Start:
        ld      de,Message
        ld      c,9
        call    $0005
        ret

Message:
        .db     "Hello from Debug80 CP/M",13,10,"$"
