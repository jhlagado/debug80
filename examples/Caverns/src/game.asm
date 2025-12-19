START:
        CALL    initState
        LD      HL,title
        SYS_PUTS
        CALL    printCurrentRoomDescription

READLOOP:
        LD      HL,promptStr
        SYS_PUTS
        LD      HL,BUF
        LD      B,32           ; buffer length including terminator
        CALL    readLn
        LD      A,(BUF)        ; treat control/empty as termination
        CP      0x20
        JR      C,DONE         ; empty or control -> exit

        CALL    handleInputLine
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

        ; Initialize object locations (minimal for now: compass in room 1).
        LD      HL,objectLocation
        LD      B,objectCount
is_clear_obj:
        LD      (HL),0
        INC     HL
        DJNZ    is_clear_obj
        LD      A,roomDarkRoom
        LD      (objectLocation+objCompass-1),A
        RET

; ---------------------------------------------------------
; printCurrentRoomDescription
; Prints the primary description for playerLocation via roomDesc1Table.
; ---------------------------------------------------------
printCurrentRoomDescription:
        LD      A,(playerLocation)     ; 1-based room id
        LD      HL,roomDesc1Table
        CALL    printDescription
        LD      A,(playerLocation)     ; 1-based room id
        LD      HL,roomDesc2Table
        CALL    printDescription
        CALL    listRoomObjects
        CALL    printNewLine           ; blank line after the whole response
        RET

; ---------------------------------------------------------
; printDescription
; HL = base of DW table, A = 1-based index
; Loads word pointer and prints if non-zero.
; ---------------------------------------------------------
printDescription:
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
        JP      printLine

; ---------------------------------------------------------
; printLine
; HL = 0-terminated string pointer
; Prints the string then CRLF.
; ---------------------------------------------------------
printLine:
        SYS_PUTS
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; printNewLine
; Prints a blank line (CRLF).
; ---------------------------------------------------------
printNewLine:
        LD      HL,strCRLF
        SYS_PUTS
        RET

; ---------------------------------------------------------
; listRoomObjects
; Prints a list of visible objects in the current room.
; Current scope: only objects 7..24 (as per original index map).
; ---------------------------------------------------------
listRoomObjects:
        LD      A,(playerLocation)
        LD      C,A                    ; C = current room
        LD      HL,objectLocation
        LD      B,objCreatureCount     ; skip creatures 1..6
lo_skip_creatures:
        INC     HL
        DJNZ    lo_skip_creatures

        LD      B,objectItemCount      ; objects 7..24 count
        LD      D,0                    ; printed-any flag
        LD      E,firstObjectIndex     ; current object id (7..24)
lo_loop:
        LD      A,(HL)                 ; A = location
        CP      C
        JR      NZ,lo_next
        LD      A,D
        OR      A
        JR      NZ,lo_print_obj
        CALL    printNewLine           ; blank line between room desc and header
        PUSH    DE                     ; preserve current object id (E)
        PUSH    HL
        LD      HL,strSeeObjects
        CALL    printLine
        POP     HL
        POP     DE
        LD      D,1
lo_print_obj:
        ; print: adjective includes article ("a"/"an") + noun
        PUSH    DE                     ; preserve current object id (E)
        PUSH    HL
        LD      A,E
        CALL    printObjectAdjNoun
        POP     HL
        CALL    printNewLine
        POP     DE
lo_next:
        INC     HL
        INC     E
        DJNZ    lo_loop
        RET

; ---------------------------------------------------------
; printObjectAdjNoun
; A = object id (7..24)
; Prints adjective then noun via tables.
; ---------------------------------------------------------
printObjectAdjNoun:
        SUB     firstObjectIndex
        LD      B,A                    ; save 0-based index (SYS_PUTS clobbers C)
        LD      C,A                    ; 0-based index into object tables
        LD      HL,objectNameNameTable
        LD      A,B
        CALL    printWordTableEntry0Based
        LD      HL,objectNameNounTable
        LD      A,B
        CALL    printWordTableEntry0Based
        RET

; ---------------------------------------------------------
; printWordTableEntry0Based
; HL = base of DW table, A = 0-based index
; Loads word pointer and prints if non-zero.
; ---------------------------------------------------------
printWordTableEntry0Based:
        ADD     A,A                    ; index * 2
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

