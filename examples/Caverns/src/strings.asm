title:                  DB "DREAMCARDS presents...\r\n\r\n"
                        DB "C A V E R N S  by John Hardy (c) 1982-83\r\n"
                        DB "BeeHive Software House\r\n\r\n"
                        DB "Adapted by the author for the TEC-1G\r\n"
                        DB "GPL 3.0 Copyleft 2026 All wrongs reserved!\r\n\r\n",0

promptStr:              DB "? ",0

strCRLF:                DB "\r\n",0
strCommaSpace:          DB ", ",0

strTooDark:             DB "It's very dark, too dark to see anything...I'm scared!",0
strDarkCavern:          DB "You are deep in a dark cavern.",0
strBridgeSnapped:       DB "Two of the ropes have snapped under your weight. It's "
                        DB "totally unfit to cross again.",0
strDragonCorpse:        DB "You can also see the bloody corpse of an enormous dragon.",0
strGoldBridge:          DB " A mighty golden drawbridge spans the waters.",0
strCandleDim:           DB "Your candle is growing dim.",0
strCandleOut:           DB "In fact...it went out!",0
strSeeObjects:          DB "You can also see...",0
strSeeCreatures:        DB "Nearby there lurks...",0
strPrompt:              DB ">",0
strCarryingPrefix:      DB "You are carrying ",0
strNothing:             DB "nothing.",0
strAnother:             DB "Another adventure? ",0
strScorePrefix:         DB "You have a score of ",0
strScoreMid:            DB " out of a possible 126 points in ",0
strScoreSuffix:         DB " moves.",0
strGiantBat:            DB "The giant bat picked you up and carried you to another "
                        DB "place.",0
strMonsterKilled:       DB "AUUUUUGH...you've just been killed by ",0
strMonsterSuffix:       DB "!!",0
strCantGoThatWay:       DB "You can't go that way",0
strFatalFall:           DB "You stumble and fall into the chasm and smash yourself to "
                        DB "a pulp on the rocks below.",0
strMagicWind:           DB "The runes of Galar glow and a magic wind carries you to another place...",0
strCryptWall:           DB "Hey! the eastern wall of the crypt slid open...",0
strEh:                  DB "I didn't understand.",0
strCantSeeIt:           DB "Where? I can't see it.",0
strTooManyObjects:      DB "You are carrying too many objects.",0
strUseHow:              DB "How am I supposed to use it?",0
strWontOpen:            DB "It won't open!",0
strDoorOpened:          DB "You opened the door.",0
strGateOpened:          DB "You opened the gate.",0
strNothingToKill:       DB "But there's nothing to kill...",0
strSwordMiss:           DB "You swing with your sword but miss and the creature "
                        DB "smashes your skull.",0
strAttackMove:          DB "You attack but the creature moves aside.",0
strAttackDeflect:       DB "The creature deflects your blow.",0
strAttackStun:          DB "The foe is stunned but quickly regains his balance.",0
strAttackHeadBlow:      DB "You missed and he deals a blow to your head.",0
strSwordKills:          DB "The sword strikes home and your foe dies...",0
strSwordCrumbles:       DB "Hey! Your sword has just crumbled into dust!!",0
strCorpseVapor:         DB "Suddenly a black cloud descends and the corpse vaporizes "
                        DB "into nothing.",0
strWontBurn:            DB "That won't burn, Dummy...In fact, the candle went out.",0
strCandleOutStupid:     DB "But the candle is out, stupid!!",0
strBombExplode:         DB "The fuse burnt away and....BOOM!!....the explosion blew "
                        DB "you out of the way (Lucky!)",0
strTooDangerous:        DB "It's too dangerous!!!",0
strDescendRope:         DB "You descend the rope, but it drops 10 feet short of the "
                        DB "floor. You jump the rest of the way.",0
strNothingHappens:      DB "Nothing happens!",0
strNotCarrying:         DB "You aren't carrying that.",0
strTakenSuffix:         DB " taken.",0
strCombatNotImpl:       DB "You attack, but combat isn't implemented yet.",0
strPleaseTell:          DB "Please tell me how.",0
strICant:               DB "I can't!",0
strMonsterMiss:         DB "The creature lunges at you but you dodge at the last moment.",0
strGameSaved:           DB "Game saved.",0
strGameLoaded:          DB "Game loaded.",0
strStubVerb:            DB "Not implemented: ",0
strStubTarget:          DB " target=",0
strStubTool:            DB " tool=",0
strDoorWord:            DB "door",0
strGateWord:            DB "gate",0
strGalarClue:           DB "Speak the name that lies mirrored in the last light of the alphabet, and the ancient path shall open.",0
strHelpText:            DB "Help:\r\n"
                        DB "look: see where you are\r\n"
                        DB "list: see what you carry\r\n"
                        DB "score: see how you rate\r\n"
                        DB "quit: leave the caves\r\n"
                        DB "go north, take compass\r\n"
                        DB "kill dragon with sword\r\n"
                        DB "try everything",0
