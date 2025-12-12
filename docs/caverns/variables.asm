; ---------------------------------------------------------
;  Variables and arrays (uninitialised, set at GAME_START)
; ---------------------------------------------------------

; Single-byte state
BRIDGE_CONDITION       db 0
DRAWBRIDGE_STATE       db 0
WATER_EXIT_LOCATION    db 0
GATE_DESTINATION       db 0
TELEPORT_DESTINATION   db 0
SECRET_EXIT_LOCATION   db 0
GENERAL_FLAG_J         db 0
HOSTILE_CREATURE_INDEX db 0
RESHOW_FLAG            db 0
PLAYER_LOCATION        db 0
CANDLE_IS_LIT_FLAG     db 0
FEAR_COUNTER           db 0
TURN_COUNTER           db 0
SWORD_SWING_COUNT      db 0
SCORE                  db 0
CURRENT_OBJECT_INDEX   db 0
VISIBLE_OBJECT_COUNT   db 0
VISIBLE_CREATURE_COUNT db 0
YESNO_KEY              db 0
RANDOM_DIRECTION_INDEX db 0
RANDOM_FIGHT_MESSAGE   db 0
TARGET_LOCATION        db 0

; Arrays (mutable)
; Movement table: ROOM_MAX * 4 bytes
MOVEMENT_TABLE:    ds ROOM_MAX*4

OBJECT_LOCATION:   ds 24               ; byte per object/creature
