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

; Verb pattern indices (order from verbPatternTable)
verbPatternGetIndex    equ 1   ; get/take
verbPatternDropIndex   equ 2   ; drop/put
verbPatternUseIndex    equ 3   ; using
verbPatternWithIndex   equ 4   ; with
verbPatternJumpTableMax equ 4  ; indices 1..4 are jump-table routed
verbPatternCount       equ 16
verbPatternPleaseStart equ 7   ; unlock..burn -> "please tell me how"
verbPatternPleaseEnd   equ 12
verbPatternCantStart   equ 13  ; up..swim -> "I can't"

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

; Object indices (7..24)
objDragon   equ 4
objBomb     equ 9
objGrill    equ 24
objKey      equ 19
objSword    equ 20
objCandle   equ 21
objRope     equ 22
objBrick    equ 23

; Creature indices (1..6)
creatureWizardIndex equ 1
creatureDemonIndex  equ 2
creatureTrollIndex  equ 3
creatureDragonIndex equ 4
creatureBatIndex    equ 5
creatureDwarfIndex  equ 6
creatureCount       equ 6

maxCarryItems      equ 10

null         equ 0

roomMax     equ 54
objectCount equ 24
movementTableBytes equ roomMax*4

; Input buffer sizing
inputBufferSize equ 80        ; characters incl. padding/terminator

; Object index ranges
firstObjectIndex equ 7
lastObjectIndex  equ objectCount

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
