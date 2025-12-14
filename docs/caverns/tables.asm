; ---------------------------------------------------------
;  Data tables (constants)
; ---------------------------------------------------------

movementTable:
                        DB roomForestClearing,0,0,0
                        DB 0,0,roomDarkForest,roomCloverField
                        DB roomForestClearing,roomRiverCliff,roomRiverCliff,0
                        DB roomForestClearing,roomRiverCliff,0,roomMtYmirSlope
                        DB 0,roomRiverBank,roomDarkForest,roomCloverField
                        DB roomRiverCliff,0,roomCraterEdge,roomRiverOutcrop
                        DB 0,0,128,roomRiverBank
                        DB 0,0,roomRiverBank,0
                        DB 0,roomBridgeNorthAnchor,roomCloverField,0
                        DB roomMtYmirSlope,roomBridgeMid,roomCloverField,0
                        DB roomBridgeNorthAnchor,roomBridgeSouthAnchor,128,128
                        DB roomBridgeMid,roomMushroomRock,roomMushroomRock,0
                        DB roomBridgeSouthAnchor,roomBridgeSouthAnchor
                        DB roomCaveEntranceClearing,roomBridgeSouthAnchor
                        DB roomCliffFace,roomCaveEntry,0,roomMushroomRock
                        DB 0,roomCaveEntranceClearing,0,0
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

verbPatternTable:
                        DW verbTake, verbPut, verbUsing, verbWith, verbCut
                        DW verbBreak, verbUnlock, verbOpen, verbKill, verbAttack
                        DW verbLight, verbBurn, verbUp, verbDown, verbJump, verbSwim

dirWordIndexTable:
                        DW dirNorthStr, dirSouthStr, dirWestStr, dirEastStr

monsterNameTable:
                        DW monNameWiz, monNameDemon, monNameTroll
                        DW monNameDragon, monNameBat, monNameDwarf

monsterNounTable:
                        DW monNounWiz, monNounDemon, monNounTroll
                        DW monNounDragon, monNounBat, monNounDwarf

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
                        DW monNameDragon, monNameBat, monNameDwarf
                        DW objNameCoin, objNameCompass, objNameBomb, objNameRuby
                        DW objNameDiamond, objNamePearl, objNameStone, objNameRing
                        DW objNamePendant, objNameGrail, objNameShield, objNameBox
                        DW objNameKey, objNameSword, objNameCandle, objNameRope
                        DW objNameBrick, objNameGrill

objdesc2Table:
                        DW monNounWiz, monNounDemon, monNounTroll
                        DW monNounDragon, monNounBat, monNounDwarf
                        DW objNounCoin, objNounCompass, objNounBomb, objNounRuby
                        DW objNounDiamond, objNounPearl, objNounStone, objNounRing
                        DW objNounPendant, objNounGrail, objNounShield, objNounBox
                        DW objNounKey, objNounSword, objNounCandle, objNounRope
                        DW objNounBrick, objNounGrill
