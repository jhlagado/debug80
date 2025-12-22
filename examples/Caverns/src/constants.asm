; Core constants for the sample machine layout and services

ROMSTART    EQU $0000          ; system/ROM area 0x0000–0x07FF
APPSTART    EQU $0900          ; user program entry point
STACK_TOP   EQU $FF00          ; convenient stack top in RAM

; Terminal ports
TERM_TX_PORT    EQU 0
TERM_RX_PORT    EQU 1
TERM_STATUS     EQU 2          ; bit0 = RX available, bit1 = TX ready

; Service selector values (passed in C) for RST 10H
SVC_PUTCHAR EQU 22             ; A = char
SVC_GETCHAR EQU 23             ; returns A = char
SVC_PUTSTR  EQU 45             ; HL = ptr to 0-terminated string

; ASCII helpers
CR          EQU $0D
LF          EQU $0A
ESC         EQU $1B
NULL        EQU 0

; ---------------------------------------------------------
;  Constants for Caverns
; ---------------------------------------------------------

; Exit codes
exitNone        equ 0
exitFatal       equ 128

; Common byte values / sentinels
byteZero           equ 0
roomCarried        equ -1         ; int8 sentinel in objectLocation[] meaning “carried”
boolTrue           equ 1

; Turn thresholds for candle
candleDimTurn  equ 200
candleOutTurn  equ 230

; Direction indices
dirNorth        equ 0
dirSouth        equ 1
dirWest         equ 2
dirEast         equ 3

; Direction counts
dirCount        equ 4

; Dynamic exit patching (updateDynamicExits)
dynamicExitPatchCount equ 7

; Verb indices come from `verbTokenTable` (see `examples/Caverns/src/tables.asm`).
; The parser scans for space-padded tokens like " kill " in a space-padded input buffer.

; Random fight message ids
fightMsgMove      equ 0
fightMsgDeflect   equ 1
fightMsgStun      equ 2
fightMsgHeadBlow  equ 3

; Score thresholds
rankHopeless equ 20
rankLoser    equ 50
rankAverage  equ 100
rankPerfect  equ 126

; Room ID constants (1..54)
roomDarkRoom             equ 1
roomForestClearing       equ 2
roomDarkForest           equ 3
roomCloverField          equ 4
roomRiverCliff           equ 5
roomRiverBank            equ 6
roomCraterEdge           equ 7
roomRiverOutcrop         equ 8
roomMtYmirSlope         equ 9
roomBridgeNorthAnchor   equ 10
roomBridgeMid            equ 11
roomBridgeSouthAnchor   equ 12
roomMushroomRock         equ 13
roomCaveEntranceClearing equ 14
roomCliffFace            equ 15
roomCaveEntry            equ 16
roomDeadEndInscription  equ 17
roomDarkCavernA         equ 18
roomTreasureRoom         equ 19
roomOakDoor              equ 20
roomDarkCavernB         equ 21
roomWindCorridor         equ 22
roomTortureChamber       equ 23
roomNorthSouthTunnel    equ 24
roomDarkCavernC         equ 25
roomRoundRoom            equ 26
roomLedgeOverRiver      equ 27
roomTempleBalcony        equ 28
roomDarkCavernD         equ 29
roomDarkCavernE         equ 30
roomDarkCavernF         equ 31
roomDarkCavernG         equ 32
roomBatCave              equ 33
roomDarkCavernH         equ 34
roomTemple                equ 35
roomDarkCavernI         equ 36
roomCrypt                 equ 37
roomTinyCell             equ 38
roomDarkCavernJ         equ 39
roomLedgeWaterfallIn    equ 40
roomDrainA               equ 41
roomDrainB               equ 42
roomDrainC               equ 43
roomDrainD               equ 44
roomWaterfallBase        equ 45
roomDarkCavernK         equ 46
roomStoneStaircase       equ 47
roomCastleLedge          equ 48
roomDrawbridge            equ 49
roomCastleCourtyard      equ 50
roomPowderMag            equ 51
roomEastRiverbank        equ 52
roomWoodenBridge         equ 53
roomRiverConduit         equ 54

; Index map (1..24)
; Creatures occupy indices 1..6, objects occupy indices 7..24.
; This matches the original BASIC (single P(1..24) array).

; Creature indices (1..6) (use obj* names because they share index space)
objWizard   equ 1
objDemon    equ 2
objTroll    equ 3
objDragon   equ 4
objBat      equ 5
objGoblin   equ 6
objCreatureCount equ 6

; Object indices (7..24)
objCoin     equ 7
objCompass  equ 8
objBomb     equ 9
objRuby     equ 10
objDiamond  equ 11
objPearl    equ 12
objStone    equ 13
objRing     equ 14
objPendant  equ 15
objGrail    equ 16
objShield   equ 17
objBox      equ 18
objKey      equ 19
objSword    equ 20
objCandle   equ 21
objRope     equ 22
objBrick    equ 23
objGrill    equ 24

maxCarryItems      equ 10

null         equ 0

roomMax     equ 54
objectCount equ 24
movementTableBytes equ roomMax*4

; Input buffer sizing
inputBufferSize equ 80        ; characters incl. padding/terminator

; Extended noun token indices (not part of objectLocation[])
nounDoor equ 25
nounGate equ 26
nounTokenCount equ 26          ; nouns scanned from nounTokenTable

; Save/load block size (bytes)
; playerLocation + candleIsLitFlag + turnCounter + 6 state bytes + 24 objectLocation
saveBlockSize equ 33

; Object index ranges
firstObjectIndex equ 7
lastObjectIndex  equ objectCount
objectItemCount  equ objectCount-objCreatureCount

; Score calculation range (objects 7..17)
firstScoreObjectIndex equ 7
lastScoreObjectIndex  equ 17
afterLastScoreObjectIndex equ 18
scoreIndexBaseSub     equ 6

; Creature relocation offsets
batRelocateOffset     equ 7
corpseRelocateOffset  equ 10

; Sword combat tuning (current approximation)
swordFightBaseThreshold equ 15

; Sword kill chance: pseudo2 uses `RND < .38`
; Using an 8-bit threshold: kill if randByte < 97  (~0.379)
swordKillChanceThreshold equ 97
