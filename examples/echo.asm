; Minimal Z80 echo-like stub for testing: LD A,05h ; ADD A,03h ; HALT

        ORG     0000h

START:  LD      A,05h   ; load 5 into A
        ADD     A,03h   ; add 3 => A = 8
        HALT            ; stop
