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
;  ROOM FLAGS: BRIDGE_CONDITION/H, DRAWBRIDGE_STATE/D,
;              WATER_EXIT_LOCATION/W, GATE_DESTINATION/G,
;              TELEPORT_DESTINATION/T, SECRET_EXIT_LOCATION/E
;  DIRECTION INDEX: DIR_NORTH_STR=0, DIR_SOUTH_STR=1, DIR_WEST_STR=2, DIR_EAST_STR=3

    .include "constants.asm"
    .include "macros.asm"
    .include "utils.asm"
    .include "tables.asm"
    .include "strings.asm"
    .include "variables.asm"


GAME_START:
    cls
    call INIT_STATE
    call UPDATE_DYNAMIC_EXITS
    goto DESCRIBE_CURRENT_LOCATION

DESCRIBE_CURRENT_LOCATION:

    ; ---------------------------------------------------------
    ; DESCRIBE_CURRENT_LOCATION
    ; Purpose: entry point after each player action to show the
    ; current room state or trigger an immediate monster attack.
    ; Steps:
    ;   1) If a hostile creature is present (non-bat) and player
    ;      is not holding the sword, jump to MONSTER_ATTACK.
    ;   2) Darkness check: if room index < first dark cavern OR
    ;      candle lit AND candle is present/carried, show room;
    ;      otherwise print darkness warning and list occupants.
    ;   3) Fall through to LIST_ROOM_OBJECTS_AND_CREATURES.
    ; Notes:
    ;   - Uses short-lived A loads for compares; all state lives
    ;     in RAM variables.
    ; ---------------------------------------------------------

    ; If a hostile creature is active (except some special case), jump to monster-attack logic
    ld a,(HOSTILE_CREATURE_INDEX)
    or a
    jp z,DC_DARKNESS_CHECK
    cp 5
    jp z,DC_DARKNESS_CHECK
    ld a,(CURRENT_OBJECT_INDEX)
    cp OBJ_SWORD
    jp z,DC_DARKNESS_CHECK
    jp MONSTER_ATTACK

DC_DARKNESS_CHECK:
    ; Darkness logic: show room description if lit or before dark caverns
    ld a,(PLAYER_LOCATION)
    cp ROOM_DARK_CAVERN_A
    jp c,PRINT_ROOM_DESCRIPTION

    ld a,(CANDLE_IS_LIT_FLAG)
    or a
    jp z,DC_SHOW_DARKNESS

    ; Is candle at player location?
    ld a,(OBJECT_LOCATION+20)        ; OBJ_CANDLE index 21 -> offset 20
    ld b,a
    ld a,(PLAYER_LOCATION)
    cp b
    jp z,PRINT_ROOM_DESCRIPTION

    ; Or carried? (-1 == 0xFF)
    ld a,b
    cp 255
    jp z,PRINT_ROOM_DESCRIPTION

DC_SHOW_DARKNESS:
    ld hl,STR_TOO_DARK
    call printStr
    jp LIST_ROOM_OBJECTS_AND_CREATURES



PRINT_ROOM_DESCRIPTION:

    ; ---------------------------------------------------------
    ; PRINT_ROOM_DESCRIPTION
    ; Purpose: show the room’s primary/secondary description and
    ; supplemental text based on dynamic state (darkness, bridge,
    ; dragon corpse, drawbridge, candle dim/out).
    ; Steps:
    ;   1) Fetch ROOM_DESC1/2_TABLE word pointers by room index
    ;      (1-based) and print if non-null.
    ;   2) Conditional extras:
    ;        - Dark cavern generic line for specific room ranges.
    ;        - Bridge warning when broken.
    ;        - Dragon corpse when present.
    ;        - Golden drawbridge when lowered.
    ;        - Candle dim/out thresholds (also clears lit flag).
    ;   3) Jump to LIST_ROOM_OBJECTS_AND_CREATURES.
    ; ---------------------------------------------------------

    ; Pointer-based room descriptions (for assembly translation, @PTR means dereference)
    ; ROOM_DESC1_TABLE entry (word) = DESC pointer for current room
    ld a,(PLAYER_LOCATION)
    dec a                       ; 0-based index
    add a,a                     ; *2 for word table
    ld l,a
    ld h,0
    ld de,ROOM_DESC1_TABLE
    add hl,de                   ; HL -> entry
    ld e,(hl)
    inc hl
    ld d,(hl)                   ; DE = ptr
    ld a,d
    or e
    jp z,PR_CHECK_DESC2
    push de
    call printStr               ; SVC_PUTS leaves HL at end of string
    pop de

PR_CHECK_DESC2:
    ld a,(PLAYER_LOCATION)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,ROOM_DESC2_TABLE
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ld a,d
    or e
    jp z,PR_AFTER_DESC
    push de
    call printStr
    pop de

