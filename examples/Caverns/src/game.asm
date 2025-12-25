START:
        CALL    initState
        LD      HL,title
        SYS_PUTS
        CALL    printCurrentRoomDescription

READLOOP:
        LD      HL,promptStr
        SYS_PUTS
        XOR     A
        LD      (BUF),A                ; clear buffer to avoid stale echo
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

        ; Initialize creatures + objects from the original P(1..24) table.
        ; `objectLocationTable` is DW entries; the low byte is the room id.
        LD      HL,objectLocationTable
        LD      DE,objectLocation
        LD      B,objectCount
is_init_obj:
        LD      A,(HL)                 ; low byte = room id (0..255)
        LD      (DE),A
        INC     HL
        INC     HL                     ; skip high byte
        INC     DE
        DJNZ    is_init_obj
        RET

; ---------------------------------------------------------
; printCurrentRoomDescription
; Prints the primary description for playerLocation via roomDesc1Table.
; ---------------------------------------------------------
printCurrentRoomDescription:
        LD      A,(playerLocation)     ; 1-based room id
        LD      D,A                    ; D = current room (preserve across calls)
        CALL    isRoomTooDark          ; Z=1 if too dark to see
        JR      Z,pc_too_dark

        LD      A,D
        LD      HL,roomDesc1Table
        CALL    printDescription

        LD      A,(playerLocation)
        LD      D,A                    ; restore room after printDescription

        LD      A,D
        LD      HL,roomDesc2Table
        CALL    printDescription

        ; Dragon corpse only when dragon is dead in cave entrance clearing.
        LD      A,D
        CP      roomCaveEntranceClearing
        JR      NZ,pc_after_dragon
        LD      A,(objectLocation+objDragon-1)
        OR      A
        JR      NZ,pc_after_dragon
        LD      HL,strDragonCorpse
        CALL    printLine
pc_after_dragon:

        ; Drawbridge message when activated.
        LD      A,D
        CP      roomCastleLedge
        JR      NZ,pc_after_drawbridge
        LD      A,(drawbridgeState)
        CP      roomDrawbridge
        JR      NZ,pc_after_drawbridge
        LD      HL,strGoldBridge
        CALL    printLine
pc_after_drawbridge:

        ; Extra flavor line in select rooms.
        LD      A,D
        LD      HL,darkCavernRoomList
        CALL    containsByteListZeroTerm
        JR      NZ,pc_lists
        LD      HL,strDarkCavern
        CALL    printLine

pc_lists:
        LD      A,D
        CALL    updateDrawbridgeState
        CALL    updateCandleByTurns
        CALL    listRoomObjects
        CALL    listRoomCreatures
        CALL    printNewLine           ; blank line after the whole response
        RET

pc_too_dark:
        LD      HL,strTooDark
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; updateCandleByTurns
; candle timing using turnCounter.
;
; Behavior:
; - At turn 201 (U > 200): prints "Your candle is growing dim."
; - At turn 230 (U >= 230): sets candleIsLitFlag = 0 and prints "In fact...it went out!"
;
; Notes:
; - Only runs when the room is visible (not "too dark").
; - Prints messages only on the threshold turns (avoids repeated spam).
;
; Clobbers:
;   AF
; ---------------------------------------------------------
updateCandleByTurns:
        LD      A,(candleIsLitFlag)
        OR      A
        RET     Z

        LD      A,(turnCounter)
        CP      candleDimTurn+1
        JR      Z,uc_dim
        CP      candleOutTurn
        RET     NZ

        XOR     A
        LD      (candleIsLitFlag),A
        LD      HL,strCandleOut
        CALL    printLine
        RET

uc_dim:
        LD      HL,strCandleDim
        CALL    printLine
        RET

; ---------------------------------------------------------
; updateDrawbridgeState
; A = room id
; Sets drawbridgeState once the player reaches roomDrawbridge.
;
; Clobbers:
;   AF
; ---------------------------------------------------------
updateDrawbridgeState:
        CP      roomDrawbridge
        RET     NZ
        LD      A,roomDrawbridge
        LD      (drawbridgeState),A
        RET

; ---------------------------------------------------------
; isRoomTooDark
; A = room id (1..roomMax)
;
; Returns:
;   Z set if room is too dark to see anything.
;   Z clear otherwise.
;
; Rules:
;   Rooms < roomDarkCavernA are always visible.
;   Rooms >= roomDarkCavernA require a lit candle that is carried or present.
;
; Clobbers:
;   AF, BC, HL
; ---------------------------------------------------------
isRoomTooDark:
        LD      B,A                    ; B = room
        CP      roomDarkCavernA
        JR      NC,ird_check_candle
        OR      1                      ; visible => Z=0
        RET

ird_check_candle:
        LD      A,(candleIsLitFlag)
        OR      A
        RET     Z                      ; unlit => too dark (Z=1)

        ; Candle must be carried or in this room.
        LD      HL,objectLocation+objCandle-1
        LD      A,(HL)
        CP      roomCarried
        JR      Z,ird_visible
        CP      B
        JR      Z,ird_visible
        XOR     A                      ; too dark => Z=1
        RET

ird_visible:
        OR      1                      ; visible => Z=0
        RET

; ---------------------------------------------------------
; containsByteListZeroTerm
; HL = byte list terminated by 0
; A  = value to search for (0 is not a valid search value)
;
; Returns:
;   Z set if found, Z clear if not found.
;
; Clobbers:
;   AF, HL
; ---------------------------------------------------------
containsByteListZeroTerm:
        LD      B,A                    ; B = search value
cb_loop:
        LD      A,(HL)
        OR      A
        JR      Z,cb_notfound
        CP      B
        RET     Z
        INC     HL
        JR      cb_loop

cb_notfound:
        OR      1                      ; ensure Z=0
        RET