; ---------------------------------------------------------
; handleInputLine
; Interprets a minimal command set:
; - N/S/E/W (single-letter) attempts to move.
; Otherwise echoes the line as before.
; ---------------------------------------------------------
handleInputLine:
        LD      HL,BUF                  ; echo user's input so prior actions are visible
        SYS_PUTS
        CALL    printNewLine
        CALL    printNewLine

        CALL    buildInputPadded
        CALL    scanInputTokens
        JP      dispatchScannedCommand

echoLine:
        LD      HL,strEh
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; buildInputPadded
; Builds `inputBuffer` as: " " + BUF + " " + 0
; This lets us SEARCH for " word " tokens like the original BASIC.
; ---------------------------------------------------------
buildInputPadded:
        LD      HL,inputBuffer
        LD      A,' '
        LD      (HL),A
        INC     HL

        LD      DE,BUF
bip_copy:
        LD      A,(DE)
        OR      A
        JR      Z,bip_done
        LD      (HL),A
        INC     HL
        INC     DE
        JR      bip_copy

bip_done:
        LD      A,' '
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A
        RET

; ---------------------------------------------------------
; containsTokenCI
; Case-insensitive substring search.
;
; Inputs:
;   HL = haystack (0-terminated)
;   DE = needle (0-terminated)
;
; Returns:
;   Z set if found, Z clear if not found
;
; Clobbers:
;   AF, BC, DE, HL
; ---------------------------------------------------------
containsTokenCI:
ct_outer:
        LD      A,(HL)
        OR      A
        JR      Z,ct_notfound

        PUSH    HL
        PUSH    DE
ct_inner:
        LD      A,(DE)
        OR      A
        JR      Z,ct_found
        LD      B,A

        LD      A,(HL)
        OR      A
        JR      Z,ct_mismatch
        CALL    toUpperA
        LD      C,A
        LD      A,B
        CALL    toUpperA
        CP      C
        JR      NZ,ct_mismatch

        INC     HL
        INC     DE
        JR      ct_inner

ct_mismatch:
        POP     DE
        POP     HL
        INC     HL
        JR      ct_outer

ct_found:
        POP     DE
        POP     HL
        CP      A              ; Z=1
        RET

ct_notfound:
        OR      1              ; Z=0
        RET

; ---------------------------------------------------------
; scanInputTokens
; Populates:
;   verbPatternIndex = verbId (1..verbTokenCount) or 0
;   currentObjectIndex = noun1 (1..24) or 0
;   targetLocation = noun2 (1..24) or 0
; based on the content of inputBuffer.
; ---------------------------------------------------------
scanInputTokens:
        XOR     A
        LD      (verbPatternIndex),A
        LD      (currentObjectIndex),A
        LD      (targetLocation),A

        ; Scan verbs (first match wins).
        LD      IX,verbTokenTable
        LD      B,verbTokenCount
        LD      C,1
sv_loop:
        PUSH    BC
        LD      E,(IX+0)
        LD      D,(IX+1)               ; DE = token ptr
        LD      HL,inputBuffer         ; HL = input
        CALL    containsTokenCI
        POP     BC
        JR      Z,sv_hit
        INC     IX
        INC     IX
        INC     C
        DJNZ    sv_loop
        JR      sn_start
sv_hit:
        LD      A,C
        LD      (verbPatternIndex),A

sn_start:
        ; Scan nouns: capture first two distinct matches.
        LD      IX,nounTokenTable
        LD      B,objectCount          ; 24 entries (1..24)
        LD      C,1
sn_loop:
        PUSH    BC
        LD      E,(IX+0)
        LD      D,(IX+1)               ; DE = token ptr
        LD      HL,inputBuffer         ; HL = input
        CALL    containsTokenCI
        POP     BC
        JR      NZ,sn_next

        LD      A,(currentObjectIndex)
        OR      A
        JR      Z,sn_set1
        CP      C
        JR      Z,sn_next
        LD      A,(targetLocation)
        OR      A
        JR      NZ,sn_next
        LD      A,C
        LD      (targetLocation),A
        JR      sn_next
sn_set1:
        LD      A,C
        LD      (currentObjectIndex),A

sn_next:
        INC     IX
        INC     IX
        INC     C
        DJNZ    sn_loop
        RET

