; ---------------------------------------------------------
;  CAVERNS – Fictional BASIC Dialect Version
;  Based on MicroWorld BASIC game by John Hardy (c) 1983
;  No line numbers, label-based control flow, long variable names
; ---------------------------------------------------------
;  INDEX MAP (for future assembly translation)
;  CREATURES: 1 wizard, 2 demon, 3 troll, 4 dragon, 5 bat, 6 dwarf
;  OBJECTS 7-24: coin, compass, bomb, ruby, diamond, pearl, stone,
;                ring, pendant, grail, shield, box, key, sword,
;                candle, rope, brick, grill
;  ROOM FLAGS: bridgeCondition/H, drawbridgeState/D,
;              waterExitLocation/W, gateDestination/G,
;              teleportDestination/T, secretExitLocation/E
;  DIRECTION INDEX: dirNorthStr=0, dirSouthStr=1, dirWestStr=2, dirEastStr=3

    .include "constants.asm"
    .include "macros.asm"
    .include "utils.asm"
    .include "tables.asm"
    .include "strings.asm"
    .include "variables.asm"


gameStart:
    cls
    call initState
    call updateDynamicExits
    goto describeCurrentLocation

describeCurrentLocation:

    ; ---------------------------------------------------------
    ; describeCurrentLocation
    ; Purpose: entry point after each player action to show the
    ; current room state or trigger an immediate monster attack.
    ; Steps:
    ;   1) If a hostile creature is present (non-bat) and player
    ;      is not holding the sword, jump to monsterAttack.
    ;   2) Darkness check: if room index < first dark cavern OR
    ;      candle lit AND candle is present/carried, show room;
    ;      otherwise print darkness warning and list occupants.
    ;   3) Fall through to listRoomObjectsAndCreatures.
    ; Notes:
    ;   - Uses short-lived A loads for compares; all state lives
    ;     in RAM variables.
    ; ---------------------------------------------------------

    ; If a hostile creature is active (except some special case), jump to monster-attack logic
    ld a,(hostileCreatureIndex)
    or a
    jp z,dcDarknessCheck
    cp 5
    jp z,dcDarknessCheck
    ld a,(currentObjectIndex)
    cp objSword
    jp z,dcDarknessCheck
    jp monsterAttack

dcDarknessCheck:
    ; Darkness logic: show room description if lit or before dark caverns
    ld a,(playerLocation)
    cp roomDarkCavernA
    jp c,printRoomDescription

    ld a,(candleIsLitFlag)
    or a
    jp z,dcShowDarkness

    ; Is candle at player location?
    ld a,(objectLocation+20)        ; objCandle index 21 -> offset 20
    ld b,a
    ld a,(playerLocation)
    cp b
    jp z,printRoomDescription

    ; Or carried? (-1 == 0xFF)
    ld a,b
    cp 255
    jp z,printRoomDescription

dcShowDarkness:
    ld hl,strTooDark
    call printStr
    jp listRoomObjectsAndCreatures

printRoomDescription:

    ; ---------------------------------------------------------
    ; printRoomDescription
    ; Purpose: show the room’s primary/secondary description and
    ; supplemental text based on dynamic state (darkness, bridge,
    ; dragon corpse, drawbridge, candle dim/out).
    ; Steps:
    ;   1) Fetch roomDesc1/2Table word pointers by room index
    ;      (1-based) and print if non-null.
    ;   2) Conditional extras:
    ;        - Dark cavern generic line for specific room ranges.
    ;        - Bridge warning when broken.
    ;        - Dragon corpse when present.
    ;        - Golden drawbridge when lowered.
    ;        - Candle dim/out thresholds (also clears lit flag).
    ;   3) Jump to listRoomObjectsAndCreatures.
    ; ---------------------------------------------------------

    ; Pointer-based room descriptions (for assembly translation, @PTR means dereference)
    ; roomDesc1Table entry (word) = DESC pointer for current room
    ld a,(playerLocation)
    dec a                       ; 0-based index
    add a,a                     ; *2 for word table
    ld l,a
    ld h,0
    ld de,roomDesc1Table
    add hl,de                   ; HL -> entry
    ld e,(hl)
    inc hl
    ld d,(hl)                   ; DE = ptr
    ld a,d
    or e
    jp z,prCheckDesc2
    push de
    call printStr               ; svcPuts leaves HL at end of string
    pop de

prCheckDesc2:
    ld a,(playerLocation)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,roomDesc2Table
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ld a,d
    or e
    jp z,prAfterDesc
    push de
    call printStr
    pop de