PR_AFTER_DESC:
    ; ---------------------------------------------------------
    ; PR_AFTER_DESC
    ; After room description, emit contextual extras and candle
    ; warnings, then fall through to listing objects/creatures.
    ; ---------------------------------------------------------

    ; Check if current room needs the generic dark-cavern message
    ld a,(PLAYER_LOCATION)        ; A = current room
    ld b,a                        ; B = current room (reuse)
    cp ROOM_DARK_CAVERN_A         ; dark cavern A?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_B         ; dark cavern B?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_C         ; dark cavern C?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_H         ; dark cavern H?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_I         ; dark cavern I?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_J         ; dark cavern J?
    jp z,PRAD_PRINT_DARK
    cp ROOM_DARK_CAVERN_K         ; dark cavern K?
    jp z,PRAD_PRINT_DARK
    cp ROOM_WOODEN_BRIDGE         ; wooden bridge also dark
    jp z,PRAD_PRINT_DARK
    ld a,b                        ; A = current room
    cp ROOM_TEMPLE_BALCONY+1      ; >= 29? (caverns D/E/F)
    jp c,PRAD_BRIDGE_CHECK
    cp ROOM_DARK_CAVERN_G         ; < 32? (before cavern G)
    jp nc,PRAD_BRIDGE_CHECK
PRAD_PRINT_DARK:
    ld hl,STR_DARK_CAVERN         ; "You are deep in a dark cavern."
    call printStr                 ; emit dark cavern note

PRAD_BRIDGE_CHECK:
    ; Broken bridge message when at north/south anchor and bridge is fatal
    ld a,(PLAYER_LOCATION)        ; A = current room
    cp ROOM_BRIDGE_NORTH_ANCHOR   ; at north anchor?
    jr z,BRIDGE_MAYBE
    cp ROOM_BRIDGE_SOUTH_ANCHOR   ; at south anchor?
    jr nz,PRAD_DRAGON_CHECK
BRIDGE_MAYBE:
    ld a,(BRIDGE_CONDITION)       ; A = bridge state
    cp EXIT_FATAL                 ; snapped?
    jr nz,PRAD_DRAGON_CHECK
    ld hl,STR_BRIDGE_SNAPPED      ; "Two of the ropes have snapped..."
    call printStr                 ; warn bridge unusable

PRAD_DRAGON_CHECK:
    ; Dead dragon corpse visible only at cave entrance clearing when OBJ_DRAGON = 0
    ld a,(PLAYER_LOCATION)        ; A = current room
    cp ROOM_CAVE_ENTRANCE_CLEARING ; at cave entrance clearing?
    jr nz,PRAD_BRIDGE_STATE
    ld a,(OBJECT_LOCATION+3)      ; OBJ_DRAGON index 4 -> offset 3
    or a                          ; zero means corpse present
    jr nz,PRAD_BRIDGE_STATE
    ld hl,STR_DRAGON_CORPSE       ; "You can also see the bloody corpse..."
    call printStr                 ; show corpse line

PRAD_BRIDGE_STATE:
    ; Show golden drawbridge text when at castle ledge and drawbridge lowered
    ld a,(PLAYER_LOCATION)        ; A = current room
    cp ROOM_CASTLE_LEDGE          ; on castle ledge?
    jr nz,PRAD_CANDLE_DIM
    ld a,(DRAWBRIDGE_STATE)       ; A = drawbridge state
    cp ROOM_DRAWBRIDGE            ; lowered into room 49?
    jr nz,PRAD_CANDLE_DIM
    ld hl,STR_GOLD_BRIDGE         ; "A mighty golden drawbridge..."
    call printStr                 ; describe drawbridge

PRAD_CANDLE_DIM:
    ; Candle dim warning once past threshold
    ld a,(TURN_COUNTER)           ; A = turn count
    cp CANDLE_DIM_TURN            ; dim threshold reached?
    jr c,PRAD_CANDLE_OUT
    ld hl,STR_CANDLE_DIM          ; "Your candle is growing dim."
    call printStr                 ; warn dimming

PRAD_CANDLE_OUT:
    ; Candle extinguished once out threshold reached
    ld a,(TURN_COUNTER)           ; A = turn count
    cp CANDLE_OUT_TURN            ; out threshold?
    jp c,LIST_ROOM_OBJECTS_AND_CREATURES
    xor a                         ; A = 0
    ld (CANDLE_IS_LIT_FLAG),a     ; flag candle out
    ld hl,STR_CANDLE_OUT          ; "In fact...it went out!"
    call printStr                 ; announce candle out
    jp LIST_ROOM_OBJECTS_AND_CREATURES



LIST_ROOM_OBJECTS_AND_CREATURES:

    ; ---------------------------------------------------------
    ; LIST_ROOM_OBJECTS_AND_CREATURES
    ; After room description/extras, list objects and creatures in
    ; the current room, trigger first-encounter text, then show the
    ; prompt and possibly launch an attack if a hostile is present.
    ; ---------------------------------------------------------

    VISIBLE_OBJECT_COUNT = 0      ; reset visible object counter

    ; Count objects at current location (indices 7..24)
    ld a,7                        ; start at object index 7
    ld (LOOP_INDEX),a             ; LOOP_INDEX = 7
