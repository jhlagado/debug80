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
    .include "variables.asm"
    .include "utils.asm"
    .include "tables.asm"


GAME_START:

    cls

    call INIT_STATE

    call UPDATE_DYNAMIC_EXITS

    goto DESCRIBE_CURRENT_LOCATION



DESCRIBE_CURRENT_LOCATION:

    ; If a hostile creature is active (except some special case),
    ; jump to monster-attack logic
    if HOSTILE_CREATURE_INDEX > 0 and HOSTILE_CREATURE_INDEX <> 5 and CURRENT_OBJECT_INDEX <> OBJ_SWORD then
        goto MONSTER_ATTACK
    end if

    ; Darkness logic
    if PLAYER_LOCATION < ROOM_DARK_CAVERN_A or CANDLE_IS_LIT_FLAG = 1 and (OBJECT_LOCATION(21) = PLAYER_LOCATION or OBJECT_LOCATION(21) = -1) then
        goto PRINT_ROOM_DESCRIPTION
    end if

    print "It's very dark, too dark to see anything...I'm scared!"
    goto LIST_ROOM_OBJECTS_AND_CREATURES



PRINT_ROOM_DESCRIPTION:

    ; Pointer-based room descriptions (for assembly translation, @PTR means dereference)
    if ROOM_DESC1_TABLE(PLAYER_LOCATION) <> NULL then
        print @ROOM_DESC1_TABLE(PLAYER_LOCATION)
    end if

    if ROOM_DESC2_TABLE(PLAYER_LOCATION) <> NULL then
        print @ROOM_DESC2_TABLE(PLAYER_LOCATION)
    end if

    if PLAYER_LOCATION = ROOM_DARK_CAVERN_A or PLAYER_LOCATION = ROOM_DARK_CAVERN_B or PLAYER_LOCATION = ROOM_DARK_CAVERN_C or PLAYER_LOCATION > ROOM_TEMPLE_BALCONY and PLAYER_LOCATION < ROOM_DARK_CAVERN_G or PLAYER_LOCATION = ROOM_DARK_CAVERN_H or PLAYER_LOCATION = ROOM_DARK_CAVERN_I or PLAYER_LOCATION = ROOM_DARK_CAVERN_J or PLAYER_LOCATION = ROOM_DARK_CAVERN_K or PLAYER_LOCATION = ROOM_WOODEN_BRIDGE then
        print "You are deep in a dark cavern."
    end if

    if (PLAYER_LOCATION = ROOM_BRIDGE_NORTH_ANCHOR or PLAYER_LOCATION = ROOM_BRIDGE_SOUTH_ANCHOR) and BRIDGE_CONDITION = EXIT_FATAL then
        print "Two of the ropes have snapped under your weight. It's totally unfit to cross again."
    end if

    if PLAYER_LOCATION = ROOM_CAVE_ENTRANCE_CLEARING and OBJECT_LOCATION(OBJ_DRAGON) = 0 then
        print "You can also see the bloody corpse of an enormous dragon."
    end if

    if PLAYER_LOCATION = ROOM_CASTLE_LEDGE and DRAWBRIDGE_STATE = ROOM_DRAWBRIDGE then
        print " A mighty golden drawbridge spans the waters."
    end if

    if TURN_COUNTER > CANDLE_DIM_TURN then
        print "Your candle is growing dim."
    end if

    if TURN_COUNTER >= CANDLE_OUT_TURN then
        CANDLE_IS_LIT_FLAG = 0
        print "In fact...it went out!"
    end if

    goto LIST_ROOM_OBJECTS_AND_CREATURES