prAfterDesc:
    ; ---------------------------------------------------------
    ; prAfterDesc
    ; After room description, emit contextual extras and candle
    ; warnings, then fall through to listing objects/creatures.
    ; ---------------------------------------------------------

    ; Check if current room needs the generic dark-cavern message
    ld a,(playerLocation)        ; A = current room
    ld b,a                        ; B = current room (reuse)
    cp roomDarkCavernA         ; dark cavern A?
    jp z,pradPrintDark
    cp roomDarkCavernB         ; dark cavern B?
    jp z,pradPrintDark
    cp roomDarkCavernC         ; dark cavern C?
    jp z,pradPrintDark
    cp roomDarkCavernH         ; dark cavern H?
    jp z,pradPrintDark
    cp roomDarkCavernI         ; dark cavern I?
    jp z,pradPrintDark
    cp roomDarkCavernJ         ; dark cavern J?
    jp z,pradPrintDark
    cp roomDarkCavernK         ; dark cavern K?
    jp z,pradPrintDark
    cp roomWoodenBridge         ; wooden bridge also dark
    jp z,pradPrintDark
    ld a,b                        ; A = current room
    cp roomTempleBalcony+1      ; >= 29? (caverns D/E/F)
    jp c,pradBridgeCheck
    cp roomDarkCavernG         ; < 32? (before cavern G)
    jp nc,pradBridgeCheck
pradPrintDark:
    ld hl,strDarkCavern         ; "You are deep in a dark cavern."
    call printStr                 ; emit dark cavern note

pradBridgeCheck:
    ; Broken bridge message when at north/south anchor and bridge is fatal
    ld a,(playerLocation)        ; A = current room
    cp roomBridgeNorthAnchor   ; at north anchor?
    jr z,bridgeMaybe
    cp roomBridgeSouthAnchor   ; at south anchor?
    jr nz,pradDragonCheck
bridgeMaybe:
    ld a,(bridgeCondition)       ; A = bridge state
    cp exitFatal                 ; snapped?
    jr nz,pradDragonCheck
    ld hl,strBridgeSnapped      ; "Two of the ropes have snapped..."
    call printStr                 ; warn bridge unusable

pradDragonCheck:
    ; Dead dragon corpse visible only at cave entrance clearing when objDragon = 0
    ld a,(playerLocation)        ; A = current room
    cp roomCaveEntranceClearing ; at cave entrance clearing?
    jr nz,pradBridgeState
    ld a,(objectLocation+3)      ; objDragon index 4 -> offset 3
    or a                          ; zero means corpse present
    jr nz,pradBridgeState
    ld hl,strDragonCorpse       ; "You can also see the bloody corpse..."
    call printStr                 ; show corpse line

pradBridgeState:
    ; Show golden drawbridge text when at castle ledge and drawbridge lowered
    ld a,(playerLocation)        ; A = current room
    cp roomCastleLedge          ; on castle ledge?
    jr nz,pradCandleDim
    ld a,(drawbridgeState)       ; A = drawbridge state
    cp roomDrawbridge            ; lowered into room 49?
    jr nz,pradCandleDim
    ld hl,strGoldBridge         ; "A mighty golden drawbridge..."
    call printStr                 ; describe drawbridge

pradCandleDim:
    ; Candle dim warning once past threshold
    ld a,(turnCounter)           ; A = turn count
    cp candleDimTurn            ; dim threshold reached?
    jr c,pradCandleOut
    ld hl,strCandleDim          ; "Your candle is growing dim."
    call printStr                 ; warn dimming

pradCandleOut:
    ; Candle extinguished once out threshold reached
    ld a,(turnCounter)           ; A = turn count
    cp candleOutTurn            ; out threshold?
    jp c,listRoomObjectsAndCreatures
    xor a                         ; A = 0
    ld (candleIsLitFlag),a     ; flag candle out
    ld hl,strCandleOut          ; "In fact...it went out!"
    call printStr                 ; announce candle out
    jp listRoomObjectsAndCreatures



listRoomObjectsAndCreatures:

    ; ---------------------------------------------------------
    ; listRoomObjectsAndCreatures
    ; After room description/extras, list objects and creatures in
    ; the current room, trigger first-encounter text, then show the
    ; prompt and possibly launch an attack if a hostile is present.
    ; ---------------------------------------------------------

    visibleObjectCount = 0      ; reset visible object counter

    ; Count objects at current location (indices 7..24)
    ld a,7                        ; start at object index 7
    ld (loopIndex),a             ; loopIndex = 7
locCountObjects:
    ld a,(loopIndex)             ; A = current object index
    cp 25                         ; past last object?
    jp z,locCountDone           ; done counting
    ld a,(loopIndex)             ; A = index
    sub 1                         ; convert to 0-based offset
    ld l,a
    ld h,0
    ld de,objectLocation         ; DE = base of object locations
    add hl,de                     ; HL -> objectLocation(index)
    ld a,(hl)                     ; A = object location
    ld b,a                        ; B = copy of location
    ld a,(playerLocation)        ; A = player room
    cp b                          ; same room?
    jp nz,locNextObj            ; skip if not here
    ld a,(visibleObjectCount)   ; A = count so far
    inc a                         ; count++
    ld (visibleObjectCount),a   ; store updated count
locNextObj:
    ld a,(loopIndex)             ; A = index
    inc a                         ; index++
    ld (loopIndex),a             ; store
    jp locCountObjects          ; continue loop
locCountDone:

    if visibleObjectCount > 0 then
        ld hl,strSeeObjects     ; "You can also see..."
        call printStr             ; print header
        ; List objects at current location
        ld a,7                    ; restart at object 7
        ld (loopIndex),a