LOC_COUNT_OBJECTS:
    ld a,(LOOP_INDEX)             ; A = current object index
    cp 25                         ; past last object?
    jp z,LOC_COUNT_DONE           ; done counting
    ld a,(LOOP_INDEX)             ; A = index
    sub 1                         ; convert to 0-based offset
    ld l,a
    ld h,0
    ld de,OBJECT_LOCATION         ; DE = base of object locations
    add hl,de                     ; HL -> OBJECT_LOCATION(index)
    ld a,(hl)                     ; A = object location
    ld b,a                        ; B = copy of location
    ld a,(PLAYER_LOCATION)        ; A = player room
    cp b                          ; same room?
    jp nz,LOC_NEXT_OBJ            ; skip if not here
    ld a,(VISIBLE_OBJECT_COUNT)   ; A = count so far
    inc a                         ; count++
    ld (VISIBLE_OBJECT_COUNT),a   ; store updated count
LOC_NEXT_OBJ:
    ld a,(LOOP_INDEX)             ; A = index
    inc a                         ; index++
    ld (LOOP_INDEX),a             ; store
    jp LOC_COUNT_OBJECTS          ; continue loop
LOC_COUNT_DONE:

    if VISIBLE_OBJECT_COUNT > 0 then
        ld hl,STR_SEE_OBJECTS     ; "You can also see..."
        call printStr             ; print header
        ; List objects at current location
        ld a,7                    ; restart at object 7
        ld (LOOP_INDEX),a
LOC_LIST_OBJECTS:
        ld a,(LOOP_INDEX)         ; A = object index
        cp 25                     ; done listing?
        jp z,LOC_DONE_LIST
        ld a,(LOOP_INDEX)         ; A = index
        sub 1                     ; to offset
        ld l,a
        ld h,0
        ld de,OBJECT_LOCATION     ; DE = base
        add hl,de                 ; HL -> OBJECT_LOCATION(index)
        ld a,(hl)                 ; A = object location
        ld b,a                    ; B = location copy
        ld a,(PLAYER_LOCATION)    ; A = player room
        cp b                      ; object here?
        jp nz,LOC_NEXT_LIST       ; skip if not
        ld a,(LOOP_INDEX)         ; A = object index
        ld (CURRENT_OBJECT_INDEX),a ; remember current object index
        call PRINT_OBJECT_DESCRIPTION_SUB ; print "a/an <adj> <noun>, "
LOC_NEXT_LIST:
        ld a,(LOOP_INDEX)         ; A = index
        inc a                     ; next object
        ld (LOOP_INDEX),a         ; store
        jp LOC_LIST_OBJECTS       ; loop list
LOC_DONE_LIST:
    end if

    VISIBLE_CREATURE_COUNT = 0    ; reset visible creature counter

    ; Count/intro creatures at current location (indices 1..6)
    ld a,1                        ; start at creature index 1
    ld (LOOP_INDEX),a             ; LOOP_INDEX = 1
LOC_COUNT_CREATURES:
    ld a,(LOOP_INDEX)             ; A = creature index
    cp 7                          ; past last creature?
    jp z,LOC_COUNT_CRE_DONE       ; done counting
    ld a,(LOOP_INDEX)             ; A = index
    sub 1                         ; to offset
    ld l,a
    ld h,0
    ld de,OBJECT_LOCATION         ; DE = base
    add hl,de                     ; HL -> OBJECT_LOCATION(index)
    ld a,(hl)                     ; A = creature location
    ld b,a                        ; B = location copy
    ld a,(PLAYER_LOCATION)        ; A = player room
    cp b                          ; creature here?
    jp nz,LOC_NEXT_CRE            ; skip if not here
    ld a,(VISIBLE_CREATURE_COUNT) ; A = creature count
    inc a                         ; count++
    ld (VISIBLE_CREATURE_COUNT),a ; store
    ld a,(LOOP_INDEX)             ; A = creature index
    ld (CURRENT_OBJECT_INDEX),a   ; remember current creature
    call TRIGGER_CREATURE_INTRO_SUB ; trigger intro text if needed
LOC_NEXT_CRE:
    ld a,(LOOP_INDEX)             ; A = index
    inc a                         ; next creature
    ld (LOOP_INDEX),a             ; store
    jp LOC_COUNT_CREATURES        ; loop
LOC_COUNT_CRE_DONE:

    if VISIBLE_CREATURE_COUNT > 0 then
        ld hl,STR_SEE_CREATURES   ; "Nearby there lurks..."
        call printStr             ; print creature header
        ; List creatures at current location
        ld a,1                    ; restart at creature 1
        ld (LOOP_INDEX),a