LIST_ROOM_OBJECTS_AND_CREATURES:

    VISIBLE_OBJECT_COUNT = 0

    for LOOP_INDEX = 7 to 24
        if OBJECT_LOCATION(LOOP_INDEX) = PLAYER_LOCATION then
            VISIBLE_OBJECT_COUNT = VISIBLE_OBJECT_COUNT + 1
        end if
    next LOOP_INDEX

    if VISIBLE_OBJECT_COUNT > 0 then
        print "You can also see..."
        for LOOP_INDEX = 7 to 24
            if OBJECT_LOCATION(LOOP_INDEX) = PLAYER_LOCATION then
                CURRENT_OBJECT_INDEX = LOOP_INDEX
                call PRINT_OBJECT_DESCRIPTION_SUB
            end if
        next LOOP_INDEX
    end if

    VISIBLE_CREATURE_COUNT = 0

    for LOOP_INDEX = 1 to 6
        if OBJECT_LOCATION(LOOP_INDEX) = PLAYER_LOCATION then
            VISIBLE_CREATURE_COUNT = VISIBLE_CREATURE_COUNT + 1
            CURRENT_OBJECT_INDEX = LOOP_INDEX
            call TRIGGER_CREATURE_INTRO_SUB
        end if
    next LOOP_INDEX

    if VISIBLE_CREATURE_COUNT > 0 then
        print "Nearby there lurks..."
        for LOOP_INDEX = 1 to 6
            if OBJECT_LOCATION(LOOP_INDEX) = PLAYER_LOCATION then
                CURRENT_OBJECT_INDEX = LOOP_INDEX
                call PRINT_OBJECT_DESCRIPTION_SUB
            end if
        next LOOP_INDEX
    end if

    print
    RESHOW_FLAG = 1
    print ">";

    if HOSTILE_CREATURE_INDEX > 0 and HOSTILE_CREATURE_INDEX <> 5 and CURRENT_OBJECT_INDEX <> 20 then
        goto MONSTER_ATTACK
    end if

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

    print "You are carrying ";
    VISIBLE_OBJECT_COUNT = 0

    for LOOP_INDEX = 7 to 24
        if OBJECT_LOCATION(LOOP_INDEX) = -1 then
            VISIBLE_OBJECT_COUNT = VISIBLE_OBJECT_COUNT + 1
        end if
    next LOOP_INDEX

    if VISIBLE_OBJECT_COUNT = 0 then
        print "nothing."
        goto DESCRIBE_CURRENT_LOCATION
    end if

    print
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

    print
    print "You have a score of"; SCORE; " out of a possible 126 points in"; TURN_COUNTER; " moves."

    call PRINT_RANKING_SUB

    print "Another adventure? ";

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
        print "The giant bat picked you up and carried you to another place."
        PLAYER_LOCATION = ROOM_BAT_CAVE
        RESHOW_FLAG = 0
        OBJECT_LOCATION(5) = OBJECT_LOCATION(5) + 7
        goto DESCRIBE_CURRENT_LOCATION
    end if

    goto HANDLE_VERB_OR_MOVEMENT



MONSTER_ATTACK:

    MONSTER_ADJECTIVE$ = @MONSTER_ADJ(HOSTILE_CREATURE_INDEX)
    MONSTER_NOUN$ = @MONSTER_NOUN(HOSTILE_CREATURE_INDEX)

    print "AUUUUUGH...you've just been killed by a"; MONSTER_ADJECTIVE$; MONSTER_NOUN$; "!!"

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
        print "You can't go that way"
    end if

    if TARGET_LOCATION = EXIT_FATAL then
        print "You stumble and fall into the chasm and smash yourself to a pulp on the rocks below."
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
        print "Suddenly a magic wind carried you to another place..."
        PLAYER_LOCATION = ROOM_CAVE_ENTRY
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ; Crypt wall "ape"
    if INSTR(INPUT_COMMAND$, " ape ") > 0 then
        print "Hey! the eastern wall of the crypt slid open..."
        SECRET_EXIT_LOCATION = 38
        call UPDATE_DYNAMIC_EXITS
        goto DESCRIBE_CURRENT_LOCATION
    end if

    if CURRENT_OBJECT_INDEX < 1 then
        print "eh?"
        goto DESCRIBE_CURRENT_LOCATION
    end if

    ; Object must be visible or carried
    if OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1 or OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION then
        goto CHECK_GET_DROP_USE
    else
        print "Where? I can't see it."
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
        print "You are carrying too many objects."
        goto DESCRIBE_CURRENT_LOCATION
    end if

    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1
    goto DESCRIBE_CURRENT_LOCATION



