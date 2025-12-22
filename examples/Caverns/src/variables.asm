; ---------------------------------------------------------
;  Variables and arrays (uninitialised, set at gameStart)
; ---------------------------------------------------------

; Single-byte state
bridgeCondition         DB 0
drawbridgeState         DB 0
waterExitLocation       DB 0
gateDestination         DB 0
teleportDestination     DB 0
secretExitLocation      DB 0
generalFlagJ            DB 0
hostileCreatureIndex    DB 0
reshowFlag              DB 0
playerLocation          DB 0
candleIsLitFlag         DB 0
fearCounter             DB 0
turnCounter             DB 0
swordSwingCount         DB 0
score                   DB 0
currentObjectIndex      DB 0
visibleObjectCount      DB 0
visibleCreatureCount    DB 0
yesnoKey                DB 0
randomDirectionIndex    DB 0
randomFightMessage      DB 0
targetLocation          DB 0
carriedCount            DB 0
loopIndex               DB 0
verbPatternIndex        DB 0
directionIndex          DB 0

objectLocation          DS 24               ; byte per object/creature

; Save/load snapshot (RAM only, no persistence)
saveBlock               DS saveBlockSize

; Input buffer (padded with leading/trailing space)
inputBuffer             DS inputBufferSize
BUF                     DS 32,0
