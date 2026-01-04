; readLn: HL buffer, B = buffer length (including terminator)
; Reads until newline (0x0A) or buffer full-1, echoes as it reads,
; zero-terminates. Returns with A holding last read (newline).
readLn:
        DEC     B               ; reserve space for terminator
        LD      A,B
        OR      A
        RET     Z               ; no room
rl_loop:
        SYS_GETC
        CP      0x0D            ; ignore CR
        JR      Z,rl_loop
        CP      0x0A
        JR      Z,rl_done
        LD      (HL),A
        INC     HL
        DJNZ    rl_loop
rl_done:
        LD      (HL),0
        RET