; ---------------------------------------------------------
; dispatchScannedCommand
; Executes the command based on scanned verb + nouns.
; ---------------------------------------------------------
dispatchScannedCommand:
        LD      A,(verbPatternIndex)
        OR      A
        JP      Z,echoLine

        ; Verb ids (match tables.asm verbTokenTable order)
        CP      1
        JP      Z,cmdLook
        CP      2
        JP      Z,cmdList
        CP      3
        JP      Z,cmdList              ; invent alias
        CP      4
        JP      Z,cmdQuit
        CP      5
        JP      Z,cmdGalar
        CP      6
        JP      Z,cmdApe
        CP      7
        JP      Z,cmdGetGeneric
        CP      8
        JP      Z,cmdGetGeneric        ; take alias
        CP      9
        JP      Z,cmdDropGeneric
        CP      10
        JP      Z,cmdNorth
        CP      11
        JP      Z,cmdSouth
        CP      12
        JP      Z,cmdWest
        CP      13
        JP      Z,cmdEast
        JP      echoLine

; Minimal quit/galar/ape placeholders for now.
cmdQuit:
        HALT
cmdGalar:
        LD      HL,strMagicWind
        CALL    printLine
        CALL    printNewLine
        RET
cmdApe:
        LD      HL,strCryptWall
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; cmdGetGeneric / cmdDropGeneric
; Uses scanned nouns: chooses the first object noun (7..24).
; ---------------------------------------------------------
cmdGetGeneric:
        CALL    selectScannedObject
        OR      A
        JP      Z,cmdGetUnknown
        LD      B,A                    ; object index (7..24)
        CALL    doGetObjectIndex
        RET

cmdDropGeneric:
        CALL    selectScannedObject
        OR      A
        JP      Z,cmdDropUnknown
        LD      B,A
        CALL    doDropObjectIndex
        RET

selectScannedObject:
        LD      A,(currentObjectIndex)
        CP      firstObjectIndex
        JR      NC,sso_ret
        LD      A,(targetLocation)
        CP      firstObjectIndex
sso_ret:
        RET

; B = object index (7..24)
doGetObjectIndex:
        LD      A,(playerLocation)
        LD      C,A                    ; room
        LD      A,B
        DEC     A
        LD      L,A
        LD      H,0
        LD      DE,objectLocation
        ADD     HL,DE
        LD      A,(HL)
        CP      C
        JP      NZ,cmdGetCantSee
        LD      A,roomCarried
        LD      (HL),A
        CALL    printCurrentRoomDescription
        RET

; B = object index (7..24)
doDropObjectIndex:
        LD      A,B
        DEC     A
        LD      L,A
        LD      H,0
        LD      DE,objectLocation
        ADD     HL,DE
        LD      A,(HL)
        CP      roomCarried
        JP      NZ,cmdDropCantSee
        LD      A,(playerLocation)
        LD      (HL),A
        CALL    printCurrentRoomDescription
        RET

cmdNorth:
        LD      A,dirNorth
        JR      doMove
cmdSouth:
        LD      A,dirSouth
        JR      doMove
cmdWest:
        LD      A,dirWest
        JR      doMove
cmdEast:
        LD      A,dirEast
        ; fallthrough

; doMove
; A = dir index (0..3)
doMove:
        LD      C,A                    ; C = dir index
        LD      A,(playerLocation)     ; 1-based room id
        OR      A
        RET     Z
        DEC     A                      ; 0-based room index
        ADD     A,A                    ; *2
        ADD     A,A                    ; *4
        ADD     A,C                    ; + dir
        LD      E,A
        LD      D,0
        LD      HL,movementTable
        ADD     HL,DE
        LD      A,(HL)                 ; A = destination (0/128/some room id)
        OR      A
        JR      Z,cantMove
        CP      exitFatal
        JR      Z,fatalMove

        LD      (playerLocation),A
        CALL    printCurrentRoomDescription
        RET

cantMove:
        LD      HL,strCantGoThatWay
        CALL    printLine
        CALL    printNewLine
        RET

fatalMove:
        LD      HL,strFatalFall
        CALL    printLine
        HALT

cmdLook:
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdGet
; Supports: "get compass" / "take compass"
; ---------------------------------------------------------
cmdGet:
        ; Advance past verb then spaces.
        CALL    skipWord
        CALL    skipSpaces

        ; Only "compass" for now.
        PUSH    HL
        LD      DE,wordCOMPASS
        CALL    matchWord
        POP     HL
        JR      NZ,cmdGetUnknown

        LD      A,(playerLocation)
        LD      B,A                    ; B = room
        LD      A,(objectLocation+objCompass-1)
        CP      B
        JR      NZ,cmdGetCantSee

        ; Mark carried.
        LD      A,roomCarried
        LD      (objectLocation+objCompass-1),A
        CALL    printCurrentRoomDescription
        RET