locListObjects:
        ld a,(loopIndex)         ; A = object index
        cp 25                     ; done listing?
        jp z,locDoneList
        ld a,(loopIndex)         ; A = index
        sub 1                     ; to offset
        ld l,a
        ld h,0
        ld de,objectLocation     ; DE = base
        add hl,de                 ; HL -> objectLocation(index)
        ld a,(hl)                 ; A = object location
        ld b,a                    ; B = location copy
        ld a,(playerLocation)    ; A = player room
        cp b                      ; object here?
        jp nz,locNextList       ; skip if not
        ld a,(loopIndex)         ; A = object index
        ld (currentObjectIndex),a ; remember current object index
        call printObjectDescriptionSub ; print "a/an <adj> <noun>, "
locNextList:
        ld a,(loopIndex)         ; A = index
        inc a                     ; next object
        ld (loopIndex),a         ; store
        jp locListObjects       ; loop list
locDoneList:
    end if

    visibleCreatureCount = 0    ; reset visible creature counter

    ; Count/intro creatures at current location (indices 1..6)
    ld a,1                        ; start at creature index 1
    ld (loopIndex),a             ; loopIndex = 1
locCountCreatures:
    ld a,(loopIndex)             ; A = creature index
    cp 7                          ; past last creature?
    jp z,locCountCreDone       ; done counting
    ld a,(loopIndex)             ; A = index
    sub 1                         ; to offset
    ld l,a
    ld h,0
    ld de,objectLocation         ; DE = base
    add hl,de                     ; HL -> objectLocation(index)
    ld a,(hl)                     ; A = creature location
    ld b,a                        ; B = location copy
    ld a,(playerLocation)        ; A = player room
    cp b                          ; creature here?
    jp nz,locNextCre            ; skip if not here
    ld a,(visibleCreatureCount) ; A = creature count
    inc a                         ; count++
    ld (visibleCreatureCount),a ; store
    ld a,(loopIndex)             ; A = creature index
    ld (currentObjectIndex),a   ; remember current creature
    call triggerCreatureIntroSub ; trigger intro text if needed
locNextCre:
    ld a,(loopIndex)             ; A = index
    inc a                         ; next creature
    ld (loopIndex),a             ; store
    jp locCountCreatures        ; loop
locCountCreDone:

    if visibleCreatureCount > 0 then
        ld hl,strSeeCreatures   ; "Nearby there lurks..."
        call printStr             ; print creature header
        ; List creatures at current location
        ld a,1                    ; restart at creature 1
        ld (loopIndex),a
locListCreatures:
        ld a,(loopIndex)         ; A = creature index
        cp 7                      ; finished listing?
        jp z,locListCreDone
        ld a,(loopIndex)         ; A = index
        sub 1                     ; to offset
        ld l,a
        ld h,0
        ld de,objectLocation     ; DE = base
        add hl,de                 ; HL -> objectLocation(index)
        ld a,(hl)                 ; A = creature location
        ld b,a                    ; B = location copy
        ld a,(playerLocation)    ; A = player room
        cp b                      ; creature here?
        jp nz,locNextCreList   ; skip if not
        ld a,(loopIndex)         ; A = creature index
        ld (currentObjectIndex),a ; remember creature index
        call printObjectDescriptionSub ; print "a/an <adj> <noun>, "
locNextCreList:
        ld a,(loopIndex)         ; A = index
        inc a                     ; next creature
        ld (loopIndex),a         ; store
        jp locListCreatures     ; loop listing
locListCreDone:
    end if

    call printNewline             ; blank line
    ld hl,strPrompt              ; ">"
    call printStr                 ; show prompt
    set8 reshowFlag,1            ; remember we displayed room

    ld a,(hostileCreatureIndex) ; A = hostile index (0 if none)
    or a                          ; any hostile?
    jp z,locDone                 ; none -> input
    cp 5                          ; dragon handled elsewhere; bat (6) non-hostile
    jp z,locDone
    ld a,(currentObjectIndex)   ; A = last listed index
    cp objSword                  ; sword available?
    jp z,locDone                 ; sword means no auto attack
    jp monsterAttack             ; attack player
locDone:
    goto getPlayerInput

getPlayerInput:

    ; ---------------------------------------------------------
    ; getPlayerInput
    ; Read a non-empty command line, normalize it (pad spaces,
    ; lowercase, trim multiples), bump turn counter, and route to
    ; parsing. Clears the screen afterward.
    ; ---------------------------------------------------------

    input inputCommand$          ; read command line

    if inputCommand$ = "" then   ; empty? keep prompting
        goto getPlayerInput
    end if

    inputCommand$ = " " + inputCommand$ + " " ; pad with spaces for INSTR finds
    turnCounter = turnCounter + 1              ; advance turn count

    call normalizeInput           ; lowercase/trim/pad as per helper

    cls                           ; clear screen before processing

    goto parseCommandEntry      ; continue to parser