; ---------------------------------------------------------
; listRoomCreatures
; Prints a list of visible creatures in the current room.
; Creatures are indices 1..6 in objectLocation[].
; ---------------------------------------------------------
listRoomCreatures:
        LD      A,(playerLocation)
        LD      C,A                    ; C = current room
        LD      HL,objectLocation
        LD      B,objCreatureCount     ; creatures 1..6
        LD      D,0                    ; printed-any flag
        LD      E,1                    ; creature index (1..6)
lc_loop:
        LD      A,(HL)
        CP      C
        JR      NZ,lc_next

        LD      A,D
        OR      A
        JR      NZ,lc_print
        CALL    printNewLine
        LD      HL,strSeeCreatures
        CALL    printLine
        LD      D,1
lc_print:
        PUSH    DE
        PUSH    HL
        LD      A,E
        CALL    printCreatureAdjNoun
        POP     HL
        CALL    printNewLine
        POP     DE
        LD      A,E
        CALL    maybePrintEncounter
lc_next:
        INC     HL
        INC     E
        DJNZ    lc_loop
        RET

; ---------------------------------------------------------
; printCreatureAdjNoun
; A = creature index (1..6)
; Prints adjective+article then noun via monster tables.
; ---------------------------------------------------------
printCreatureAdjNoun:
        DEC     A
        LD      B,A
        LD      HL,monsterNameTable
        LD      A,B
        CALL    printWordTableEntry0Based
        RET

; ---------------------------------------------------------
; maybePrintEncounter
; A = creature index (1..6)
; Prints special encounter text for wizard/dragon/goblin.
; ---------------------------------------------------------
maybePrintEncounter:
        CP      objWizard
        JR      Z,mpe_wizard
        CP      objDragon
        JR      Z,mpe_dragon
        CP      objGoblin
        JR      Z,mpe_goblin
        RET

mpe_wizard:
        CALL    printNewLine
        LD      HL,strEncWizard
        CALL    printLine
        RET

mpe_dragon:
        CALL    printNewLine
        LD      HL,strEncDragon1
        CALL    printLine
        RET

mpe_goblin:
        CALL    printNewLine
        LD      HL,strEncGoblin
        CALL    printLine
        RET

; ---------------------------------------------------------
; printDescription
; HL = base of DW table, A = 1-based index
; Loads word pointer and prints if non-zero.
; ---------------------------------------------------------
printDescription:
        OR      A
        RET     Z
        PUSH    DE
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
        JR      Z,pd_restore
        EX      DE,HL
        CALL    printLine
pd_restore:
        POP     DE
        RET

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
;
; Clobbers:
;   AF, BC, DE, HL
; ---------------------------------------------------------
printObjectAdjNoun:
        SUB     firstObjectIndex
        LD      B,A                    ; save 0-based index (SYS_PUTS clobbers C)
        LD      C,A                    ; 0-based index into object tables
        LD      HL,objectNameNameTable
        LD      A,B
        CALL    printWordTableEntry0Based
        RET

; A = object index (7..24)
printObjectAdjNounFromIndex:
        SUB     firstObjectIndex
        LD      B,A
        LD      HL,objectNameNameTable
        LD      A,B
        CALL    printWordTableEntry0Based
        RET

; ---------------------------------------------------------
; printWordTableEntry0Based
; HL = base of DW table, A = 0-based index
; Loads word pointer and prints if non-zero.
;
; Clobbers:
;   AF, BC, DE, HL
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
        LD      HL,BUF                  ; echo user's input
        SYS_PUTS
        CALL    printNewLine
        CALL    printNewLine

        ; Count moves (one per input line).
        LD      A,(turnCounter)
        INC     A
        LD      (turnCounter),A
        CALL    buildInputPadded
        CALL    scanInputTokens
        CALL    maybeBatCarry
        RET     Z
        CALL    maybeMonsterAttackOnMove
        CALL    dispatchScannedCommand
        CALL    maybeMonsterAttack
        RET

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
        LD      B,nounTokenCount       ; entries (1..nounTokenCount)
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
        JP      Z,cmdScore
        CP      5
        JP      Z,cmdQuit
        CP      6
        JP      Z,cmdGalar
        CP      7
        JP      Z,cmdApe
        CP      8
        JP      Z,cmdStage2
        CP      9
        JP      Z,cmdStage3
        CP      10
        JP      Z,cmdStage4
        CP      11
        JP      Z,cmdStage5
        CP      12
        JP      Z,cmdSave
        CP      13
        JP      Z,cmdLoad
        CP      14
        JP      Z,cmdRead
        CP      15
        JP      Z,cmdPray
        CP      16
        JP      Z,cmdGet
        CP      17
        JP      Z,cmdGet               ; take alias
        CP      18
        JP      Z,cmdDrop
        CP      19
        JP      Z,cmdDrop              ; put alias (stubbed same as drop for now)
        CP      20
        JP      Z,cmdStubAction         ; cut
        CP      21
        JP      Z,cmdStubAction         ; break
        CP      22
        JP      Z,cmdUnlock
        CP      23
        JP      Z,cmdOpen
        CP      24
        JP      Z,cmdKillAttack
        CP      25
        JP      Z,cmdKillAttack
        CP      26
        JP      Z,cmdLight
        CP      27
        JP      Z,cmdBurn
        CP      28
        JP      Z,cmdNeedHow            ; up
        CP      29
        JP      Z,cmdDown               ; down (rope descent)
        CP      30
        JP      Z,cmdNeedHow            ; jump
        CP      31
        JP      Z,cmdNeedHow            ; swim
        CP      32
        JP      Z,cmdNorth
        CP      33
        JP      Z,cmdSouth
        CP      34
        JP      Z,cmdWest
        CP      35
        JP      Z,cmdEast
        CP      36
        JP      Z,cmdHelp
        JP      echoLine

