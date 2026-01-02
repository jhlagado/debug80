; ---------------------------------------------------------
;  Data tables (constants)
; ---------------------------------------------------------

movementTable:
                        DB roomForestClearing,0,0,0                                                                     ; room 1
                        DB 0,0,roomDarkForest,roomCloverField                                                           ; room 2
                        DB roomForestClearing,roomRiverCliff,roomRiverCliff,0                                           ; room 3
                        DB roomForestClearing,roomRiverCliff,0,roomMtYmirSlope                                          ; room 4
                        DB 0,roomRiverBank,roomDarkForest,roomCloverField                                               ; room 5
                        DB roomRiverCliff,0,roomCraterEdge,roomRiverOutcrop                                             ; room 6
                        DB 0,0,128,roomRiverBank                                                                        ; room 7
                        DB 0,0,roomRiverBank,0                                                                          ; room 8
                        DB 0,roomBridgeNorthAnchor,roomCloverField,0                                                    ; room 9
                        DB roomMtYmirSlope,roomBridgeMid,roomCloverField,0                                              ; room 10
                        DB roomBridgeNorthAnchor,roomBridgeSouthAnchor,128,128                                          ; room 11
                        DB roomBridgeMid,roomMushroomRock,roomMushroomRock,0                                            ; room 12
                        DB roomBridgeSouthAnchor,roomBridgeSouthAnchor,roomCaveEntranceClearing,roomBridgeSouthAnchor   ; room 13
                        DB roomCliffFace,roomCaveEntry,0,roomMushroomRock                                               ; room 14
                        DB 0,roomCaveEntranceClearing,0,0                                                               ; room 15
                        DB roomCaveEntranceClearing,roomDarkCavernA,0,roomDeadEndInscription                            ; room 16 
                        DB 0,0,roomCaveEntry,0                                                                          ; room 17
                        DB roomCaveEntry,0,roomTortureChamber,0                                                         ; room 18
                        DB 0,0,roomOakDoor,0                                                                            ; room 19
                        DB roomDarkCavernB,roomTortureChamber,0,0                                                       ; room 20
                        DB 0,roomNorthSouthTunnel,0,roomOakDoor                                                         ; room 21
                        DB 0,roomTortureChamber,roomDarkCavernB,roomCaveEntry                                           ; room 22
                        DB roomWindCorridor,0,roomDarkCavernA,roomDarkCavernA                                           ; room 23
                        DB roomDarkCavernB,roomRoundRoom,0,roomDarkCavernA                                              ; room 24
                        DB 0,roomLedgeOverRiver,roomNorthSouthTunnel,0                                                  ; room 25
                        DB roomNorthSouthTunnel,roomLedgeOverRiver,roomDarkCavernD,roomDarkCavernC                      ; room 26
                        DB roomDarkCavernA,0,0,roomTempleBalcony                                                        ; room 27
                        DB 0,0,roomLedgeOverRiver,0                                                                     ; room 28
                        DB 0,roomBatCave,0,roomRoundRoom                                                                ; room 29
                        DB roomDarkCavernD,roomDarkCavernF,0,0                                                          ; room 30
                        DB roomDarkCavernG,0,0,0                                                                        ; room 31
                        DB roomBatCave,roomDarkCavernE,0,0                                                              ; room 32
                        DB 0,roomDarkCavernF,roomDarkCavernH,0                                                          ; room 33
                        DB 0,0,0,roomBatCave                                                                            ; room 34
                        DB 0,0,0,0                                                                                      ; room 35
                        DB roomDarkCavernJ,0,roomTemple,roomLedgeWaterfallIn                                            ; room 36
                        DB 0,roomTemple,0,0                                                                             ; room 37
                        DB 0,0,0,0                                                                                      ; room 38
                        DB 0,roomDarkCavernI,roomTinyCell,0                                                             ; room 39
                        DB roomWaterfallBase,roomCastleLedge,roomDarkCavernI,128                                        ; room 40
                        DB roomDarkCavernK,roomDrainC,roomRiverConduit,roomDrainB                                       ; room 41
                        DB roomDarkCavernK,roomDrainC,roomDrainA,roomDrainC                                             ; room 42
                        DB roomDarkCavernK,roomTinyCell,roomDrainB,roomDrainD                                           ; room 43
                        DB roomStoneStaircase,roomStoneStaircase,0,roomStoneStaircase                                   ; room 44
                        DB 0,roomLedgeWaterfallIn,0,128                                                                 ; room 45
                        DB roomStoneStaircase,0,roomStoneStaircase,roomStoneStaircase                                   ; room 46
                        DB 0,roomWaterfallBase,roomDarkCavernK,0                                                        ; room 47
                        DB roomLedgeWaterfallIn,128,0,128                                                               ; room 48
                        DB 0,0,roomCastleLedge,roomCastleCourtyard                                                      ; room 49
                        DB 0,roomEastRiverbank,roomDrawbridge,roomPowderMag                                             ; room 50
                        DB 0,0,roomCastleCourtyard,0                                                                    ; room 51
                        DB roomCastleCourtyard,0,roomWoodenBridge,roomCastleCourtyard                                   ; room 52
                        DB roomRiverConduit,0,0,roomEastRiverbank                                                       ; room 53
                        DB 0,roomWoodenBridge,roomDrainA,0                                                              ; room 54

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
                        DB roomDarkCavernH
                        DB roomDarkCavernI
                        DB roomDarkCavernJ
                        DB roomDarkCavernK
                        DB roomWoodenBridge
                        DB 0
