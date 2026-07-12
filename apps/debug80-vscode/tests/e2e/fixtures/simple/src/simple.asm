START:
        NOP
        IN      A,(TERM_STATUS)
VALUE:  EQU     $0000
        JP      START