LOC_LIST_CREATURES:
        ld a,(LOOP_INDEX)         ; A = creature index
        cp 7                      ; finished listing?
        jp z,LOC_LIST_CRE_DONE
        ld a,(LOOP_INDEX)         ; A = index
        sub 1                     ; to offset
        ld l,a
        ld h,0
        ld de,OBJECT_LOCATION     ; DE = base
        add hl,de                 ; HL -> OBJECT_LOCATION(index)
        ld a,(hl)                 ; A = creature location
        ld b,a                    ; B = location copy
        ld a,(PLAYER_LOCATION)    ; A = player room
        cp b                      ; creature here?
        jp nz,LOC_NEXT_CRE_LIST   ; skip if not
        ld a,(LOOP_INDEX)         ; A = creature index
        ld (CURRENT_OBJECT_INDEX),a ; remember creature index
        call PRINT_OBJECT_DESCRIPTION_SUB ; print "a/an <adj> <noun>, "
LOC_NEXT_CRE_LIST:
        ld a,(LOOP_INDEX)         ; A = index
        inc a                     ; next creature
        ld (LOOP_INDEX),a         ; store
        jp LOC_LIST_CREATURES     ; loop listing
LOC_LIST_CRE_DONE:
    end if

    call printNewline             ; blank line
    ld hl,STR_PROMPT              ; ">"
    call printStr                 ; show prompt
    SET8 RESHOW_FLAG,1            ; remember we displayed room

    ld a,(HOSTILE_CREATURE_INDEX) ; A = hostile index (0 if none)
    or a                          ; any hostile?
    jp z,LOC_DONE                 ; none -> input
    cp 5                          ; dragon handled elsewhere; bat (6) non-hostile
    jp z,LOC_DONE
    ld a,(CURRENT_OBJECT_INDEX)   ; A = last listed index
    cp OBJ_SWORD                  ; sword available?
    jp z,LOC_DONE                 ; sword means no auto attack
    jp MONSTER_ATTACK             ; attack player
LOC_DONE:

    goto GET_PLAYER_INPUT



GET_PLAYER_INPUT:

    input INPUT_COMMAND$

    if INPUT_COMMAND$ = "" then
        goto GET_PLAYER_INPUT
    end if

    INPUT_COMMAND$ = " " + INPUT_COMMAND$ + " "
    TURN_COUNTER = TURN_COUNTER + 1

    call NORMALIZE_INPUT_SUB

    cls

    goto PARSE_COMMAND_ENTRY



PARSE_COMMAND_ENTRY:

    CURRENT_OBJECT_INDEX = 0
    OBJECT_ADJECTIVE$ = ""
    OBJECT_NOUN$ = ""

    for LOOP_INDEX = 7 to 24
        OBJECT_ADJECTIVE$ = @OBJECT_NAME_ADJ(LOOP_INDEX)
        OBJECT_NOUN$ = @OBJECT_NAME_NOUN(LOOP_INDEX)
        if INSTR(INPUT_COMMAND$, OBJECT_NOUN$) > 0 then
            CURRENT_OBJECT_INDEX = LOOP_INDEX
            EXIT for
        end if
    next LOOP_INDEX

    if CURRENT_OBJECT_INDEX = 0 then
        OBJECT_ADJECTIVE$ = ""
        OBJECT_NOUN$ = ""
    end if

    ; Bridge condition when halfway
    if PLAYER_LOCATION = ROOM_BRIDGE_MID then
        BRIDGE_CONDITION = 128
        call UPDATE_DYNAMIC_EXITS
    end if

    ; Hut flag
    if PLAYER_LOCATION = ROOM_FOREST_CLEARING then
        GENERAL_FLAG_J = 1
    end if

    if PLAYER_LOCATION = ROOM_WATERFALL_BASE then
        WATER_EXIT_LOCATION = 43
        call UPDATE_DYNAMIC_EXITS
    end if

    if PLAYER_LOCATION = ROOM_TEMPLE then
        WATER_EXIT_LOCATION = 0
        call UPDATE_DYNAMIC_EXITS
    end if

    if OBJECT_LOCATION(OBJ_GRILL) <> ROOM_TINY_CELL then
        GATE_DESTINATION = 39
        call UPDATE_DYNAMIC_EXITS
    end if

    if PLAYER_LOCATION = ROOM_DRAWBRIDGE then
        DRAWBRIDGE_STATE = 49
        call UPDATE_DYNAMIC_EXITS
    end if

    ; LOOK command
    if INSTR(INPUT_COMMAND$, " look ") > 0 then
        RESHOW_FLAG = 0
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ; LIST inventory
    if INSTR(INPUT_COMMAND$, " list ") > 0 then
        goto SHOW_INVENTORY
    end if

    ; QUIT
    if INSTR(INPUT_COMMAND$, " quit ") > 0 then
        goto QUIT_GAME
    end if

    goto CHECK_CREATURE_AT_LOCATION