; Minimal quit/galar/ape placeholders for now.
cmdScore:
        CALL    computeScore
        LD      HL,strScorePrefix
        SYS_PUTS
        LD      A,(score)
        CALL    printByteDecA
        CALL    printNewLine
        CALL    printNewLine
        RET

cmdHelp:
        LD      HL,strHelpText
        CALL    printLine
        CALL    printNewLine
        RET

cmdQuit:
        CALL    computeScore

        LD      HL,strScorePrefix
        SYS_PUTS
        LD      A,(score)
        CALL    printByteDecA

        LD      HL,strScoreMid
        SYS_PUTS
        LD      A,(turnCounter)
        CALL    printByteDecA

        LD      HL,strScoreSuffix
        CALL    printLine
        CALL    printNewLine

        CALL    promptPlayAgain
        RET

; unreachable (promptPlayAgain handles restart/exit)
cmdGalar:
        LD      HL,strMagicWind
        CALL    printLine
        CALL    printNewLine
        LD      A,roomCaveEntry
        LD      (playerLocation),A
        CALL    printCurrentRoomDescription
        RET
cmdApe:
        ; Only meaningful in the crypt.
        LD      A,(playerLocation)
        CP      roomCrypt
        JR      Z,ca_do
        LD      HL,strNothingHappens
        CALL    printLine
        CALL    printNewLine
        RET
ca_do:
        LD      HL,strCryptWall
        CALL    printLine
        CALL    printNewLine
        ; Open the eastern wall exit via dynamic override.
        LD      A,roomTinyCell
        LD      (secretExitLocation),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; promptPlayAgain
; Asks "Another adventure?" and restarts on yes/ok.
; ---------------------------------------------------------
promptPlayAgain:
        LD      HL,strAnother
        SYS_PUTS

ppa_read:
        LD      HL,BUF
        LD      B,32
        CALL    readLn

        LD      HL,BUF
ppa_skip_space:
        LD      A,(HL)
        OR      A
        JR      Z,ppa_read
        CP      ' '
        JR      NZ,ppa_check
        INC     HL
        JR      ppa_skip_space

ppa_check:
        CP      0
        JR      Z,ppa_restart
        CP      'y'
        JR      Z,ppa_restart
        CP      'Y'
        JR      Z,ppa_restart
        CP      'n'
        JR      Z,ppa_exit
        CP      'N'
        JR      Z,ppa_exit
        LD      HL,strEh
        CALL    printLine
        JR      ppa_read

ppa_restart:
        CALL    initState
        LD      HL,title
        SYS_PUTS
        CALL    printCurrentRoomDescription
        RET

ppa_exit:
        HALT

; ---------------------------------------------------------
; cmdOpen / cmdUnlock
; Minimal behavior for the key:
; - Requires key noun (orderless) and key carried
; - Works in:
;     roomForestClearing -> moves to roomDarkRoom (hut door)
;     roomTemple         -> moves to roomCrypt (locked gate)
; - Key must be carried; key is not consumed
; ---------------------------------------------------------
cmdUnlock:
        JR      cmdOpenCommon

cmdOpen:
        ; fallthrough
cmdOpenCommon:
        ; Require key to be one noun and door/gate to be the other noun.
        LD      A,(currentObjectIndex)
        LD      B,A
        LD      A,(targetLocation)
        LD      C,A
        CALL    getOpenActionType
        OR      A
        JR      NZ,coc_have_action
        LD      HL,strPleaseTell
        CALL    printLine
        CALL    printNewLine
        RET

coc_have_action:
        ; Require key carried.
        LD      A,(objectLocation+objKey-1)
        CP      roomCarried
        JR      Z,coc_key_carried
        LD      HL,strNotCarrying
        CALL    printLine
        CALL    printNewLine
        RET

coc_key_carried:
        ; A = action type (1=door, 2=gate)
        CP      1
        JR      Z,coc_open_door
        ; action type 2 = gate
        LD      A,(playerLocation)
        CP      roomTemple
        JR      Z,coc_gate_ok
        LD      HL,strWontOpen
        CALL    printLine
        CALL    printNewLine
        RET

coc_open_door:
        LD      A,(playerLocation)
        CP      roomForestClearing
        JR      Z,coc_door_ok
        LD      HL,strWontOpen
        CALL    printLine
        CALL    printNewLine
        RET

coc_door_ok:
        LD      HL,strDoorOpened
        CALL    printLine
        LD      A,roomDarkRoom
        LD      (playerLocation),A
        CALL    printCurrentRoomDescription
        RET

coc_gate_ok:
        LD      HL,strGateOpened
        CALL    printLine
        LD      A,roomCrypt
        LD      (playerLocation),A
        CALL    printCurrentRoomDescription
        RET

; Inputs:
;   B = noun1, C = noun2
; Returns:
;   A = 1 for door, 2 for gate, 0 for missing/invalid
getOpenActionType:
        ; key + door
        LD      A,B
        CP      objKey
        JR      NZ,goat_check_door_b
        LD      A,C
        CP      nounDoor
        JR      Z,goat_door
goat_check_door_b:
        LD      A,C
        CP      objKey
        JR      NZ,goat_check_gate
        LD      A,B
        CP      nounDoor
        JR      Z,goat_door

goat_check_gate:
        ; key + gate
        LD      A,B
        CP      objKey
        JR      NZ,goat_check_gate_b
        LD      A,C
        CP      nounGate
        JR      Z,goat_gate
goat_check_gate_b:
        LD      A,C
        CP      objKey
        JR      NZ,goat_none
        LD      A,B
        CP      nounGate
        JR      Z,goat_gate

goat_none:
        XOR     A
        RET

goat_door:
        LD      A,1
        RET

goat_gate:
        LD      A,2
        RET