parseCommandEntry:

    ; ---------------------------------------------------------
    ; parseCommandEntry
    ; Identify noun in input, set currentObjectIndex, refresh
    ; dynamic exits/flags that depend on location/state, then
    ; continue into verb routing.
    ; ---------------------------------------------------------

    currentObjectIndex = 0      ; reset matched object index
    objectAdjective$ = ""        ; clear parsed adjective
    objectNoun$ = ""             ; clear parsed noun

    for loopIndex = 7 to 24
        objectAdjective$ = @objectNameAdj(loopIndex) ; candidate adj
        objectNoun$ = @objectNameNoun(loopIndex)     ; candidate noun
        if INSTR(inputCommand$, objectNoun$) > 0 then  ; noun found?
            currentObjectIndex = loopIndex            ; remember which
            EXIT for                                     ; stop search
        end if
    next loopIndex

    if currentObjectIndex = 0 then
        objectAdjective$ = ""    ; no noun matched -> clear
        objectNoun$ = ""
    end if

    ; Bridge condition when halfway
    if playerLocation = roomBridgeMid then
        bridgeCondition = 128
        call updateDynamicExits
    end if

    ; Hut flag
    if playerLocation = roomForestClearing then
        generalFlagJ = 1
    end if

    ; Waterfall conduit exit opens when at base
    if playerLocation = roomWaterfallBase then
        waterExitLocation = 43
        call updateDynamicExits
    end if

    ; Reset water exit when back in temple
    if playerLocation = roomTemple then
        waterExitLocation = 0
        call updateDynamicExits
    end if

    ; Gate destination changes once grill moved
    if objectLocation(objGrill) <> roomTinyCell then
        gateDestination = 39
        call updateDynamicExits
    end if

    ; Drawbridge lowers when on drawbridge room
    if playerLocation = roomDrawbridge then
        drawbridgeState = 49
        call updateDynamicExits
    end if

    ; LOOK command
    if INSTR(inputCommand$, " look ") > 0 then
        reshowFlag = 0
        goto describeCurrentLocation
    end if

    ; LIST inventory
    if INSTR(inputCommand$, " list ") > 0 then
        goto showInventory
    end if

    ; QUIT
    if INSTR(inputCommand$, " quit ") > 0 then
        goto quitGame
    end if

    goto checkCreatureAtLocation

showInventory:

    ld hl,strCarryingPrefix
    call printStr
    visibleObjectCount = 0

    for loopIndex = 7 to 24
        if objectLocation(loopIndex) = -1 then
            visibleObjectCount = visibleObjectCount + 1
        end if
    next loopIndex

    if visibleObjectCount = 0 then
        ld hl,strNothing
        call printStr
        goto describeCurrentLocation
    end if

    call printNewline
    for loopIndex = 7 to 24
        if objectLocation(loopIndex) = -1 then
            currentObjectIndex = loopIndex
            call printObjectDescriptionSub
        end if
    next loopIndex

    goto describeCurrentLocation

quitGame:
    ; ---------------------------------------------------------
    ; quitGame
    ; Compute score, print it with turn count, show ranking, and
    ; prompt for another game (handled by waitForYesNo).
    ; ---------------------------------------------------------

    score = 0                           ; reset score accumulator

    for loopIndex = 7 to 17             ; score items 7..17
        if objectLocation(loopIndex) = -1 then
            score = score + loopIndex - 6
        end if
        if objectLocation(loopIndex) = 1 then
            score = score + (loopIndex - 6) * 2
        end if
    next loopIndex

    call printNewline
    ld hl,strScorePrefix                ; "You have a score of "
    call printStr
    ld a,(score)
    ld l,a
    ld h,0
    call printNum                       ; print score
    ld hl,strScoreMid                   ; " out of a possible 126 points in "
    call printStr
    ld a,(turnCounter)
    ld l,a
    ld h,0
    call printNum                       ; print turn count
    ld hl,strScoreSuffix                ; " moves."
    call printStr
    call printRankingSub                ; ranking text
    ld hl,strAnother                    ; "Another adventure? "
    call printStr

waitForYesNo:
    ; ---------------------------------------------------------
    ; waitForYesNo
    ; Block until user presses Y/y or N/n.
    ; Y -> restart gameStart, N -> halt (end).
    ; ---------------------------------------------------------
waitYesNoLoop:
    call getc                    ; read key into A
    ld (yesnoKey),a              ; store raw key
    call toLowerAscii            ; normalize to lowercase
    cp 'n'
    jp z,gameEnd                 ; end program
    cp 'y'
    jp z,gameStart               ; restart
    jp waitYesNoLoop             ; otherwise keep waiting

; Simple halt loop for "end"
gameEnd:
    jp gameEnd



checkCreatureAtLocation:
    ; ---------------------------------------------------------
    ; checkCreatureAtLocation
    ; Scan creature slots 1..6; if any shares playerLocation,
    ; set hostileCreatureIndex and branch for special handling.
    ; Otherwise clear hostileCreatureIndex and continue to verb handling.
    ; ---------------------------------------------------------
    set8 hostileCreatureIndex,1         ; start at creature 1