strRanking:             DB "This gives you an adventurer's ranking of:",0
strRankHopeless:        DB "Hopeless beginner",0
strRankLoser:           DB "Experienced loser",0
strRankAverage:         DB "Average Viking",0
strRankExcellent:       DB "Excellent...but you've left something behind!",0
strRankPerfect:         DB "Perfectionist and genius!!",0
strEncWizard:           DB "There, before you in a swirling mist stands an evil wizard "
                        DB "with his hand held outwards...`Thou shall not pass' he "
                        DB "cries.",0
strEncDragon1:          DB "Realizing your presence, its eyes flicker open and it "
                        DB "leaps up, breathing jets fire at you.",0
strEncDragon2:          DB "",0
strEncGoblin:           DB "From around the corner trots a snarling goblin carrying "
                        DB "a lantern. `My job is to protect these stone steps!' "
                        DB "he says and lunges at you with his dagger.",0

descDarkRoom            DB "You are standing in a darkened room. There is a door to the "
                        DB "north.",0
descForestClearing      DB "You are in a forest clearing before a small bark hut. There "
                        DB "are no windows, and locked door to the south. The latch was "
                        DB "engaged when you closed the door.",0
descDarkForest          DB "You are deep in a dark forest. In the distance you can see "
                        DB "a mighty river.",0
descCloverField         DB "You are standing in a field of four-leafed clovers. There "
                        DB "is a small hut to the west.",0
descRiverCliff          DB "The forest has opened up at this point. You are standing on "
                        DB "a cliff overlooking a wide glacial river. A small "
                        DB "foot-beaten path leads south.",0
descRiverBank           DB "You are standing at the rocky edge of the mighty river "
                        DB "Gioll. The path forks east and west.",0
descCraterEdge          DB "You are on the edge of an enormous crater. The rim is "
                        DB "extremely slippery. Clouds of water vapour rise high in the "
                        DB "air as the Gioll pours into it.",0
descRiverOutcrop        DB "The path to the east stops here. You are on a rocky "
                        DB "outcrop, projected about 15 feet above the river. In the "
                        DB "distance, a tiny bridge spans the river.",0
descMtYmir              DB "You are on the lower slopes of Mt. Ymir. The forest "
                        DB "stretches far away and to the west. Arctic winds blow "
                        DB "fiercely, it's very cold!",0
descBridgeNorth         DB "You stand on a rocky precipice high above the river, Gioll; "
                        DB "Mt. Ymir stands to the north. A flimsy string bridge spans "
                        DB "the mighty river.",0
descBridgeMid           DB "You have made your way half way across the creaking bridge. "
                        DB "It sways violently from side to side. It's going to "
                        DB "collapse any second!!",0
descBridgeSouth         DB "You are on the southern edge of the mighty river, before "
                        DB "the string bridge. Paths lead west, and a cliff face lies east.",0
descMushroomRock        DB "You are standing on a rock in the middle of a mighty oak "
                        DB "forest. Surrounding you are thousands of poisonous "
                        DB "mushrooms. To the east lies the bridge; to the south the "
                        DB "woods deepen.",0
descCaveClearing        DB "You are in a clearing in the forest. An ancient basalt rock "
                        DB "formation towers above you. To the south is the entrance "
                        DB "of an interesting looking cave. The mushrooms are to the north.",0
descCliffFace           DB "You are on a cliff face over looking the river.",0
descCaveEntry           DB "You are just inside the cave. Sunlight pours into the cave "
                        DB "lighting a path to the east and another to the south. I "
                        DB "don't mind saying I'm a bit scared!",0
descDeadEnd             DB "This passage appears to be a dead end. On a wall before you "
                        DB "is carved `Find the Sacred Key of Thialfi'.",0
descTreasureRoom        DB "You are in the legendary treasure room of the black elves "
                        DB "of Svartalfheim. Every red-blooded Viking has dreamed of "
                        DB "entering this sacred room.",0