; ---------------------------------------------------------
; cmdDown
; Clean model: DOWN is a verb. If rope is mentioned and you're in room 28,
; descend to room 35 (temple), leaving the  rope behind.
; ---------------------------------------------------------
cmdDown:
        ; Require rope noun (either noun1 or noun2) and rope must be carried.
        LD      A,(currentObjectIndex)
        CP      objRope
        JR      Z,cd_have_rope_noun
        LD      A,(targetLocation)
        CP      objRope
        JR      Z,cd_have_rope_noun
        LD      HL,strICant
        CALL    printLine
        CALL    printNewLine
        RET

cd_have_rope_noun:
        LD      A,(objectLocation+objRope-1)
        CP      roomCarried
        JR      Z,cd_rope_carried
        LD      HL,strNotCarrying
        CALL    printLine
        CALL    printNewLine
        RET

cd_rope_carried:
        LD      A,(playerLocation)
        CP      roomTempleBalcony
        JR      Z,cd_do_descend
        LD      HL,strTooDangerous
        CALL    printLine
        CALL    printNewLine
        RET

cd_do_descend:
        LD      HL,strDescendRope
        CALL    printLine

        ; Leave rope in current room (28) and move player to temple (35).
        LD      A,roomTempleBalcony
        LD      (objectLocation+objRope-1),A
        LD      A,roomTemple
        LD      (playerLocation),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdStubAction
; Placeholder for not-yet-implemented verbs. Prints the verb token
; and the scanned nouns (noun1/noun2) for debugging.
; ---------------------------------------------------------
cmdStubAction:
        LD      HL,strStubVerb
        SYS_PUTS

        ; Print verb token text (space padded) from verbTokenTable[verbPatternIndex]
        LD      A,(verbPatternIndex)
        DEC     A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,verbTokenTable
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        EX      DE,HL
        SYS_PUTS

        LD      HL,strStubTarget
        SYS_PUTS
        LD      A,(currentObjectIndex)
        CALL    printNounByIndex

        LD      HL,strStubTool
        SYS_PUTS
        LD      A,(targetLocation)
        CALL    printNounByIndex

        CALL    printNewLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; maybeMonsterAttack
; If a hostile creature is present and the player did not issue
; a combat action, the creature can attack.
;
; Exempts non-action verbs (look/list/score/quit/save/load/stage),
; movement, and kill/attack.
; ---------------------------------------------------------
maybeMonsterAttack:
        LD      A,(verbPatternIndex)
        OR      A
        RET     Z
        CP      32                     ; north
        RET     Z
        CP      33                     ; south
        RET     Z
        CP      34                     ; west
        RET     Z
        CP      35                     ; east
        RET     Z
        ; Skip attack for non-action verbs.
        CALL    isNonCombatVerb
        RET     Z
        CALL    monsterAttackCore
        RET

; ---------------------------------------------------------
; maybeMonsterAttackOnMove
; If the verb is a movement command, resolve attack before moving.
; ---------------------------------------------------------
maybeMonsterAttackOnMove:
        LD      A,(verbPatternIndex)
        LD      B,A                    ; save verb id
        CP      32                     ; north
        JR      Z,mmom_attack
        CP      33                     ; south
        JR      Z,mmom_attack
        CP      34                     ; west
        JR      Z,mmom_attack
        CP      35                     ; east
        JR      Z,mmom_attack
        RET

mmom_attack:
        CALL    monsterAttackCore
        RET

; ---------------------------------------------------------
; monsterAttackCore
; Runs the hostile creature attack regardless of verb gating.
; ---------------------------------------------------------
monsterAttackCore:
        CALL    findCreatureInRoom
        OR      A
        RET     Z
        LD      (hostileCreatureIndex),A
        CP      objBat
        RET     Z                      ; bats handled elsewhere; no attack

        ; If the sword is mentioned anywhere in the command, skip the attack.
        LD      A,(currentObjectIndex)
        CP      objSword
        RET     Z
        LD      A,(targetLocation)
        CP      objSword
        RET     Z

        ; 10% chance to miss (player survives), otherwise death.
        LD      B,26                   ; 26/256 ~= 10%
        RAND
        JR      C,monster_miss

        ; Death message.
        LD      HL,strMonsterKilled
        SYS_PUTS
        LD      A,(hostileCreatureIndex)
        CALL    printCreatureAdjNoun
        LD      HL,strMonsterSuffix
        CALL    printLine
        CALL    promptPlayAgain
        RET

monster_miss:
        LD      HL,strMonsterMiss
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; maybeBatCarry
; If the bat is present in the current room, it carries the
; player to roomBatCave and relocates itself (MWB behavior).
;
; Returns:
;   Z set if carry occurred, Z clear otherwise.
; ---------------------------------------------------------
maybeBatCarry:
        LD      A,(playerLocation)
        LD      C,A
        LD      A,(objectLocation+objBat-1)
        CP      C
        JR      Z,mbc_carry
        OR      1                      ; Z=0
        RET

mbc_carry:
        LD      HL,strGiantBat
        CALL    printLine
        LD      A,roomBatCave
        LD      (playerLocation),A
        LD      A,(objectLocation+objBat-1)
        ADD     A,batRelocateOffset
        LD      (objectLocation+objBat-1),A
        CALL    printCurrentRoomDescription
        XOR     A                      ; Z=1
        RET

; Returns Z=1 if verb should NOT trigger monster attack.
isNonCombatVerb:
        LD      A,(verbPatternIndex)
        CP      1                      ; look
        RET     Z
        CP      2                      ; list
        RET     Z
        CP      3                      ; invent
        RET     Z
        CP      4                      ; score
        RET     Z
        CP      5                      ; quit
        RET     Z
        CP      6                      ; galar
        RET     Z
        CP      7                      ; ape
        RET     Z
        CP      8                      ; stage2
        RET     Z
        CP      9                      ; stage3
        RET     Z
        CP      10                     ; stage4
        RET     Z
        CP      11                     ; stage5
        RET     Z
        CP      12                     ; save
        RET     Z
        CP      13                     ; load
        RET     Z
        CP      14                     ; read
        RET     Z
        CP      15                     ; pray
        RET     Z
        CP      36                     ; help
        RET     Z
        OR      1                      ; Z=0 => combat applies
        RET

