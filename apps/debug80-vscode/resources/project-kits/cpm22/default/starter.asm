; CP/M transient-program starter. Assemble at $0100, then add the resulting
; .COM file to a CP/M disk image before invoking it from the CCP.

        .org    $0100

Start:
        ld      de,Message
        ld      c,9
        call    $0005
        ret

Message:
        .db     "Hello from Debug80 CP/M",13,10,"$"