ccalLoop:
    ld a,(hostileCreatureIndex)         ; A = creature index (1..6)
    cp 7                                ; past last creature?
    jp z,ccalNone                       ; no hostiles found

    ; compute objectLocation offset = index-1
    dec a                               ; zero-based offset
    ld l,a
    ld h,0
    ld de,objectLocation
    add hl,de                           ; HL -> objectLocation(entry)
    ld a,(hl)                           ; A = creature location
    ld b,a                              ; save location
    ld a,(playerLocation)               ; A = player room
    cp b                                ; match?
    jp z,checkCreatureBatSpecial        ; found hostile/bat

    ; next creature
    ld a,(hostileCreatureIndex)
    inc a
    ld (hostileCreatureIndex),a
    jp ccalLoop

ccalNone:
    set8 hostileCreatureIndex,0         ; none present
    goto handleVerbOrMovement

checkCreatureBatSpecial:

    ; ---------------------------------------------------------
    ; checkCreatureBatSpecial
    ; If the creature in this room is the bat (index 5), print the
    ; bat message, teleport player to bat cave, bump bat location,
    ; and redisplay. Otherwise continue verb handling.
    ; ---------------------------------------------------------
    ld a,(hostileCreatureIndex)
    cp 5                                ; bat index?
    jp nz,handleVerbOrMovement          ; not bat -> continue

    ld hl,strGiantBat                   ; "The giant bat picked you up..."
    call printStr

    ld a,roomBatCave
    ld (playerLocation),a               ; move player
    set8 reshowFlag,0                   ; force redisplay

    ; objectLocation(5) = objectLocation(5) + 7 (index 5 -> offset 4)
    ld hl,objectLocation+4
    ld a,(hl)
    add a,7
    ld (hl),a

    goto describeCurrentLocation

monsterAttack:
    ; Print "killed by a <adj><noun>!!"
    ld hl,strMonsterKilled
    call printStr

    ; Fetch monster adjective pointer
    ld a,(hostileCreatureIndex)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,monsterAdjData
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    call printStr

    ; Fetch monster noun pointer
    ld a,(hostileCreatureIndex)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,monsterNounData
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    call printStr

    ld hl,strMonsterSuffix
    call printStr

    goto quitGame



handleVerbOrMovement:

    ; ---------------------------------------------------------
    ; handleVerbOrMovement
    ; Dispatch input by first matching generic verbs (take/put/
    ; unlock/jump/etc.) via pattern table, then directions, else
    ; fall back to non-movement handlers.
    ; ---------------------------------------------------------

    ; Scan verb patterns (1..16) for a match in inputCommand$
    for verbPatternIndex = 1 to 16       ; iterate patterns
        if INSTR(inputCommand$, @verbPattern(verbPatternIndex)) > 0 then ; found?
            goto routeByVerbPattern     ; handle specific verb
        end if
    next verbPatternIndex                 ; next pattern

    ; Check for movement words (north/south/west/east)
    for directionIndex = 0 to 3            ; 0..3
        if INSTR(inputCommand$, @dirWordIndex(directionIndex+1)) > 0 then ; dir found?
            goto handleMovementCommand    ; route to movement
        end if
    next directionIndex                    ; next direction

    goto handleNonMovementCommand        ; nothing matched -> non-movement



handleMovementCommand:

    ; ---------------------------------------------------------
    ; handleMovementCommand
    ; Resolve direction (may be randomized by bomb), look up
    ; target in movementTable, apply exits (none/fatal/room),
    ; then redisplay location.
    ; ---------------------------------------------------------

    ; Special check: if bomb is elsewhere, randomize direction
    ld a,(objectLocation+8)                ; objBomb index 9 -> offset 8
    cp 255                                 ; carried?
    jr z,hmcBombHandled
    ld b,a                                 ; B = bomb location
    ld a,(playerLocation)
    cp b
    jr z,hmcBombHandled                    ; bomb at player => no random
    ; bomb elsewhere: random dir 0..3
    call rand0To3
    ld (randomDirectionIndex),a
    jr hmcPickTarget
hmcBombHandled:
    xor a                                  ; default dir = 0
    ld (randomDirectionIndex),a

hmcPickTarget:
    ; targetLocation = movementTable(playerLocation, randomDirectionIndex)
    ld a,(playerLocation)
    dec a                                  ; zero-based room index
    ld l,a
    ld h,0
    add hl,hl                              ; room *2
    add hl,hl                              ; room *4
    ld b,h
    ld c,l                                 ; BC = room*4
    ld a,(randomDirectionIndex)
    ld l,a
    ld h,0
    add hl,bc                              ; offset = room*4 + dir
    ld de,movementTable
    add hl,de
    ld a,(hl)
    ld (targetLocation),a                  ; store target

    cp exitNone                            ; no exit?
    jr nz,hmcCheckFatal
    ld hl,strCantGoThatWay
    call printStr
    call printNewline
    jr hmcDoneMove

hmcCheckFatal:
    cp exitFatal                           ; fatal exit?
    jr nz,hmcMoveRoom
    ld hl,strFatalFall
    call printStr
    call printNewline
    goto quitGame

hmcMoveRoom:
    or a                                   ; target > 0?
    jp z,hmcDoneMove
    ld (playerLocation),a                  ; move player