; Returns A = creature index (1..6) if present, else 0.
findCreatureInRoom:
        LD      A,(playerLocation)
        LD      C,A
        LD      HL,objectLocation
        LD      B,objCreatureCount     ; 1..6
        LD      D,1
fcr_loop:
        LD      A,(HL)
        CP      C
        JR      Z,fcr_found
        INC     HL
        INC     D
        DJNZ    fcr_loop
        XOR     A
        RET
fcr_found:
        LD      A,D
        RET

; A = noun index (1..nounTokenCount) or 0
; Prints "none" if 0 else prints the noun string via fallthrough tables.
printNounByIndex:
        OR      A
        JR      NZ,pni_print
        LD      HL,strNothing
        SYS_PUTS
        RET
pni_print:
        CP      nounDoor
        JR      Z,pni_door
        CP      nounGate
        JR      Z,pni_gate
        CP      firstObjectIndex
        JR      NC,pni_obj
        CALL    printCreatureAdjNoun
        RET
pni_obj:
        CALL    printObjectAdjNounFromIndex
        RET

pni_door:
        LD      HL,strDoorWord
        SYS_PUTS
        RET

pni_gate:
        LD      HL,strGateWord
        SYS_PUTS
        RET

; ---------------------------------------------------------
; printRandomFightMessage
; Prints one of the four fight miss messages at random.
; ---------------------------------------------------------
printRandomFightMessage:
        LD      A,R
        AND     3                      ; 0..3
        CP      0
        JR      Z,prfm_move
        CP      1
        JR      Z,prfm_deflect
        CP      2
        JR      Z,prfm_stun
        ; 3
        LD      HL,strAttackHeadBlow
        CALL    printLine
        RET

prfm_move:
        LD      HL,strAttackMove
        CALL    printLine
        RET
prfm_deflect:
        LD      HL,strAttackDeflect
        CALL    printLine
        RET
prfm_stun:
        LD      HL,strAttackStun
        CALL    printLine
        RET


; ---------------------------------------------------------
; computeScore
; Implements the scoring rule for objects 7..17:
; - if carried: add (idx-6)
; - if in room 1: add (idx-6)*2
; Stores result in (score).
; ---------------------------------------------------------
computeScore:
        XOR     A
        LD      (score),A
        LD      B,firstScoreObjectIndex        ; 7
cs_loop:
        ; Load object location for index B
        LD      A,B
        DEC     A
        LD      L,A
        LD      H,0
        LD      DE,objectLocation
        ADD     HL,DE
        LD      A,(HL)
        CP      roomCarried
        JR      Z,cs_add_once
        CP      roomDarkRoom
        JR      Z,cs_add_twice
        JR      cs_next

cs_add_once:
        LD      A,B
        SUB     scoreIndexBaseSub              ; (idx-6)
        LD      C,A
        LD      A,(score)
        ADD     A,C
        LD      (score),A
        JR      cs_next

cs_add_twice:
        LD      A,B
        SUB     scoreIndexBaseSub
        ADD     A,A
        LD      C,A
        LD      A,(score)
        ADD     A,C
        LD      (score),A

cs_next:
        INC     B
        LD      A,B
        CP      afterLastScoreObjectIndex      ; 18
        JR      NZ,cs_loop
        RET

; ---------------------------------------------------------
; printByteDecA
; Prints unsigned A in decimal (0..255) with no leading zeros.
; Clobbers: A, B, C, D, E
; ---------------------------------------------------------
printByteDecA:
        LD      B,0                    ; printed-any flag

        LD      D,100
        CALL    pbd_digit
        LD      D,10
        CALL    pbd_digit
        LD      D,1
        CALL    pbd_digit_last
        RET

; D = divisor (100 or 10)
pbd_digit:
        XOR     E                      ; E=0 count (uses A=0, but we need A preserved)
        LD      E,0
pbd_dloop:
        CP      D
        JR      C,pbd_ddone
        SUB     D
        INC     E
        JR      pbd_dloop
pbd_ddone:
        LD      C,E                    ; digit in C
        LD      A,B
        OR      A
        JR      NZ,pbd_print_digit
        LD      A,C
        OR      A
        RET     Z                      ; skip leading zero
pbd_print_digit:
        LD      A,C
        ADD     A,'0'
        SYS_PUTC
        LD      B,1
        RET

; D = 1
pbd_digit_last:
        LD      C,A                    ; remaining value 0..9
        LD      A,B
        OR      A
        JR      NZ,pbd_print_last
        ; if nothing printed yet, print 0..9 (including 0)
pbd_print_last:
        LD      A,C
        ADD     A,'0'
        SYS_PUTC
        RET

; ---------------------------------------------------------
; cmdStage2
; Testing helper: resets state, moves player to troll room,
; and gives compass/coin/sword in inventory.
; ---------------------------------------------------------
cmdStage2:
        CALL    initState
        LD      A,roomBridgeNorthAnchor
        LD      (playerLocation),A
        LD      A,roomCarried
        LD      (objectLocation+objCompass-1),A
        LD      (objectLocation+objCoin-1),A
        LD      (objectLocation+objSword-1),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdStage3
; Testing helper: resets state, moves player to cave entry,
; and gives compass/coin/sword/candle/rope in inventory.
; ---------------------------------------------------------
cmdStage3:
        CALL    initState
        LD      A,roomCaveEntry
        LD      (playerLocation),A
        LD      A,roomCarried
        LD      (objectLocation+objCompass-1),A
        LD      (objectLocation+objCoin-1),A
        LD      (objectLocation+objSword-1),A
        LD      (objectLocation+objCandle-1),A
        LD      (objectLocation+objRope-1),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdStage4
