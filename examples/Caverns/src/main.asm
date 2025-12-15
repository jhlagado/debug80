        .include "constants.asm"
        .include "macros.asm"
        .include "system.asm"
        .include "strings.asm"
        .include "tables.asm"
        .include "variables.asm"

        ; Main program start
        ORG     APPSTART

START:
        CALL    initState
        CALL    printCurrentRoomDescription
        LD      A,LF
        SYS_PUTC

READLOOP:
        LD      HL,BUF
        LD      B,32           ; buffer length including terminator
        CALL    readLn
        LD      A,(BUF)        ; treat control/empty as termination
        CP      0x20
        JR      C,DONE         ; empty or control -> exit

        LD      HL,BUF
        SYS_PUTS
        LD      A,0x0A
        SYS_PUTC
        JR      READLOOP

DONE:   LD      HL,DONE_MSG
        SYS_PUTS
        HALT

; ---------------------------------------------------------
; initState
; Initializes a minimal subset of game state (expand incrementally).
; ---------------------------------------------------------
initState:
        ; Clear screen (ANSI ESC[2J ESC[H])
        LD      HL,clear_seq
        SYS_PUTS

        LD      A,roomDarkRoom
        LD      (playerLocation),A

        LD      A,boolTrue
        LD      (candleIsLitFlag),A

        XOR     A
        LD      (bridgeCondition),A
        LD      (drawbridgeState),A
        LD      (waterExitLocation),A
        LD      (gateDestination),A
        LD      (teleportDestination),A
        LD      (secretExitLocation),A
        LD      (generalFlagJ),A
        LD      (hostileCreatureIndex),A
        LD      (reshowFlag),A
        LD      (fearCounter),A
        LD      (turnCounter),A
        LD      (swordSwingCount),A
        LD      (score),A
        RET

; ---------------------------------------------------------
; printCurrentRoomDescription
; Prints the primary description for playerLocation via roomDesc1Table.
; ---------------------------------------------------------
printCurrentRoomDescription:
        LD      A,(playerLocation)     ; 1-based room id
        LD      HL,roomDesc1Table
        CALL    printWordTableEntryIfNotNull
        RET

; ---------------------------------------------------------
; printWordTableEntryIfNotNull
; HL = base of DW table, A = 1-based index
; Loads word pointer and prints if non-zero.
; ---------------------------------------------------------
printWordTableEntryIfNotNull:
        OR      A
        RET     Z
        DEC     A
        ADD     A,A                    ; (index-1) * 2
        LD      E,A
        LD      D,0
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      A,D
        OR      E
        RET     Z
        EX      DE,HL
        SYS_PUTS
        RET

; readLn: HL buffer, B = buffer length (including terminator)
; Reads until newline (0x0A) or buffer full-1, echoes as it reads,
; zero-terminates. Returns with A holding last read (newline).
readLn:
        DEC     B               ; reserve space for terminator
        LD      A,B
        OR      A
        RET     Z               ; no room
rl_loop:
        ; CALL    term_getc
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

DONE_MSG: DEFB  "Done.",0x0A,0