hmcDoneMove:
    set8 reshowFlag,0                      ; force redisplay
    goto describeCurrentLocation           ; show new room

handleNonMovementCommand:

    ; Magic word "galar"
    if INSTR(inputCommand$, " galar ") > 0 then
        reshowFlag = 0
        ld hl,strMagicWind
        call printStr
        playerLocation = roomCaveEntry
        goto describeCurrentLocation
    end if

    ; Crypt wall "ape"
    if INSTR(inputCommand$, " ape ") > 0 then
        ld hl,strCryptWall
        call printStr
        secretExitLocation = 38
        call updateDynamicExits
        goto describeCurrentLocation
    end if

    ; Ensure an object was parsed
    ld a,(currentObjectIndex)
    or a
    jr nz,hnmCheckVisibility
    ld hl,strEh
    call printStr
    goto describeCurrentLocation

hnmCheckVisibility:
    ; Object must be visible or carried
    ld a,(currentObjectIndex)
    dec a                          ; zero-based offset
    ld l,a
    ld h,0
    ld de,objectLocation
    add hl,de                      ; HL -> objectLocation(entry)
    ld a,(hl)                      ; A = object location
    cp 255                         ; carried?
    jr z,checkGetDropUse
    ld b,a                         ; B = location
    ld a,(playerLocation)
    cp b                           ; same room?
    jr z,checkGetDropUse

    ; Not visible/carrying -> error message
    ld hl,strCantSeeIt
    call printStr
    goto describeCurrentLocation



checkGetDropUse:

    ; GET command
    if INSTR(inputCommand$, " get ") > 0 then
        goto handleGetCommand
    end if

    ; DROP command
    if INSTR(inputCommand$, " drop ") > 0 then
        goto handleDropCommand
    end if

    ; USE-type verbs routed by object index
    goto routeUseByObject



handleGetCommand:

    ; ---------------------------------------------------------
    ; handleGetCommand
    ; Count carried items; if >10, refuse. Otherwise set the
    ; current object to carried (-1) and redisplay.
    ; ---------------------------------------------------------
    set8 carriedCount,0                ; reset counter
    set8 loopIndex,7                   ; start at object 7
hgcCount:
    ld a,(loopIndex)                   ; A = index
    cp 25                              ; past object 24?
    jp z,hgcDoneCount
    dec a                              ; to offset
    ld l,a
    ld h,0
    ld de,objectLocation
    add hl,de                          ; HL -> objectLocation(entry)
    ld a,(hl)                          ; A = location byte
    cp 255                             ; carried?
    jp nz,hgcNext
    ld a,(carriedCount)                ; increment carried count
    inc a
    ld (carriedCount),a
hgcNext:
    ld a,(loopIndex)
    inc a
    ld (loopIndex),a
    jp hgcCount
hgcDoneCount:
    ld a,(carriedCount)
    cp 11                              ; >10?
    jr c,hgcCarryOk
    ld hl,strTooManyObjects
    call printStr
    goto describeCurrentLocation
hgcCarryOk:
    ; objectLocation(currentObjectIndex) = -1 (255)
    ld a,(currentObjectIndex)
    dec a                              ; to offset
    ld l,a
    ld h,0
    ld de,objectLocation
    add hl,de
    ld a,255
    ld (hl),a
    goto describeCurrentLocation



handleDropCommand:

    ; ---------------------------------------------------------
    ; handleDropCommand
    ; Place the current object in the player’s room.
    ; ---------------------------------------------------------
    ld a,(currentObjectIndex)          ; A = index
    dec a                              ; to offset
    ld l,a
    ld h,0
    ld de,objectLocation
    add hl,de                          ; HL -> objectLocation(entry)
    ld a,(playerLocation)              ; A = room id
    ld (hl),a                          ; store new location
    goto describeCurrentLocation



routeUseByObject:

    ; ---------------------------------------------------------
    ; routeUseByObject
    ; Dispatch USE targets by currentObjectIndex (key/sword/bomb/rope).
    ; ---------------------------------------------------------
    ld a,(currentObjectIndex)
    cp objKey
    jp z,useKey
    cp objSword
    jp z,useSword
    cp objCandle
    jp z,useBomb
    cp objRope
    jp z,useRope

    ld hl,strUseHow
    call printStr
    goto describeCurrentLocation



useKey:

    ; ---------------------------------------------------------
    ; useKey
    ; Works only at forest clearing or temple. Opens the door,
    ; moves key to current room, clears reshowFlag, and teleports
    ; player based on location.
    ; ---------------------------------------------------------
    ld a,(playerLocation)
    cp roomForestClearing
    jp z,useKeyAllowed
    cp roomTemple
    jp z,useKeyAllowed
    ; not allowed: won't open
    ld hl,strWontOpen
    call printStr
    goto describeCurrentLocation

useKeyAllowed:
    ld hl,strDoorOpened
    call printStr
    ; objectLocation(19) = playerLocation (key index 19 -> offset 18)
    ld a,(playerLocation)
    ld (objectLocation+18),a
    set8 reshowFlag,0

    ld a,(playerLocation)
    cp roomForestClearing
    jp nz,useKeyToCrypt
    ld a,roomDarkRoom
    ld (playerLocation),a
    goto describeCurrentLocation