; Testing helper: resets state, moves player to castle ledge (room 48),
; and gives compass/sword/candle/bomb in inventory.
; ---------------------------------------------------------
cmdStage4:
        CALL    initState
        LD      A,roomCastleLedge
        LD      (playerLocation),A
        LD      A,roomCarried
        LD      (objectLocation+objCompass-1),A
        LD      (objectLocation+objSword-1),A
        LD      (objectLocation+objCandle-1),A
        LD      (objectLocation+objBomb-1),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdStage5
; Testing helper: resets state, moves player to courtyard (room 50),
; and gives compass/sword/candle/bomb in inventory.
; ---------------------------------------------------------
cmdStage5:
        CALL    initState
        LD      A,roomCastleCourtyard
        LD      (playerLocation),A
        LD      A,roomCarried
        LD      (objectLocation+objCompass-1),A
        LD      (objectLocation+objSword-1),A
        LD      (objectLocation+objCandle-1),A
        LD      (objectLocation+objBomb-1),A
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdSave / cmdLoad
; Snapshot save/load to RAM block (no persistence).
; ---------------------------------------------------------
cmdSave:
        LD      HL,saveBlock
        LD      A,(playerLocation)
        LD      (HL),A
        INC     HL
        LD      A,(candleIsLitFlag)
        LD      (HL),A
        INC     HL
        LD      A,(turnCounter)
        LD      (HL),A
        INC     HL
        LD      A,(bridgeCondition)
        LD      (HL),A
        INC     HL
        LD      A,(drawbridgeState)
        LD      (HL),A
        INC     HL
        LD      A,(waterExitLocation)
        LD      (HL),A
        INC     HL
        LD      A,(gateDestination)
        LD      (HL),A
        INC     HL
        LD      A,(teleportDestination)
        LD      (HL),A
        INC     HL
        LD      A,(secretExitLocation)
        LD      (HL),A
        INC     HL
        ; objectLocation[24]
        LD      DE,objectLocation
        LD      BC,objectCount
        LDIR
        LD      HL,strGameSaved
        CALL    printLine
        CALL    printNewLine
        RET

cmdLoad:
        LD      HL,saveBlock
        LD      A,(HL)
        LD      (playerLocation),A
        INC     HL
        LD      A,(HL)
        LD      (candleIsLitFlag),A
        INC     HL
        LD      A,(HL)
        LD      (turnCounter),A
        INC     HL
        LD      A,(HL)
        LD      (bridgeCondition),A
        INC     HL
        LD      A,(HL)
        LD      (drawbridgeState),A
        INC     HL
        LD      A,(HL)
        LD      (waterExitLocation),A
        INC     HL
        LD      A,(HL)
        LD      (gateDestination),A
        INC     HL
        LD      A,(HL)
        LD      (teleportDestination),A
        INC     HL
        LD      A,(HL)
        LD      (secretExitLocation),A
        INC     HL
        ; objectLocation[24]
        LD      DE,objectLocation
        LD      BC,objectCount
        LDIR
        LD      HL,strGameLoaded
        CALL    printLine
        CALL    printCurrentRoomDescription
        RET

; ---------------------------------------------------------
; cmdRead / cmdPray
; In the crypt, give the Galar inscription clue.
; ---------------------------------------------------------
cmdRead:
        JR      cmdPrayCommon

cmdPray:
        ; fallthrough
cmdPrayCommon:
        LD      A,(playerLocation)
        CP      roomCrypt
        JR      Z,cpp_in_crypt
        LD      HL,strNothingHappens
        CALL    printLine
        CALL    printNewLine
        RET

cpp_in_crypt:
        LD      HL,strGalarClue
        CALL    printLine
        CALL    printNewLine
        RET

; ---------------------------------------------------------
; cmdKillAttack
; Sword combat:
; - Requires a target creature in room.
; - Requires a tool noun; only sword works.
; - Uses RNG to decide kill vs. miss.
; ---------------------------------------------------------
cmdKillAttack:
        ; Find target creature among noun1/noun2.
        LD      A,(currentObjectIndex)
        LD      B,A
        LD      A,(targetLocation)
        LD      C,A
        PUSH    BC                     ; preserve noun1/noun2 across helper
        CALL    selectTargetCreature
        POP     BC
        OR      A
        JP      Z,cka_nothing
        LD      D,A                    ; D = creature index (1..6)

        ; Find tool object among noun1/noun2 (orderless).
        CALL    selectToolObject
        OR      A
        JP      Z,cka_need_how
        LD      E,A                    ; E = object index (7..24)

        ; Only sword works for now.
        LD      A,E
        CP      objSword
        JP      NZ,cka_nothing_happens

        ; Require sword to be carried.
        LD      A,(objectLocation+objSword-1)
        CP      roomCarried
        JP      NZ,cka_need_carry

        ; Count swings; if random threshold <= swing count, the monster kills you.
        LD      A,(swordSwingCount)
        INC     A
        LD      (swordSwingCount),A
        LD      C,A                    ; C = swing count (F)

        LD      A,R
        AND     7                      ; 0..7
        CP      7
        JP      NZ,cka_rand_ok
        LD      A,6
cka_rand_ok:
        ADD     A,swordFightBaseThreshold  ; 15..21
        CP      C
        JP      C,cka_death
        JP      Z,cka_death
        JP      cka_try_kill

cka_death:
        LD      HL,strSwordMiss
        CALL    printLine
        CALL    printNewLine
        CALL    promptPlayAgain
        RET

cka_try_kill:
        LD      B,swordKillChanceThreshold
        RAND
        JP      C,cka_kill

        ; Miss: bat carries you away, otherwise print a random fight message.
        LD      A,D
        CP      objBat
        JP      Z,cka_bat_carry

        CALL    printRandomFightMessage
        CALL    printNewLine
        RET

