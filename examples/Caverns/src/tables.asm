; ---------------------------------------------------------
;  Data tables (constants)
; ---------------------------------------------------------

movementTable:
                        DB roomForestClearing,0,0,0
                        DB 0,0,roomDarkForest,roomCloverField
                        DB 0,0,roomRiverCliff,roomForestClearing
                        DB 0,0,roomForestClearing,roomMtYmirSlope
                        DB 0,roomRiverBank,0,roomDarkForest
                        DB roomRiverCliff,0,roomCraterEdge,roomRiverOutcrop
                        DB 0,0,128,roomRiverBank
                        DB 0,0,roomRiverBank,0
                        DB 0,roomBridgeNorthAnchor,roomCloverField,0
                        DB roomMtYmirSlope,roomBridgeMid,0,0
                        DB roomBridgeNorthAnchor,roomBridgeSouthAnchor,128,128
                        DB roomBridgeMid,0,roomMushroomRock,roomCliffFace
                        DB 0,roomCaveEntranceClearing,0,roomBridgeSouthAnchor
                        DB roomMushroomRock,roomCaveEntry,0,0
                        DB 0,0,roomBridgeSouthAnchor,0
                        DB roomCaveEntranceClearing,roomDarkCavernA
                        DB 0,roomDeadEndInscription
                        DB 0,0,roomCaveEntry,0
                        DB roomCaveEntry,0,roomTortureChamber,0
                        DB 0,0,roomOakDoor,0
                        DB roomDarkCavernB,roomTortureChamber,0,0
                        DB 0,roomNorthSouthTunnel,0,roomOakDoor
                        DB 0,roomTortureChamber,roomDarkCavernB,roomCaveEntry
                        DB roomWindCorridor,0,roomDarkCavernA,roomDarkCavernA
                        DB roomDarkCavernB,roomRoundRoom,0,roomDarkCavernA
                        DB 0,roomLedgeOverRiver,roomNorthSouthTunnel,0
                        DB roomNorthSouthTunnel,roomLedgeOverRiver,roomDarkCavernD
                        DB roomDarkCavernC
                        DB roomDarkCavernA,0,0,roomTempleBalcony
                        DB 0,0,roomLedgeOverRiver,0
                        DB 0,roomBatCave,0,roomRoundRoom
                        DB roomDarkCavernD,roomDarkCavernF,0,0
                        DB roomDarkCavernG,0,0,0
                        DB roomBatCave,roomDarkCavernE,0,0
                        DB 0,roomDarkCavernF,roomDarkCavernH,0
                        DB 0,0,0,roomBatCave
                        DB 0,0,0,0
                        DB roomDarkCavernJ,0,roomTemple,roomLedgeWaterfallIn
                        DB 0,roomTemple,0,0
                        DB 0,0,0,0
                        DB 0,roomDarkCavernI,roomTinyCell,0
                        DB roomWaterfallBase,roomCastleLedge,roomDarkCavernI,128
                        DB roomDarkCavernK,roomDrainC,roomRiverConduit,roomDrainB
                        DB roomDarkCavernK,roomDrainC,roomDrainA,roomDrainC
                        DB roomDarkCavernK,roomTinyCell,roomDrainB,roomDrainD
                        DB roomStoneStaircase,roomStoneStaircase,0,roomStoneStaircase
                        DB 0,roomLedgeWaterfallIn,0,128
                        DB roomStoneStaircase,0,roomStoneStaircase,roomStoneStaircase
                        DB 0,roomWaterfallBase,roomDarkCavernK,0
                        DB roomLedgeWaterfallIn,128,0,128
                        DB 0,0,roomCastleLedge,roomCastleCourtyard
                        DB 0,roomEastRiverbank,roomDrawbridge,roomPowderMag
                        DB 0,0,roomCastleCourtyard,0
                        DB roomCastleCourtyard,0,roomWoodenBridge,roomCastleCourtyard
                        DB roomRiverConduit,0,0,roomEastRiverbank
                        DB 0,roomWoodenBridge,roomDrainA,0

objectLocationTable:
                        DW roomDarkCavernI, roomTreasureRoom, roomBridgeNorthAnchor
                        DW roomCaveEntranceClearing
                        DW roomDeadEndInscription, roomStoneStaircase, roomRiverOutcrop
                        DW roomDarkRoom
                        DW roomPowderMag, roomWaterfallBase
                        DW roomWindCorridor, roomDarkCavernK
                        DW roomRiverConduit, roomTreasureRoom
                        DW roomTreasureRoom, roomTreasureRoom
                        DW roomTreasureRoom, exitNone
                        DW roomDarkCavernH, roomCraterEdge
                        DW roomDarkCavernA, roomCliffFace
                        DW roomNorthSouthTunnel, roomTinyCell

roomDesc1Table:
                        DW descDarkRoom, descForestClearing, descDarkForest
                        DW descCloverField, descRiverCliff, descRiverBank
                        DW descCraterEdge, descRiverOutcrop, descMtYmir
                        DW descBridgeNorth, descBridgeMid, descBridgeSouth
                        DW descMushroomRock, descCaveClearing, descCliffFace
                        DW descCaveEntry, descDeadEnd, NULL
                        DW descTreasureRoom, descOakDoor, NULL, descWindCorridor
                        DW descTortureChamber, descNsTunnel, NULL, descRoundRoom
                        DW descLedgeRiver, descTempleBalcony
                        DW NULL, NULL, NULL, NULL, descBatCave, NULL, descTemple
                        DW NULL, descCrypt, descTinyCell, NULL, descWaterfallLedge
                        DW NULL, NULL, NULL, NULL, descWaterfallBase, NULL, descStoneStair
                        DW descCastleLedge, descDrawbridge, descCastleCourtyard
                        DW descPowderMag, descEastBank, descWoodenBridge
                        DW descRiverConduit