useKeyToCrypt:
    ld a,roomCrypt
    ld (playerLocation),a
    goto describeCurrentLocation



useSword:

    ; ---------------------------------------------------------
    ; useSword
    ; Resolve sword attacks vs hostileCreatureIndex. Handles misses
    ; and fatal outcomes per original BASIC logic.
    ; ---------------------------------------------------------
    ld a,(hostileCreatureIndex)
    or a
    jp nz,useSwordHasTarget
    ld hl,strNothingToKill
    call printStr
    goto describeCurrentLocation

useSwordHasTarget:
    ; swordSwingCount++
    ld a,(swordSwingCount)
    inc a
    ld (swordSwingCount),a

    ; if RND*7 + 15 > swordSwingCount then continue fight else miss and die
    call rand0To3                 ; approx randomness; reuse helper (0..3)
    ; scale: rand*7 +15 -> quick proxy: (rand*2)+15 vs swordSwingCount
    ld b,a
    ld a,b
    add a,a                       ; rand*2
    add a,15
    ld b,a                        ; B = threshold
    ld a,(swordSwingCount)
    cp b
    jp c,swordFightContinues      ; swordSwingCount < threshold => continue

    ld hl,strSwordMiss
    call printStr
    goto quitGame



swordFightContinues:

    if RND < .38 then
        goto swordKillsTarget
    end if

    randomFightMessage = INT(RND * 4)

    if hostileCreatureIndex = 5 then
        goto checkCreatureBatSpecial
    end if

    if randomFightMessage = 0 then
        ld hl,strAttackMove
        call printStr
    else
        if randomFightMessage = 1 then
            ld hl,strAttackDeflect
            call printStr
        else
            if randomFightMessage = 2 then
                ld hl,strAttackStun
                call printStr
            else
                ld hl,strAttackHeadBlow
                call printStr
            end if
        end if
    end if

    goto describeCurrentLocation



swordKillsTarget:

    ld hl,strSwordKills
    call printStr
    objectLocation(currentObjectIndex) = -1

    if hostileCreatureIndex = 3 or hostileCreatureIndex = 5 then
        objectLocation(hostileCreatureIndex) = objectLocation(hostileCreatureIndex) + 10
    else
        objectLocation(hostileCreatureIndex) = 0
        if hostileCreatureIndex = 1 then
            ld hl,strSwordCrumbles
            call printStr
            objectLocation(20) = 35
        end if
    end if

    if hostileCreatureIndex <> 4 then
        ld hl,strCorpseVapor
        call printStr
    end if

    hostileCreatureIndex = 0
    goto describeCurrentLocation



useBomb:

    if objectLocation(9) <> -1 and objectLocation(9) <> playerLocation then
        ld hl,strWontBurn
        call printStr
        candleIsLitFlag = 0
        goto describeCurrentLocation
    end if

    if candleIsLitFlag <> 1 then
        ld hl,strCandleOutStupid
        call printStr
        goto describeCurrentLocation
    end if

    ld hl,strBombExplode
    call printStr
    reshowFlag = 0

    if playerLocation > roomDarkRoom then
        playerLocation = playerLocation - 1
        if playerLocation = roomOakDoor then
            teleportDestination = 19
            call updateDynamicExits
        end if
    end if

    objectLocation(9) = 0
    goto describeCurrentLocation



useRope:

    if playerLocation <> roomTempleBalcony then
        ld hl,strTooDangerous
        call printStr
        goto describeCurrentLocation
    end if

    ld hl,strDescendRope
    call printStr
    reshowFlag = 0
    objectLocation(currentObjectIndex) = playerLocation
    playerLocation = roomTemple
    goto describeCurrentLocation



printObjectDescriptionSub:

    ; ---------------------------------------------------------
    ; printObjectDescriptionSub
    ; Purpose: print "a/an <adj> <noun>, " for the object/creature
    ; at currentObjectIndex using OBJDESC tables.
    ; Inputs: currentObjectIndex (1-based)
    ; Uses: BC, DE, HL
    ; ---------------------------------------------------------

    ; Fetch adjective pointer from objdesc1Table
    ld a,(currentObjectIndex)   ; A = index (1..24)
    dec a                         ; to 0-based
    add a,a                       ; *2 for word offset
    ld l,a
    ld h,0
    ld de,objdesc1Table          ; DE = base of adjectives
    add hl,de                     ; HL -> word entry
    ld e,(hl)                     ; E = low byte of adj ptr
    inc hl
    ld d,(hl)                     ; D = high byte of adj ptr

    ; Print article + adjective
    ex de,hl                      ; HL = adj pointer
    call printAdj                 ; emits "a/an <adj>"

    ; Fetch noun pointer from objdesc2Table
    ld a,(currentObjectIndex)   ; A = index
    dec a                         ; to 0-based
    add a,a                       ; *2 for word offset
    ld l,a
    ld h,0
    ld de,objdesc2Table          ; DE = base of nouns
    add hl,de                     ; HL -> word entry
    ld e,(hl)                     ; E = low byte of noun ptr
    inc hl
    ld d,(hl)                     ; D = high byte of noun ptr

    ; Print space + noun
    call printSpace
    ex de,hl                      ; HL = noun pointer
    call printStr

    ; Trailing comma and space to match original output
    ld a,','
    call putc
    call printSpace
    ret