cka_bat_carry:
        LD      HL,strGiantBat
        CALL    printLine
        LD      A,roomBatCave
        LD      (playerLocation),A
        LD      A,(objectLocation+objBat-1)
        ADD     A,batRelocateOffset
        LD      (objectLocation+objBat-1),A
        CALL    printCurrentRoomDescription
        RET

cka_kill:
        LD      HL,strSwordKills
        CALL    printLine
        ; Remove/relocate creature (MWB style).
        LD      A,D
        DEC     A
        LD      L,A
        LD      H,0
        LD      DE,objectLocation
        ADD     HL,DE
        LD      A,D
        CP      objBat
        JP      Z,cka_relocate
        XOR     A
        LD      (HL),A
        JP      cka_after_creature

cka_relocate:
        LD      A,(HL)
        ADD     A,corpseRelocateOffset
        LD      (HL),A

cka_after_creature:
        ; Sword crumbles only when killing the wizard (MWB).
        LD      A,D
        CP      objWizard
        JP      NZ,cka_after_sword
        LD      HL,strSwordCrumbles
        CALL    printLine
        LD      A,roomTemple
        LD      (objectLocation+objSword-1),A

cka_after_sword:
        ; Vapor message for non-dragon.
        LD      A,D
        CP      objDragon
        JP      Z,cka_done
        LD      HL,strCorpseVapor
        CALL    printLine
cka_done:
        CALL    printNewLine
        RET

cka_nothing:
        LD      HL,strNothingToKill
        CALL    printLine
        CALL    printNewLine
        RET
cka_need_how:
        LD      HL,strPleaseTell
        CALL    printLine
        CALL    printNewLine
        XOR     A
        LD      (verbPatternIndex),A
        RET

cka_need_carry:
        LD      HL,strNotCarrying
        CALL    printLine
        CALL    printNewLine
        RET

cka_nothing_happens:
        LD      HL,strNothingHappens
        CALL    printLine
        CALL    printNewLine
        RET

; Inputs: B=noun1, C=noun2
; Returns: A=creature index 1..6 if present, else 0
selectTargetCreature:
        LD      A,B
        CP      1
        JR      C,stc_try2
        CP      objCreatureCount+1
        JR      NC,stc_try2
        ; verify creature is in current room
        PUSH    BC
        LD      B,A
        CALL    creatureInRoom
        POP     BC
        JR      NZ,stc_try2
        LD      A,B
        RET
stc_try2:
        LD      A,C
        CP      1
        JR      C,stc_none
        CP      objCreatureCount+1
        JR      NC,stc_none
        PUSH    BC
        LD      B,A
        CALL    creatureInRoom
        POP     BC
        JR      NZ,stc_none
        LD      A,C
        RET
stc_none:
        XOR     A
        RET

; B = creature index (1..6)
; Returns: Z=1 if creature is in playerLocation, NZ otherwise
creatureInRoom:
        LD      A,(playerLocation)
        LD      C,A
        LD      A,B
        DEC     A
        LD      L,A
        LD      H,0
        LD      DE,objectLocation
        ADD     HL,DE
        LD      A,(HL)
        CP      C
        RET

; Returns: A = object index 7..24 if present in nouns (and not the target creature), else 0
selectToolObject:
        ; prefer noun1 then noun2 (object indices are 7..24)
        LD      A,B
        CP      firstObjectIndex
        RET     NC
        LD      A,C
        CP      firstObjectIndex
        RET     NC
        XOR     A
        RET

; ---------------------------------------------------------
; cmdGet / cmdDrop
; Uses scanned nouns: chooses the first object noun (7..24).
; ---------------------------------------------------------
cmdGet:
        CALL    selectScannedObject
        OR      A
        JP      Z,cmdGetUnknown
        LD      B,A                    ; object index (7..24)
        CALL    doGetObjectIndex
        RET

cmdDrop:
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

; ---------------------------------------------------------
; countCarriedItems
; Returns: A = number of carried objects (7..24).
; ---------------------------------------------------------
countCarriedItems:
        LD      HL,objectLocation+objCreatureCount  ; skip creatures 1..6
        LD      B,objectItemCount                   ; objects 7..24
        LD      C,0                                 ; count
cic_loop:
        LD      A,(HL)
        CP      roomCarried
        JR      NZ,cic_next
        INC     C
cic_next:
        INC     HL
        DJNZ    cic_loop
        LD      A,C
        RET

; B = object index (7..24)
doGetObjectIndex:
        ; Enforce a max carry limit (10 objects).
        PUSH    BC
        CALL    countCarriedItems
        CP      maxCarryItems
        POP     BC
        JP      NC,cmdGetTooMany

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
        PUSH    BC
        LD      A,B
        CALL    printObjectAdjNounFromIndex
        LD      HL,strTakenSuffix
        SYS_PUTS
        CALL    printNewLine
        POP     BC
        CALL    printCurrentRoomDescription
        RET

cmdGetTooMany:
        LD      HL,strTooManyObjects
        CALL    printLine
        CALL    printNewLine
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

        ; Dynamic exit override layer:
        ; If a (room,dir) override exists, use it; otherwise fall back to movementTable.
        LD      B,A                    ; save current room id (1-based)
        PUSH    BC                     ; preserve B(room) + C(dir) across resolver
        CALL    resolveDynamicExit     ; A = override dest or 0
        POP     BC
        OR      A
        JR      NZ,haveDest            ; if override present, skip static lookup

        LD      A,B                    ; restore current room id for static lookup
        DEC     A                      ; 0-based room index
        ADD     A,A                    ; *2
        ADD     A,A                    ; *4
        ADD     A,C                    ; + dir
        LD      E,A
        LD      D,0
        LD      HL,movementTable
        ADD     HL,DE
        LD      A,(HL)                 ; A = destination (0/128/some room id)