SHOW_INVENTORY:

    ld hl,STR_CARRYING_PREFIX
    call printStr
    VISIBLE_OBJECT_COUNT = 0

    for LOOP_INDEX = 7 to 24
        if OBJECT_LOCATION(LOOP_INDEX) = -1 then
            VISIBLE_OBJECT_COUNT = VISIBLE_OBJECT_COUNT + 1
        end if
    next LOOP_INDEX

    if VISIBLE_OBJECT_COUNT = 0 then
        ld hl,STR_NOTHING
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    call printNewline
    for LOOP_INDEX = 7 to 24
        if OBJECT_LOCATION(LOOP_INDEX) = -1 then
            CURRENT_OBJECT_INDEX = LOOP_INDEX
            call PRINT_OBJECT_DESCRIPTION_SUB
        end if
    next LOOP_INDEX

    goto DESCRIBE_CURRENT_LOCATION



QUIT_GAME:

    SCORE = 0

    for LOOP_INDEX = 7 to 17
        if OBJECT_LOCATION(LOOP_INDEX) = -1 then
            SCORE = SCORE + LOOP_INDEX - 6
        end if
        if OBJECT_LOCATION(LOOP_INDEX) = 1 then
            SCORE = SCORE + (LOOP_INDEX - 6) * 2
        end if
    next LOOP_INDEX

    call printNewline
    ld hl,STR_SCORE_PREFIX
    call printStr
    ld a,(SCORE)
    ld l,a
    ld h,0
    call printNum
    ld hl,STR_SCORE_MID
    call printStr
    ld a,(TURN_COUNTER)
    ld l,a
    ld h,0
    call printNum
    ld hl,STR_SCORE_SUFFIX
    call printStr

    call PRINT_RANKING_SUB

    ld hl,STR_ANOTHER
    call printStr

WAIT_FOR_YES_NO:
    YESNO_KEY$ = INKEY$
    if YESNO_KEY$ = "" then
        goto WAIT_FOR_YES_NO
    end if

    if YESNO_KEY$ = "N" or YESNO_KEY$ = "n" then
        end
    end if

    if YESNO_KEY$ = "Y" or YESNO_KEY$ = "y" then
        goto GAME_START
    end if

    goto WAIT_FOR_YES_NO



CHECK_CREATURE_AT_LOCATION:

    for HOSTILE_CREATURE_INDEX = 1 to 6
        if OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) = PLAYER_LOCATION then
            goto CHECK_CREATURE_BAT_SPECIAL
        end if
    next HOSTILE_CREATURE_INDEX

    HOSTILE_CREATURE_INDEX = 0
    goto HANDLE_VERB_OR_MOVEMENT



CHECK_CREATURE_BAT_SPECIAL:

    if HOSTILE_CREATURE_INDEX = 5 then
        ld hl,STR_GIANT_BAT
        call printStr
        PLAYER_LOCATION = ROOM_BAT_CAVE
        RESHOW_FLAG = 0
        OBJECT_LOCATION(5) = OBJECT_LOCATION(5) + 7
        goto DESCRIBE_CURRENT_LOCATION
    end if

    goto HANDLE_VERB_OR_MOVEMENT



MONSTER_ATTACK:
    ; Print "killed by a <adj><noun>!!"
    ld hl,STR_MONSTER_KILLED
    call printStr

    ; Fetch monster adjective pointer
    ld a,(HOSTILE_CREATURE_INDEX)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,MONSTER_ADJ_DATA
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    call printStr

    ; Fetch monster noun pointer
    ld a,(HOSTILE_CREATURE_INDEX)
    dec a
    add a,a
    ld l,a
    ld h,0
    ld de,MONSTER_NOUN_DATA
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    call printStr

    ld hl,STR_MONSTER_SUFFIX
    call printStr

    goto QUIT_GAME



HANDLE_VERB_OR_MOVEMENT:

    ; First route generic verbs via the pattern table (take/put/unlock/jump/etc.)
    for VERB_PATTERN_INDEX = 1 to 16
        if INSTR(INPUT_COMMAND$, @VERB_PATTERN(VERB_PATTERN_INDEX)) > 0 then
            goto ROUTE_BY_VERB_PATTERN
        end if
    next VERB_PATTERN_INDEX

    ; Then check for movement (north/south/etc.)
    for DIRECTION_INDEX = 0 to 3
        if INSTR(INPUT_COMMAND$, @DIR_WORD_INDEX(DIRECTION_INDEX+1)) > 0 then
            goto HANDLE_MOVEMENT_COMMAND
        end if
    next DIRECTION_INDEX

    goto HANDLE_NON_MOVEMENT_COMMAND



