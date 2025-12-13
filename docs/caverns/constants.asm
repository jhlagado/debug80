; ---------------------------------------------------------
;  Constants for Caverns
; ---------------------------------------------------------

; Exit codes
EXIT_NONE        equ 0
EXIT_FATAL       equ 128

; Turn thresholds for candle
CANDLE_DIM_TURN  equ 200
CANDLE_OUT_TURN  equ 230

; Direction indices
DIR_NORTH        equ 0
DIR_SOUTH        equ 1
DIR_WEST         equ 2
DIR_EAST         equ 3

; Room ID constants (1..54)
ROOM_DARK_ROOM             equ 1
ROOM_FOREST_CLEARING       equ 2
ROOM_DARK_FOREST           equ 3
ROOM_CLOVER_FIELD          equ 4
ROOM_RIVER_CLIFF           equ 5
ROOM_RIVER_BANK            equ 6
ROOM_CRATER_EDGE           equ 7
ROOM_RIVER_OUTCROP         equ 8
ROOM_MT_YMIR_SLOPE         equ 9
ROOM_BRIDGE_NORTH_ANCHOR   equ 10
ROOM_BRIDGE_MID            equ 11
ROOM_BRIDGE_SOUTH_ANCHOR   equ 12
ROOM_MUSHROOM_ROCK         equ 13
ROOM_CAVE_ENTRANCE_CLEARING equ 14
ROOM_CLIFF_FACE            equ 15
ROOM_CAVE_ENTRY            equ 16
ROOM_DEAD_END_INSCRIPTION  equ 17
ROOM_DARK_CAVERN_A         equ 18
ROOM_TREASURE_ROOM         equ 19
ROOM_OAK_DOOR              equ 20
ROOM_DARK_CAVERN_B         equ 21
ROOM_WIND_CORRIDOR         equ 22
ROOM_TORTURE_CHAMBER       equ 23
ROOM_NORTH_SOUTH_TUNNEL    equ 24
ROOM_DARK_CAVERN_C         equ 25
ROOM_ROUND_ROOM            equ 26
ROOM_LEDGE_OVER_RIVER      equ 27
ROOM_TEMPLE_BALCONY        equ 28
ROOM_DARK_CAVERN_D         equ 29
ROOM_DARK_CAVERN_E         equ 30
ROOM_DARK_CAVERN_F         equ 31
ROOM_DARK_CAVERN_G         equ 32
ROOM_BAT_CAVE              equ 33
ROOM_DARK_CAVERN_H         equ 34
ROOM_TEMPLE                equ 35
ROOM_DARK_CAVERN_I         equ 36
ROOM_CRYPT                 equ 37
ROOM_TINY_CELL             equ 38
ROOM_DARK_CAVERN_J         equ 39
ROOM_LEDGE_WATERFALL_IN    equ 40
ROOM_DRAIN_A               equ 41
ROOM_DRAIN_B               equ 42
ROOM_DRAIN_C               equ 43
ROOM_DRAIN_D               equ 44
ROOM_WATERFALL_BASE        equ 45
ROOM_DARK_CAVERN_K         equ 46
ROOM_STONE_STAIRCASE       equ 47
ROOM_CASTLE_LEDGE          equ 48
ROOM_DRAWBRIDGE            equ 49
ROOM_CASTLE_COURTYARD      equ 50
ROOM_POWDER_MAG            equ 51
ROOM_EAST_RIVERBANK        equ 52
ROOM_WOODEN_BRIDGE         equ 53
ROOM_RIVER_CONDUIT         equ 54

; Object indices (7..24)
OBJ_DRAGON   equ 4
OBJ_BOMB     equ 9
OBJ_GRILL    equ 24
OBJ_KEY      equ 19
OBJ_SWORD    equ 20
OBJ_CANDLE   equ 21
OBJ_ROPE     equ 22
NULL         equ 0

ROOM_MAX     equ 54
OBJECT_COUNT equ 24
MOVEMENT_TABLE_BYTES equ ROOM_MAX*4
