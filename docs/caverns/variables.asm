; ---------------------------------------------------------
;  Variables and arrays (uninitialised, set at gameStart)
; ---------------------------------------------------------

; Single-byte state
bridgeCondition       db 0
drawbridgeState       db 0
waterExitLocation    db 0
gateDestination       db 0
teleportDestination   db 0
secretExitLocation   db 0
generalFlagJ         db 0
hostileCreatureIndex db 0
reshowFlag            db 0
playerLocation        db 0
candleIsLitFlag     db 0
fearCounter           db 0
turnCounter           db 0
swordSwingCount      db 0
score                db 0
currentObjectIndex   db 0
visibleObjectCount   db 0
visibleCreatureCount db 0
yesnoKey              db 0
randomDirectionIndex db 0
randomFightMessage   db 0
targetLocation        db 0
carriedCount          db 0
loopIndex             db 0
verbPatternIndex      db 0
directionIndex        db 0

; Arrays (mutable)
; Movement table: roomMax * 4 bytes
movementTable:    ds roomMax*4

objectLocation:   ds 24               ; byte per object/creature

; Input buffer (padded with leading/trailing space)
inputBuffer: ds inputBufferSize