haveDest:
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
        CALL    promptPlayAgain
        RET

; ---------------------------------------------------------
; resolveDynamicExit
; Checks dynamicExitPatchTable for a (room,dir) override.
;
; Inputs:
;   A = current room id (1..roomMax)
;   C = dir index (dirNorth..dirEast)
;
; Returns:
;   A = overridden destination (0 means “no override”)
;
; Clobbers:
;   B, D, E, HL
;   (Preserves C)
; ---------------------------------------------------------
resolveDynamicExit:
        LD      D,A                    ; D = room
        LD      E,C                    ; E = dir
        LD      HL,dynamicExitPatchTable
        LD      B,dynamicExitPatchCount
rde_loop:
        LD      A,(HL)                 ; room
        INC     HL
        CP      D
        JR      NZ,rde_skip_room

        LD      A,(HL)                 ; dir
        INC     HL
        CP      E
        JR      NZ,rde_skip_dir

        ; Match: next word is pointer to a state byte holding destination/flag.
        LD      A,(HL)                 ; ptr lo
        INC     HL
        LD      H,(HL)                 ; ptr hi
        LD      L,A
        LD      A,(HL)                 ; A = destination (0 => no override/blocked)
        RET

rde_skip_room:
        INC     HL                     ; skip dir
rde_skip_dir:
        INC     HL                     ; skip ptr lo
        INC     HL                     ; skip ptr hi
        DJNZ    rde_loop

        XOR     A                      ; no override
        RET

cmdLook:
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
; cmdNeedHow
; Behavior for verbs that require extra context.
; ---------------------------------------------------------
cmdNeedHow:
        LD      HL,strPleaseTell
        CALL    printLine
        CALL    printNewLine
        XOR     A
        LD      (verbPatternIndex),A
        RET

; ---------------------------------------------------------
; cmdLight
; Behavior: "light" is recognized but requires clarification.
; (In the original BASIC this prints "Please tell me how." and does not relight.)
; ---------------------------------------------------------
cmdLight:
        JP      cmdLightBurnBombCommon

; ---------------------------------------------------------
; cmdBurn
; Special-case: burning the bomb requires candle as the second noun.
; Otherwise behaves like "Please tell me how."
; ---------------------------------------------------------
cmdBurn:
        ; fallthrough

; ---------------------------------------------------------
; cmdLightBurnBombCommon
; Handles "light/burn bomb candle" gating.
;
; Rule (as requested):
; - Require bomb noun + candle noun (orderless).
; - If requirement not met: "Please tell me how."
; - If bomb not mentioned: "Please tell me how."
;
; Note: The actual bomb explosion logic is implemented separately.
; ---------------------------------------------------------
cmdLightBurnBombCommon:
        ; Require bomb noun to be present.
        LD      A,(currentObjectIndex)
        CP      objBomb
        JR      Z,clb_have_bomb
        LD      A,(targetLocation)
        CP      objBomb
        JR      Z,clb_have_bomb
        JP      cmdNeedHow

clb_have_bomb:
        ; Require candle noun (explicit, orderless).
        LD      A,(currentObjectIndex)
        CP      objCandle
        JR      Z,clb_have_candle
        LD      A,(targetLocation)
        CP      objCandle
        JR      Z,clb_have_candle
        JP      cmdNeedHow

clb_have_candle:
        ; Require candle to be carried (tool).
        LD      A,(objectLocation+objCandle-1)
        CP      roomCarried
        JR      Z,clb_candle_ok
        LD      HL,strNotCarrying
        CALL    printLine
        CALL    printNewLine
        RET

clb_candle_ok:
        ; Candle must be lit.
        LD      A,(candleIsLitFlag)
        OR      A
        JR      NZ,clb_candle_lit
        LD      HL,strCandleOutStupid
        CALL    printLine
        CALL    printNewLine
        RET

clb_candle_lit:
        ; Require bomb to be carried or present.
        LD      A,(playerLocation)
        LD      C,A
        LD      A,(objectLocation+objBomb-1)
        CP      roomCarried
        JR      Z,clb_bomb_ok
        CP      C
        JR      Z,clb_bomb_ok
        LD      HL,strCantSeeIt
        CALL    printLine
        CALL    printNewLine
        RET

clb_bomb_ok:
        ; Bomb explosion logic.
        LD      HL,strBombExplode
        CALL    printLine

        ; Consume the bomb.
        XOR     A
        LD      (objectLocation+objBomb-1),A

        ; Knock the player back one room if possible.
        LD      A,(playerLocation)
        CP      roomDarkRoom
        JR      Z,clb_after_knock
        DEC     A
        LD      (playerLocation),A

clb_after_knock:
        ; If we landed in the oak door room, open the east exit.
        LD      A,(playerLocation)
        CP      roomOakDoor
        JR      NZ,clb_done
        LD      A,roomTreasureRoom
        LD      (teleportDestination),A

clb_done:
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
;
; Notes:
; - SYS_PUTS clobbers C and advances HL.
; - printObjectAdjNoun clobbers B/C/HL, so B (loop counter) and HL
;   (objectLocation pointer) must be preserved across the call.
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
        PUSH    HL                     ; preserve objectLocation pointer
        LD      HL,strCommaSpace
        SYS_PUTS
        POP     HL
        JR      cl_print
cl_first:
        LD      D,1
cl_print:
        PUSH    BC                     ; preserve loop counter
        PUSH    DE                     ; preserve object id (E)
        PUSH    HL                     ; preserve objectLocation pointer
        LD      A,E
        CALL    printObjectAdjNoun
        POP     HL
        POP     DE
        POP     BC

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

; toUpperA
; A = ASCII char; returns uppercase for a-z.
toUpperA:
        CP      'a'
        RET     C
        CP      'z'+1
        RET     NC
        AND     $DF
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