descOakDoor             DB "You can see a small oak door to the east. It has been "
                        DB "locked from the inside.",0
descWindCorridor        DB "You are standing in an east-west corridor. You can feel a "
                        DB "faint breeze coming from the east.",0
descTortureChamber      DB "You are standing in what appears to have once been a "
                        DB "torture chamber. Apart from the rather comprehensive range "
                        DB "of instumentsof absolutely inhuman agony,",0
descTortureChamber2     DB "coagulated blood stains on the walls and mangled bits of "
                        DB "bone on the floor make me think that a number of would be "
                        DB "adventurers croaked it here!",0
descNsTunnel            DB "You stand in a long tunnel which has been bored out of the "
                        DB "rock.It runs from north to south. A faint glow comes from a "
                        DB "narrow crack in the eastern wall.",0
descRoundRoom           DB "You are in a large round room with a number of exits. The "
                        DB "walls have been painted in a mystical dark purple and a big "
                        DB "chalk staris drawn in the centre of",0
descRoundRoom2          DB "the floor. Note: This is one of the hidden chambers of the "
                        DB "infamous pagan sect, the monks of Loki. Norse folk believe "
                        DB "them to be gods.",0
descLedgeRiver          DB "You are standing on a narrow ledge, high above a "
                        DB "subterranean river. There is an exit to the east.",0
descTempleBalcony       DB "You are on a balcony, overlooking a huge cavern which has "
                        DB "been converted into a pagan temple. Note: this temple has "
                        DB "been dedicated to Loki, the god of",0
descTempleBalcony2      DB "fire, who came to live in Svartalfheim after he had been "
                        DB "banished to exile by Odin. Since then he has been waiting "
                        DB "for the `End Of All Things'.",0
descBatCave             DB "You are in the central cave of a giant bat colony. Above "
                        DB "you hundreds of giant bats hang from the ceiling and the "
                        DB "floor is covered in centuries of",0
descBatCave2            DB "giant bat droppings. Careful where you step! Incidentally, "
                        DB "the smell is indescribable.",0
descTemple              DB "You are in the temple. To the north is a locked gate and on "
                        DB "the wall is a giant statue of Loki, carved out of the "
                        DB "living rock itself!",0
descCrypt               DB "You stand in an old and musty crypt, the final resting "
                        DB "place of hundreds of Loki devotees. On the wall is "
                        DB "carved:``What 3 letter word completes a word",0
descCrypt2              DB "starting with 'G---' and another ending with '---X'' Note: "
                        DB "The monks of Loki must have liked silly puzzles. "
                        DB "Putrefaction and decay fills the air here.",0
descTinyCell            DB "You are in a tiny cell. The western wall has now firmly "
                        DB "closed again. There is a ventilator shaft on the eastern "
                        DB "wall.",0
descWaterfallLedge      DB "You are on another ledge high above a subterranean river. "
                        DB "The water flows in through a hole in the cavern roof, to "
                        DB "the north.",0
strDrainageSystem       DB "Somehow you have gotten into the complex drainage system of" 
                        DB "this entire cavern network!!",0
descWaterfallBase       DB "You are standing near an enormous waterfall which brings "
                        DB "water down from the surface, from the river Gioll.",0
descStoneStair          DB "You are standing before a stone staircase which leads "
                        DB "southwards.",0
descCastleLedge         DB "You are on a narrow and crumbling ledge. On the other side "
                        DB "of the river you can see a magic castle. (Don't ask me why "
                        DB "it's magic...I just know it is)",0
descDrawbridge          DB "You are by the drawbridge which has just lowered "
                        DB "itself....by magic!!",0
descCastleCourtyard     DB "You are in the courtyard of the magic castle. WOW! This "
                        DB "castle is really something! On the wall is inscribed 'hzb "
                        DB "tzozi'. A secret escape tunnel leads south",0
descPowderMag           DB "You are in the powder magazine of this really super "
                        DB "castle.",0
descEastBank            DB "You are on the eastern side of the river. A small tunnel "
                        DB "leads east into the cliff face.",0
descWoodenBridge        DB "You stand before a small wooden bridge which crosses the "
                        DB "river.",0
descRiverConduit        DB "You are in a conduit draining into the river. The water "
                        DB "comes up to your knees and is freezing cold. A narrow "
                        DB "service path leads south.",0