cmdGetCantSee:
        LD      HL,strCantSeeIt
        CALL    printLine
        CALL    printNewLine
        RET

cmdGetUnknown:
        LD      HL,strEh
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; cmdDrop
; Supports: "drop compass"
; ---------------------------------------------------------
cmdDrop:
        ; Advance past verb then spaces.
        CALL    skipWord
        CALL    skipSpaces

        ; Only "compass" for now.
        PUSH    HL
        LD      DE,wordCOMPASS
        CALL    matchWord
        POP     HL
        JR      NZ,cmdDropUnknown

        LD      A,(objectLocation+objCompass-1)
        CP      roomCarried
        JR      NZ,cmdDropCantSee

        LD      A,(playerLocation)
        LD      (objectLocation+objCompass-1),A
        CALL    printCurrentRoomDescription
        RET

cmdDropCantSee:
        LD      HL,strCantSeeIt
        CALL    printLine
        CALL    printNewLine
        RET

cmdDropUnknown:
        LD      HL,strEh
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; cmdList
; Prints carried objects (objectLocation == roomCarried).
; Current scope: objects 7..24 only.
; ---------------------------------------------------------
cmdList:
        LD      HL,strCarryingPrefix
        SYS_PUTS

        LD      HL,objectLocation
        LD      B,objCreatureCount     ; skip creatures 1..6
cl_skip_creatures:
        INC     HL
        DJNZ    cl_skip_creatures

        LD      B,objectItemCount      ; objects 7..24 count
        LD      D,0                    ; printed-any flag
        LD      E,firstObjectIndex     ; current object id (7..24)
cl_loop:
        LD      A,(HL)
        CP      roomCarried
        JR      NZ,cl_next

        LD      A,D
        OR      A
        JR      Z,cl_first
        LD      HL,strCommaSpace
        SYS_PUTS
        JR      cl_print
cl_first:
        LD      D,1
cl_print:
        PUSH    DE                     ; preserve object id (E)
        PUSH    HL
        LD      A,E
        CALL    printObjectAdjNoun
        POP     HL
        POP     DE

cl_next:
        INC     HL
        INC     E
        DJNZ    cl_loop

        LD      A,D
        OR      A
        JR      NZ,cl_done
        LD      HL,strNothing
        SYS_PUTS
cl_done:
        CALL    printNewLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; matchWord
; HL = input position, DE = pointer to uppercase word (0-terminated)
; Returns Z if the word matches at HL and is followed by space or 0.
; Case-insensitive for ASCII letters.
; ---------------------------------------------------------
matchWord:
mw_loop:
        LD      A,(DE)
        OR      A
        JR      Z,mw_done
        LD      B,A
        LD      A,(HL)
        OR      A
        JR      Z,mw_fail
        CALL    toUpperA
        CP      B
        JR      NZ,mw_fail
        INC     HL
        INC     DE
        JR      mw_loop
mw_done:
        LD      A,(HL)
        OR      A
        RET     Z
        CP      ' '
        RET     Z
mw_fail:
        OR      1
        RET

; HL -> skip leading spaces, returns HL at first non-space/0
skipSpaces:
ss_loop:
        LD      A,(HL)
        CP      ' '
        RET     NZ
        INC     HL
        JR      ss_loop

; HL -> skip current word, returns HL at first space/0 after it
skipWord:
sw_loop:
        LD      A,(HL)
        OR      A
        RET     Z
        CP      ' '
        RET     Z
        INC     HL
        JR      sw_loop

; toUpperA
; A = ASCII char; returns uppercase for a-z.
toUpperA:
        CP      'a'
        RET     C
        CP      'z'+1
        RET     NC
        AND     $DF
        RET

wordGO:     DEFB    "GO",0
wordLOOK:   DEFB    "LOOK",0
wordLIST:   DEFB    "LIST",0
wordINVENT: DEFB    "INVENT",0
wordDROP:   DEFB    "DROP",0
wordGET:    DEFB    "GET",0
wordTAKE:   DEFB    "TAKE",0
wordCOMPASS:DEFB    "COMPASS",0
wordNORTH:  DEFB    "NORTH",0
wordSOUTH:  DEFB    "SOUTH",0
wordWEST:   DEFB    "WEST",0
wordEAST:   DEFB    "EAST",0

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
