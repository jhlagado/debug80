printBanner:
        LD      HL,MSG_BANNER
        SYS_PUTS
        RET

printPrompt:
        LD      HL,MSG_PROMPT
        SYS_PUTS
        RET

printLine:
        SYS_PUTS
        LD      A,LF
        SYS_PUTC
        RET