tokenLook               DB " look ",0
tokenList               DB " list ",0
tokenHelp               DB " help ",0
tokenQuit               DB " quit ",0
tokenGalar              DB " galar ",0
tokenApe                DB " ape ",0
tokenGet                DB " get ",0
tokenDrop               DB " drop ",0
tokenTake               DB " take ",0
tokenInvent             DB " invent ",0
tokenKill               DB " kill ",0
tokenAttack             DB " attack ",0
tokenStage2             DB " stage2 ",0
tokenStage3             DB " stage3 ",0
tokenStage4             DB " stage4 ",0
tokenStage5             DB " stage5 ",0
tokenSave               DB " save ",0
tokenLoad               DB " load ",0
tokenRead               DB " read ",0
tokenPray               DB " pray ",0
tokenScore              DB " score ",0
tokenPut                DB " put ",0
tokenUsing              DB " using ",0
tokenWith               DB " with ",0
tokenCut                DB " cut ",0
tokenBreak              DB " break ",0
tokenUnlock             DB " unlock ",0
tokenOpen               DB " open ",0
tokenLight              DB " light ",0
tokenBurn               DB " burn ",0
tokenUp                 DB " up ",0
tokenDown               DB " down ",0
tokenJump               DB " jump ",0
tokenSwim               DB " swim ",0

; Non-object nouns used by some verbs (not part of nounTokenTable 1..24).
tokenDoor               DB " door ",0
tokenGate               DB " gate ",0

tokenNorth              DB " north ",0
tokenSouth              DB " south ",0
tokenWest               DB " west ",0
tokenEast               DB " east ",0

; Noun tokens (space-padded) for orderless input scanning (indices 1..24).
tokenWizard             DB " wizard ",0
tokenDemon              DB " demon ",0
tokenTroll              DB " troll ",0
tokenDragon             DB " dragon ",0
tokenBat                DB " bat ",0
tokenGoblin             DB " goblin ",0

tokenCoin               DB " coin ",0
tokenCompass            DB " compass ",0
tokenBomb               DB " bomb ",0
tokenRuby               DB " ruby ",0
tokenDiamond            DB " diamond ",0
tokenPearl              DB " pearl ",0
tokenStone              DB " stone ",0
tokenRing               DB " ring ",0
tokenPendant            DB " pendant ",0
tokenGrail              DB " grail ",0
tokenShield             DB " shield ",0
tokenBox                DB " box ",0
tokenKey                DB " key ",0
tokenSword              DB " sword ",0
tokenCandle             DB " candle ",0
tokenRope               DB " rope ",0
tokenBrick              DB " brick ",0
tokenGrill              DB " grill ",0

monNameWiz              DB "an evil "
monNounWiz              DB "wizard",0
monNameDemon            DB "a fiery "
monNounDemon            DB "demon",0
monNameTroll            DB "an axe wielding "
monNounTroll            DB "troll",0
monNameDragon           DB "a fire breathing "
monNounDragon           DB "dragon",0
monNameBat              DB "a giant "
monNounBat              DB "bat",0
monNameGoblin           DB "a snarling "
monNounGoblin           DB "goblin",0

objNameCoin             DB "a gold "
objNounCoin             DB "coin",0
objNameCompass          DB "a useful looking "
objNounCompass          DB "compass",0
objNameBomb             DB "a home made "
objNounBomb             DB "bomb",0
objNameRuby             DB "a blood red "
objNounRuby             DB "ruby",0
objNameDiamond          DB "a sparkling "
objNounDiamond          DB "diamond",0
objNamePearl            DB "a moon-like "
objNounPearl            DB "pearl",0
objNameStone            DB "an interesting "
objNounStone            DB "stone",0
objNameRing             DB "a diamond studded "
objNounRing             DB "ring",0
objNamePendant          DB "a magic "
objNounPendant          DB "pendant",0
objNameGrail            DB "a most holy "
objNounGrail            DB "grail",0
objNameShield           DB "a mirror like "
objNounShield           DB "shield",0
objNameBox              DB "a nondescript black "
objNounBox              DB "box",0
objNameKey              DB "an old and rusty "
objNounKey              DB "key",0
objNameSword            DB "a double-bladed "
objNounSword            DB "sword",0
objNameCandle           DB "a small "
objNounCandle           DB "candle",0
objNameRope             DB "a thin and tatty "
objNounRope             DB "rope",0
objNameBrick            DB "a red house "
objNounBrick            DB "brick",0
objNameGrill            DB "a rusty ventilation "
objNounGrill            DB "grill",0