HANDLE_MOVEMENT_COMMAND:

    ; Special check related to bomb or location
    if OBJECT_LOCATION(OBJ_BOMB) <> -1 and OBJECT_LOCATION(OBJ_BOMB) <> PLAYER_LOCATION then
        RANDOM_DIRECTION_INDEX = INT(RND * 4)
    else
        RANDOM_DIRECTION_INDEX = 0
    end if

    TARGET_LOCATION = MOVEMENT_TABLE(PLAYER_LOCATION, RANDOM_DIRECTION_INDEX)

    if TARGET_LOCATION = EXIT_NONE then
        ld hl,STR_CANT_GO_THAT_WAY
        call printStr
        call printNewline
    end if

    if TARGET_LOCATION = EXIT_FATAL then
        ld hl,STR_FATAL_FALL
        call printStr
        call printNewline
        goto QUIT_GAME
    end if

    if TARGET_LOCATION > 0 then
        PLAYER_LOCATION = TARGET_LOCATION
    end if

    RESHOW_FLAG = 0
    goto DESCRIBE_CURRENT_LOCATION



HANDLE_NON_MOVEMENT_COMMAND:

    ; Magic word "galar"
    if INSTR(INPUT_COMMAND$, " galar ") > 0 then
        RESHOW_FLAG = 0
        ld hl,STR_MAGIC_WIND
        call printStr
        PLAYER_LOCATION = ROOM_CAVE_ENTRY
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ; Crypt wall "ape"
    if INSTR(INPUT_COMMAND$, " ape ") > 0 then
        ld hl,STR_CRYPT_WALL
        call printStr
        SECRET_EXIT_LOCATION = 38
        call UPDATE_DYNAMIC_EXITS
        goto DESCRIBE_CURRENT_LOCATION
    end if

    if CURRENT_OBJECT_INDEX < 1 then
        ld hl,STR_EH
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ; Object must be visible or carried
    if OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1 or OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION then
        goto CHECK_GET_DROP_USE
    else
        ld hl,STR_CANT_SEE_IT
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if



CHECK_GET_DROP_USE:

    ; GET command
    if INSTR(INPUT_COMMAND$, " get ") > 0 then
        goto HANDLE_GET_COMMAND
    end if

    ; DROP command
    if INSTR(INPUT_COMMAND$, " drop ") > 0 then
        goto HANDLE_DROP_COMMAND
    end if

    ; USE-type verbs routed by object index
    goto ROUTE_USE_BY_OBJECT



HANDLE_GET_COMMAND:

    CARRIED_COUNT = 0

    for LOOP_INDEX = 7 to 24
        if OBJECT_LOCATION(LOOP_INDEX) = -1 then
            CARRIED_COUNT = CARRIED_COUNT + 1
        end if
    next LOOP_INDEX

    if CARRIED_COUNT > 10 then
        ld hl,STR_TOO_MANY_OBJECTS
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1
    goto DESCRIBE_CURRENT_LOCATION



HANDLE_DROP_COMMAND:

    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION
    goto DESCRIBE_CURRENT_LOCATION



ROUTE_USE_BY_OBJECT:

    if CURRENT_OBJECT_INDEX = OBJ_KEY then
        goto USE_KEY
    end if
    if CURRENT_OBJECT_INDEX = OBJ_SWORD then
        goto USE_SWORD
    end if
    if CURRENT_OBJECT_INDEX = OBJ_CANDLE then
        goto USE_BOMB
    end if
    if CURRENT_OBJECT_INDEX = OBJ_ROPE then
        goto USE_ROPE
    end if

    ld hl,STR_USE_HOW
    call printStr
    goto DESCRIBE_CURRENT_LOCATION



USE_KEY:

    if PLAYER_LOCATION <> ROOM_FOREST_CLEARING and PLAYER_LOCATION <> ROOM_TEMPLE then
        ld hl,STR_WONT_OPEN
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ld hl,STR_DOOR_OPENED
    call printStr
    OBJECT_LOCATION(19) = PLAYER_LOCATION
    RESHOW_FLAG = 0

    if PLAYER_LOCATION = ROOM_FOREST_CLEARING then
        PLAYER_LOCATION = ROOM_DARK_ROOM
        goto DESCRIBE_CURRENT_LOCATION
    else
        PLAYER_LOCATION = ROOM_CRYPT
        goto DESCRIBE_CURRENT_LOCATION
    end if



USE_SWORD:

    if HOSTILE_CREATURE_INDEX = 0 then
        ld hl,STR_NOTHING_TO_KILL
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    SWORD_SWING_COUNT = SWORD_SWING_COUNT + 1

    if RND * 7 + 15 > SWORD_SWING_COUNT then
        goto SWORD_FIGHT_CONTINUES
    end if

    ld hl,STR_SWORD_MISS
    call printStr
    goto QUIT_GAME