HANDLE_DROP_COMMAND:

    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION
    goto DESCRIBE_CURRENT_LOCATION



ROUTE_USE_BY_OBJECT:

    select case CURRENT_OBJECT_INDEX
        case OBJ_KEY
            goto USE_KEY
        case OBJ_SWORD
            goto USE_SWORD
        case OBJ_CANDLE
            goto USE_BOMB
        case OBJ_ROPE
            goto USE_ROPE
        case else
            print "How am I supposed to use it?"
            goto DESCRIBE_CURRENT_LOCATION
    end select



USE_KEY:

    if PLAYER_LOCATION <> ROOM_FOREST_CLEARING and PLAYER_LOCATION <> ROOM_TEMPLE then
        print "It won't open!"
        goto DESCRIBE_CURRENT_LOCATION
    end if

    print "You opened the door."
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
        print "But there's nothing to kill..."
        goto DESCRIBE_CURRENT_LOCATION
    end if

    SWORD_SWING_COUNT = SWORD_SWING_COUNT + 1

    if RND * 7 + 15 > SWORD_SWING_COUNT then
        goto SWORD_FIGHT_CONTINUES
    end if

    print "You swing with your sword but miss and the creature smashes your skull."
    goto QUIT_GAME



SWORD_FIGHT_CONTINUES:

    if RND < .38 then
        goto SWORD_KILLS_TARGET
    end if

    RANDOM_FIGHT_MESSAGE = INT(RND * 4)

    if HOSTILE_CREATURE_INDEX = 5 then
        goto CHECK_CREATURE_BAT_SPECIAL
    end if

    select case RANDOM_FIGHT_MESSAGE
        case 0
            print "You attack but the creature moves aside."
        case 1
            print "The creature deflects your blow."
        case 2
            print "The foe is stunned but quickly regains his balance."
        case 3
            print "You missed and he deals a blow to your head."
    end select

    goto DESCRIBE_CURRENT_LOCATION



SWORD_KILLS_TARGET:

    print "The sword strikes home and your foe dies..."
    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = -1

    if HOSTILE_CREATURE_INDEX = 3 or HOSTILE_CREATURE_INDEX = 5 then
        OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) = OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) + 10
    else
        OBJECT_LOCATION(HOSTILE_CREATURE_INDEX) = 0
        if HOSTILE_CREATURE_INDEX = 1 then
            print "Hey! Your sword has just crumbled into dust!!"
            OBJECT_LOCATION(20) = 35
        end if
    end if

    if HOSTILE_CREATURE_INDEX <> 4 then
        print "Suddenly a black cloud descends and the corpse vaporizes into nothing."
    end if

    HOSTILE_CREATURE_INDEX = 0
    goto DESCRIBE_CURRENT_LOCATION



USE_BOMB:

    if OBJECT_LOCATION(9) <> -1 and OBJECT_LOCATION(9) <> PLAYER_LOCATION then
        print "That won't burn, Dummy...In fact, the candle went out."
        CANDLE_IS_LIT_FLAG = 0
        goto DESCRIBE_CURRENT_LOCATION
    end if

    if CANDLE_IS_LIT_FLAG <> 1 then
        print "But the candle is out, stupid!!"
        goto DESCRIBE_CURRENT_LOCATION
    end if

    print "The fuse burnt away and....BOOM!!....the explosion blew you out of the way (Lucky!)"
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
        print "It's too dangerous!!!"
        goto DESCRIBE_CURRENT_LOCATION
    end if

    print "You descend the rope, but it drops 10 feet short of the floor. You jump the rest of the way."
    RESHOW_FLAG = 0
    OBJECT_LOCATION(CURRENT_OBJECT_INDEX) = PLAYER_LOCATION
    PLAYER_LOCATION = ROOM_TEMPLE
    goto DESCRIBE_CURRENT_LOCATION