roomDesc2Table:
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, descTortureChamber2, NULL, NULL
                        DW descRoundRoom2, NULL, descTempleBalcony2
                        DW NULL, NULL, NULL, NULL, descBatCave2, NULL, NULL, NULL, descCrypt2
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL

; Verb tokens for orderless input scanning (first match wins).
; Keep common no-noun verbs first, then get/drop, then movement.
verbTokenTable:
                        DW tokenLook
                        DW tokenList
                        DW tokenInvent
                        DW tokenScore
                        DW tokenQuit
                        DW tokenGalar
                        DW tokenApe
                        DW tokenStage2
                        DW tokenStage3
                        DW tokenStage4
                        DW tokenStage5
                        DW tokenSave
                        DW tokenLoad
                        DW tokenRead
                        DW tokenPray
                        DW tokenGet
                        DW tokenTake
                        DW tokenDrop
                        DW tokenPut
                        DW tokenCut
                        DW tokenBreak
                        DW tokenUnlock
                        DW tokenOpen
                        DW tokenKill
                        DW tokenAttack
                        DW tokenLight
                        DW tokenBurn
                        DW tokenUp
                        DW tokenDown
                        DW tokenJump
                        DW tokenSwim
                        DW tokenNorth
                        DW tokenSouth
                        DW tokenWest
                        DW tokenEast
                        DW tokenHelp
verbTokenCount          EQU 36

; Noun tokens scanned from input (indices 1..nounTokenCount).
; 1..24 align to index space (creatures 1..6, objects 7..24).
; 25.. are pseudo-nouns (not in objectLocation[]), e.g. door/gate.
nounTokenTable:
                        DW tokenWizard, tokenDemon, tokenTroll
                        DW tokenDragon, tokenBat, tokenGoblin
                        DW tokenCoin, tokenCompass, tokenBomb, tokenRuby
                        DW tokenDiamond, tokenPearl, tokenStone, tokenRing
                        DW tokenPendant, tokenGrail, tokenShield, tokenBox
                        DW tokenKey, tokenSword, tokenCandle, tokenRope
                        DW tokenBrick, tokenGrill
                        DW tokenDoor, tokenGate

monsterNameTable:
                        DW monNameWiz, monNameDemon, monNameTroll
                        DW monNameDragon, monNameBat, monNameGoblin

monsterNounTable:
                        DW monNounWiz, monNounDemon, monNounTroll
                        DW monNounDragon, monNounBat, monNounGoblin

objectNameNameTable:
                        DW objNameCoin, objNameCompass, objNameBomb, objNameRuby
                        DW objNameDiamond, objNamePearl, objNameStone, objNameRing
                        DW objNamePendant, objNameGrail, objNameShield, objNameBox
                        DW objNameKey, objNameSword, objNameCandle, objNameRope
                        DW objNameBrick, objNameGrill

objectNameNounTable:
                        DW objNounCoin, objNounCompass, objNounBomb, objNounRuby
                        DW objNounDiamond, objNounPearl, objNounStone, objNounRing
                        DW objNounPendant, objNounGrail, objNounShield, objNounBox
                        DW objNounKey, objNounSword, objNounCandle, objNounRope
                        DW objNounBrick, objNounGrill

objdesc1Table:
                        DW monNameWiz, monNameDemon, monNameTroll
                        DW monNameDragon, monNameBat, monNameGoblin
                        DW objNameCoin, objNameCompass, objNameBomb, objNameRuby
                        DW objNameDiamond, objNamePearl, objNameStone, objNameRing
                        DW objNamePendant, objNameGrail, objNameShield, objNameBox
                        DW objNameKey, objNameSword, objNameCandle, objNameRope
                        DW objNameBrick, objNameGrill

objdesc2Table:
                        DW monNounWiz, monNounDemon, monNounTroll
                        DW monNounDragon, monNounBat, monNounGoblin
                        DW objNounCoin, objNounCompass, objNounBomb, objNounRuby
                        DW objNounDiamond, objNounPearl, objNounStone, objNounRing
                        DW objNounPendant, objNounGrail, objNounShield, objNounBox
                        DW objNounKey, objNounSword, objNounCandle, objNounRope
                        DW objNounBrick, objNounGrill

; ---------------------------------------------------------
;  Dynamic exit patch table for updateDynamicExits
;  Each entry:
;    DB roomId
;    DB dirIndex (dirNorth/dirSouth/dirWest/dirEast)
;    DW &stateByte (variable holding runtime destination/flag)
; ---------------------------------------------------------
dynamicExitPatchTable:
                        DB roomBridgeNorthAnchor, dirSouth
                        DW bridgeCondition
                        DB roomBridgeSouthAnchor, dirNorth
                        DW bridgeCondition
                        DB roomOakDoor, dirEast
                        DW teleportDestination
                        DB roomCrypt, dirEast
                        DW secretExitLocation
                        DB roomTinyCell, dirNorth
                        DW waterExitLocation
                        DB roomTinyCell, dirEast
                        DW gateDestination
                        DB roomCastleLedge, dirEast
                        DW drawbridgeState

; Rooms that should display the generic "dark cavern" extra line after the
; base description. Zero-terminated list for containsByteListZeroTerm.
darkCavernRoomList:
                        DB roomDarkCavernA
                        DB roomDarkCavernB
                        DB roomDarkCavernC
                        DB roomDarkCavernD
                        DB roomDarkCavernE
                        DB roomDarkCavernF
                        DB roomDarkCavernG
                        DB roomDarkCavernH
                        DB roomDarkCavernI
                        DB roomDarkCavernJ
                        DB roomDarkCavernK
                        DB 0