SWORD_FIGHT_CONTINUES:

    if RND < .38 then
        goto SWORD_KILLS_TARGET
    end if

    RANDOM_FIGHT_MESSAGE = INT(RND * 4)

    if HOSTILE_CREATURE_INDEX = 5 then
        goto CHECK_CREATURE_BAT_SPECIAL
    end if

    if RANDOM_FIGHT_MESSAGE = 0 then
        ld hl,STR_ATTACK_MOVE
        call printStr
    else
        if RANDOM_FIGHT_MESSAGE = 1 then
            ld hl,STR_ATTACK_DEFLECT
            call printStr
        else
            if RANDOM_FIGHT_MESSAGE = 2 then
                ld hl,STR_ATTACK_STUN
                call printStr
            else
                ld hl,STR_ATTACK_HEAD_BLOW
                call printStr
            end if
        end if
    end if

    goto DESCRIBE_CURRENT_LOCATION



SWORD_KILLS_TARGET:

    ld hl,STR_SWORD_KILLS
    call printStr
    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1

    if HOSTILE_CREATURE_INDEX = 3 or HOSTILE_CREATURE_INDEX = 5 then
        OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) = OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) + 10
    else
        OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) = 0
        if HOSTILE_CREATURE_INDEX = 1 then
            ld hl,STR_SWORD_CRUMBLES
            call printStr
            OBJECT_LOCATION(20) = 35
        end if
    end if

    if HOSTILE_CREATURE_INDEX <> 4 then
        ld hl,STR_CORPSE_VAPOR
        call printStr
    end if

    HOSTILE_CREATURE_INDEX = 0
    goto DESCRIBE_CURRENT_LOCATION



USE_BOMB:

    if OBJECT_LOCATION(9) <> -1 and OBJECT_LOCATION(9) <> PLAYER_LOCATION then
        ld hl,STR_WONT_BURN
        call printStr
        CANDLE_IS_LIT_FLAG = 0
        goto DESCRIBE_CURRENT_LOCATION
    end if

    if CANDLE_IS_LIT_FLAG <> 1 then
        ld hl,STR_CANDLE_OUT_STUPID
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ld hl,STR_BOMB_EXPLODE
    call printStr
    RESHOW_FLAG = 0

    if PLAYER_LOCATION > ROOM_DARK_ROOM then
        PLAYER_LOCATION = PLAYER_LOCATION - 1
        if PLAYER_LOCATION = ROOM_OAK_DOOR then
            TELEPORT_DESTINATION = 19
            call UPDATE_DYNAMIC_EXITS
        end if
    end if

    OBJECT_LOCATION(9) = 0
    goto DESCRIBE_CURRENT_LOCATION



USE_ROPE:

    if PLAYER_LOCATION <> ROOM_TEMPLE_BALCONY then
        ld hl,STR_TOO_DANGEROUS
        call printStr
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ld hl,STR_DESCEND_ROPE
    call printStr
    RESHOW_FLAG = 0
    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION
    PLAYER_LOCATION = ROOM_TEMPLE
    goto DESCRIBE_CURRENT_LOCATION



PRINT_OBJECT_DESCRIPTION_SUB:

    print "a"; @OBJDESC1(CURRENT_OBJECT_INDEX); @OBJDESC2(CURRENT_OBJECT_INDEX); ", ";
    ret



ROUTE_BY_VERB_PATTERN:

    if VERB_PATTERN_INDEX = 1 then
        goto HANDLE_GET_COMMAND
    end if

    if VERB_PATTERN_INDEX = 2 then
        goto HANDLE_DROP_COMMAND
    end if

    if VERB_PATTERN_INDEX = 3 or VERB_PATTERN_INDEX = 4 then
        goto ROUTE_USE_BY_OBJECT
    end if

    if VERB_PATTERN_INDEX <= 6 then
        ld hl,STR_NOTHING_HAPPENS
        call printStr
    else
        if VERB_PATTERN_INDEX >= 7 and VERB_PATTERN_INDEX <= 12 then
            ld hl,STR_PLEASE_TELL
            call printStr
        else
            ld hl,STR_I_CANT
            call printStr
        end if
    end if

    call printNewline
    goto GET_PLAYER_INPUT


NORMALIZE_INPUT_SUB:

    ; Convert uppercase to lowercase for parsing
    for LOOP_INDEX_X = 1 to LEN(INPUT_COMMAND$)
        CHARACTER_CODE = ASC(MID$(INPUT_COMMAND$, LOOP_INDEX_X, 1))
        if CHARACTER_CODE > 64 and CHARACTER_CODE < 91 then
            TEMP_COMMAND$ = LEFT$(INPUT_COMMAND$, LOOP_INDEX_X - 1) + CHR$(CHARACTER_CODE + 32) + MID$(INPUT_COMMAND$, LOOP_INDEX_X + 1)
            INPUT_COMMAND$ = TEMP_COMMAND$
        end if
    next LOOP_INDEX_X
    ret


PRINT_RANKING_SUB:

    ld hl,STR_RANKING
    call printStr

    if SCORE < 20 then
        ld hl,STR_RANK_HOPELESS
        call printStr
    elseif SCORE < 50 then
        ld hl,STR_RANK_LOSER
        call printStr
    elseif SCORE < 100 then
        ld hl,STR_RANK_AVERAGE
        call printStr
    elseif SCORE < 126 then
        ld hl,STR_RANK_EXCELLENT
        call printStr
    else
        ld hl,STR_RANK_PERFECT
        call printStr
    end if

    ret