routeByVerbPattern:

    ; ---------------------------------------------------------
    ; routeByVerbPattern
    ; Map the matched verbPatternIndex to specific handlers or
    ; default responses. Keeps verb ordering identical to BASIC.
    ; ---------------------------------------------------------

    if verbPatternIndex = 1 then           ; take
        goto handleGetCommand
    end if

    if verbPatternIndex = 2 then           ; drop
        goto handleDropCommand
    end if

    if verbPatternIndex = 3 or verbPatternIndex = 4 then ; using/with
        goto routeUseByObject
    end if

    if verbPatternIndex <= 6 then          ; cut/break/unlock/open
        ld hl,strNothingHappens
        call printStr
    else
        if verbPatternIndex >= 7 and verbPatternIndex <= 12 then ; kill/attack/light/burn/up/down
            ld hl,strPleaseTell
            call printStr
        else                                 ; jump/swim/other
            ld hl,strICant
            call printStr
        end if
    end if

    call printNewline                        ; blank line after response
    goto getPlayerInput                    ; re-prompt


printRankingSub:

    ld hl,strRanking
    call printStr

    if score < 20 then
        ld hl,strRankHopeless
        call printStr
    elseif score < 50 then
        ld hl,strRankLoser
        call printStr
    elseif score < 100 then
        ld hl,strRankAverage
        call printStr
    elseif score < 126 then
        ld hl,strRankExcellent
        call printStr
    else
        ld hl,strRankPerfect
        call printStr
    end if

    ret



readInputThenClearSub:

    input inputCommand$
    cls
    ret



encounterWizardLabel:

    ld hl,strEncWizard
    call printStr
    goto listRoomObjectsAndCreatures



encounterDragonLabel:

    ld hl,strEncDragon1
    call printStr
    ld hl,strEncDragon2
    call printStr
    goto listRoomObjectsAndCreatures



encounterDwarfLabel:

    ld hl,strEncDwarf
    call printStr
    goto listRoomObjectsAndCreatures



triggerCreatureIntroSub:

    if currentObjectIndex = 1 then
        goto encounterWizardLabel
    end if
    if currentObjectIndex = 4 then
        goto encounterDragonLabel
    end if
    if currentObjectIndex = 6 then
        goto encounterDwarfLabel
    end if
    ret



; ---------------------------------------------------------
updateDynamicExits:

    ; ---------------------------------------------------------
    ; updateDynamicExits
    ; Purpose: patch movement table entries that depend on
    ; runtime state (bridge, teleport, secret exits, drawbridge).
    ; Notes:
    ;   - All values are bytes; direct stores into movementTable.
    ;   - Caller updates the backing variables before invoking.
    ; ---------------------------------------------------------

    ; Patch dynamic exits in movement table

    movementTable(roomBridgeNorthAnchor,dirSouthStr) = bridgeCondition
    movementTable(roomBridgeSouthAnchor,dirNorthStr) = bridgeCondition
    movementTable(roomOakDoor,dirEastStr) = teleportDestination
    movementTable(roomCrypt,dirEastStr) = secretExitLocation
    movementTable(roomTinyCell,dirNorthStr) = waterExitLocation
    movementTable(roomTinyCell,dirEastStr) = gateDestination
    movementTable(roomCastleLedge,dirEastStr) = drawbridgeState
    ret


initState:
    ; ---------------------------------------------------------
    ; initState
    ; Purpose: reset all mutable state and copy static tables
    ; to working buffers.
    ; Steps:
    ;   1) Set all flags/counters to defaults.
    ;   2) Copy movementTableData -> movementTable (byte table).
    ;   3) Copy objectLocationTable -> objectLocation (bytes).
    ; Source of truth: matches pseudo2.txt gameStart defaults
    ; (bridgeCondition=11, drawbridgeState=128, waterExit=0,
    ;  GATE=0, TELEPORT=0, secretExit=0, playerLocation=roomDarkRoom,
    ;  candleIsLitFlag=1, counters zeroed).
    ; ---------------------------------------------------------

    ; Initialize flags and counters
    set8 bridgeCondition,11
    set8 drawbridgeState,128
    set8 waterExitLocation,0
    set8 gateDestination,0
    set8 teleportDestination,0
    set8 secretExitLocation,0

    set8 generalFlagJ,0
    set8 hostileCreatureIndex,0
    set8 reshowFlag,0
    set8 playerLocation,roomDarkRoom
    set8 candleIsLitFlag,1

    set8 fearCounter,0
    set8 turnCounter,0
    set8 swordSwingCount,0
    set8 score,0

    ; Copy static tables into mutable buffers
    copy movementTableData,movementTable,movementTableBytes
    copy objectLocationTable,objectLocation,objectCount
    ret