PRINT_OBJECT_DESCRIPTION_SUB:

    print "a"; @OBJDESC1(CURRENT_OBJECT_INDEX); @OBJDESC2(CURRENT_OBJECT_INDEX); ", ";
    ret



ROUTE_BY_VERB_PATTERN:

    select case VERB_PATTERN_INDEX
        case 1
            goto HANDLE_GET_COMMAND
        case 2
            goto HANDLE_DROP_COMMAND
        case 3,4
            goto ROUTE_USE_BY_OBJECT
        case 5,6
            print "Nothing happens!"
        case 7 to 12
            print "Please tell me how."
        case else
            print "I can't!"
    end select

    print
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

    print "This gives you an adventurer's ranking of:"

    if SCORE < 20 then
        print "Hopeless beginner"
    elseif SCORE < 50 then
        print "Experienced loser"
    elseif SCORE < 100 then
        print "Average Viking"
    elseif SCORE < 126 then
        print "Excellent...but you've left something behind!"
    else
        print "Perfectionist and genius!!"
    end if

    ret



READ_INPUT_THEN_CLEAR_SUB:

    input INPUT_COMMAND$
    cls
    ret



ENCOUNTER_WIZARD_LABEL:

    print "There, before you in a swirling mist stands an evil wizard with his hand held outwards...`Thou shall not pass' he cries."
    goto LIST_ROOM_OBJECTS_AND_CREATURES



ENCOUNTER_DRAGON_LABEL:

    print "Before the entrance of the cave lies an enormous, green, sleeping dragon. Realizing your presence, its eyes flicker open"
    print "and it leaps up, breathing jets fire at you."
    goto LIST_ROOM_OBJECTS_AND_CREATURES



ENCOUNTER_DWARF_LABEL:

    print "From around the corner trots an old and gnarled drawf carrying a lantern. `My job is to protect these stone steps!' he says andlunges at you with his dagger."
    goto LIST_ROOM_OBJECTS_AND_CREATURES



TRIGGER_CREATURE_INTRO_SUB:

    select case CURRENT_OBJECT_INDEX
        case 1
            goto ENCOUNTER_WIZARD_LABEL
        case 4
            goto ENCOUNTER_DRAGON_LABEL
        case 6
            goto ENCOUNTER_DWARF_LABEL
    end select
    ret



; ---------------------------------------------------------
UPDATE_DYNAMIC_EXITS:

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
    ; Initialize flags and counters
    ld a,11
    ld (BRIDGE_CONDITION),a
    ld a,128
    ld (DRAWBRIDGE_STATE),a
    xor a
    ld (WATER_EXIT_LOCATION),a
    ld (GATE_DESTINATION),a
    ld (TELEPORT_DESTINATION),a
    ld (SECRET_EXIT_LOCATION),a

    xor a
    ld (GENERAL_FLAG_J),a
    ld (HOSTILE_CREATURE_INDEX),a
    ld (RESHOW_FLAG),a
    ld a,ROOM_DARK_ROOM
    ld (PLAYER_LOCATION),a
    ld a,1
    ld (CANDLE_IS_LIT_FLAG),a

    xor a
    ld (FEAR_COUNTER),a
    ld (TURN_COUNTER),a
    ld (SWORD_SWING_COUNT),a
    ld (SCORE),a

    ; Copy static tables into mutable buffers
    ld hl,MOVEMENT_TABLE_DATA
    ld de,MOVEMENT_TABLE
    ld bc,MOVEMENT_TABLE_BYTES
    ldir

    ld hl,OBJECT_LOCATION_TABLE
    ld de,OBJECT_LOCATION
    ld bc,OBJECT_COUNT
    ld hl,OBJECT_LOCATION_TABLE
    ld de,OBJECT_LOCATION
    ldir
    ret