READ_INPUT_THEN_CLEAR_SUB:

    input INPUT_COMMAND$
    cls
    ret



ENCOUNTER_WIZARD_LABEL:

    ld hl,STR_ENC_WIZARD
    call printStr
    goto LIST_ROOM_OBJECTS_AND_CREATURES



ENCOUNTER_DRAGON_LABEL:

    ld hl,STR_ENC_DRAGON1
    call printStr
    ld hl,STR_ENC_DRAGON2
    call printStr
    goto LIST_ROOM_OBJECTS_AND_CREATURES



ENCOUNTER_DWARF_LABEL:

    ld hl,STR_ENC_DWARF
    call printStr
    goto LIST_ROOM_OBJECTS_AND_CREATURES



TRIGGER_CREATURE_INTRO_SUB:

    if CURRENT_OBJECT_INDEX = 1 then
        goto ENCOUNTER_WIZARD_LABEL
    end if
    if CURRENT_OBJECT_INDEX = 4 then
        goto ENCOUNTER_DRAGON_LABEL
    end if
    if CURRENT_OBJECT_INDEX = 6 then
        goto ENCOUNTER_DWARF_LABEL
    end if
    ret



; ---------------------------------------------------------
UPDATE_DYNAMIC_EXITS:

    ; ---------------------------------------------------------
    ; UPDATE_DYNAMIC_EXITS
    ; Purpose: patch movement table entries that depend on
    ; runtime state (bridge, teleport, secret exits, drawbridge).
    ; Notes:
    ;   - All values are bytes; direct stores into MOVEMENT_TABLE.
    ;   - Caller updates the backing variables before invoking.
    ; ---------------------------------------------------------

    ; Patch dynamic exits in movement table

    MOVEMENT_TABLE(ROOM_BRIDGE_NORTH_ANCHOR,DIR_SOUTH_STR) = BRIDGE_CONDITION
    MOVEMENT_TABLE(ROOM_BRIDGE_SOUTH_ANCHOR,DIR_NORTH_STR) = BRIDGE_CONDITION
    MOVEMENT_TABLE(ROOM_OAK_DOOR,DIR_EAST_STR) = TELEPORT_DESTINATION
    MOVEMENT_TABLE(ROOM_CRYPT,DIR_EAST_STR) = SECRET_EXIT_LOCATION
    MOVEMENT_TABLE(ROOM_TINY_CELL,DIR_NORTH_STR) = WATER_EXIT_LOCATION
    MOVEMENT_TABLE(ROOM_TINY_CELL,DIR_EAST_STR) = GATE_DESTINATION
    MOVEMENT_TABLE(ROOM_CASTLE_LEDGE,DIR_EAST_STR) = DRAWBRIDGE_STATE
    ret


INIT_STATE:
    ; ---------------------------------------------------------
    ; INIT_STATE
    ; Purpose: reset all mutable state and copy static tables
    ; to working buffers.
    ; Steps:
    ;   1) Set all flags/counters to defaults.
    ;   2) Copy MOVEMENT_TABLE_DATA -> MOVEMENT_TABLE (byte table).
    ;   3) Copy OBJECT_LOCATION_TABLE -> OBJECT_LOCATION (bytes).
    ; Source of truth: matches pseudo2.txt GAME_START defaults
    ; (BRIDGE_CONDITION=11, DRAWBRIDGE_STATE=128, WATER_EXIT=0,
    ;  GATE=0, TELEPORT=0, SECRET_EXIT=0, PLAYER_LOCATION=ROOM_DARK_ROOM,
    ;  CANDLE_IS_LIT_FLAG=1, counters zeroed).
    ; ---------------------------------------------------------

    ; Initialize flags and counters
    SET8 BRIDGE_CONDITION,11
    SET8 DRAWBRIDGE_STATE,128
    SET8 WATER_EXIT_LOCATION,0
    SET8 GATE_DESTINATION,0
    SET8 TELEPORT_DESTINATION,0
    SET8 SECRET_EXIT_LOCATION,0

    SET8 GENERAL_FLAG_J,0
    SET8 HOSTILE_CREATURE_INDEX,0
    SET8 RESHOW_FLAG,0
    SET8 PLAYER_LOCATION,ROOM_DARK_ROOM
    SET8 CANDLE_IS_LIT_FLAG,1

    SET8 FEAR_COUNTER,0
    SET8 TURN_COUNTER,0
    SET8 SWORD_SWING_COUNT,0
    SET8 SCORE,0

    ; Copy static tables into mutable buffers
    COPY MOVEMENT_TABLE_DATA,MOVEMENT_TABLE,MOVEMENT_TABLE_BYTES
    COPY OBJECT_LOCATION_TABLE,OBJECT_LOCATION,OBJECT_COUNT
    ret
