; ---------------------------------------------------------
;  Data tables (constants)
; ---------------------------------------------------------

MOVEMENT_TABLE
                        DB ROOM_FOREST_CLEARING,0,0,0
                        DB 0,0,ROOM_DARK_FOREST,ROOM_CLOVER_FIELD
                        DB ROOM_FOREST_CLEARING,ROOM_RIVER_CLIFF,ROOM_RIVER_CLIFF,0
                        DB ROOM_FOREST_CLEARING,ROOM_RIVER_CLIFF,0,ROOM_MT_YMIR_SLOPE
                        DB 0,ROOM_RIVER_BANK,ROOM_DARK_FOREST,ROOM_CLOVER_FIELD
                        DB ROOM_RIVER_CLIFF,0,ROOM_CRATER_EDGE,ROOM_RIVER_OUTCROP
                        DB 0,0,128,ROOM_RIVER_BANK
                        DB 0,0,ROOM_RIVER_BANK,0
                        DB 0,ROOM_BRIDGE_NORTH_ANCHOR,ROOM_CLOVER_FIELD,0
                        DB ROOM_MT_YMIR_SLOPE,ROOM_BRIDGE_MID,ROOM_CLOVER_FIELD,0
                        DB ROOM_BRIDGE_NORTH_ANCHOR,ROOM_BRIDGE_SOUTH_ANCHOR,128,128
                        DB ROOM_BRIDGE_MID,ROOM_MUSHROOM_ROCK,ROOM_MUSHROOM_ROCK,0
                        DB ROOM_BRIDGE_SOUTH_ANCHOR,ROOM_BRIDGE_SOUTH_ANCHOR
                        DB ROOM_CAVE_ENTRANCE_CLEARING,ROOM_BRIDGE_SOUTH_ANCHOR
                        DB ROOM_CLIFF_FACE,ROOM_CAVE_ENTRY,0,ROOM_MUSHROOM_ROCK
                        DB 0,ROOM_CAVE_ENTRANCE_CLEARING,0,0
                        DB ROOM_CAVE_ENTRANCE_CLEARING,ROOM_DARK_CAVERN_A
                        DB 0,ROOM_DEAD_END_INSCRIPTION
                        DB 0,0,ROOM_CAVE_ENTRY,0
                        DB ROOM_CAVE_ENTRY,0,ROOM_TORTURE_CHAMBER,0
                        DB 0,0,ROOM_OAK_DOOR,0
                        DB ROOM_DARK_CAVERN_B,ROOM_TORTURE_CHAMBER,0,0
                        DB 0,ROOM_NORTH_SOUTH_TUNNEL,0,ROOM_OAK_DOOR
                        DB 0,ROOM_TORTURE_CHAMBER,ROOM_DARK_CAVERN_B,ROOM_CAVE_ENTRY
                        DB ROOM_WIND_CORRIDOR,0,ROOM_DARK_CAVERN_A,ROOM_DARK_CAVERN_A
                        DB ROOM_DARK_CAVERN_B,ROOM_ROUND_ROOM,0,ROOM_DARK_CAVERN_A
                        DB 0,ROOM_LEDGE_OVER_RIVER,ROOM_NORTH_SOUTH_TUNNEL,0
                        DB ROOM_NORTH_SOUTH_TUNNEL,ROOM_LEDGE_OVER_RIVER,ROOM_DARK_CAVERN_D
                        DB ROOM_DARK_CAVERN_C
                        DB ROOM_DARK_CAVERN_A,0,0,ROOM_TEMPLE_BALCONY
                        DB 0,0,ROOM_LEDGE_OVER_RIVER,0
                        DB 0,ROOM_BAT_CAVE,0,ROOM_ROUND_ROOM
                        DB ROOM_DARK_CAVERN_D,ROOM_DARK_CAVERN_F,0,0
                        DB ROOM_DARK_CAVERN_G,0,0,0
                        DB ROOM_BAT_CAVE,ROOM_DARK_CAVERN_E,0,0
                        DB 0,ROOM_DARK_CAVERN_F,ROOM_DARK_CAVERN_H,0
                        DB 0,0,0,ROOM_BAT_CAVE
                        DB 0,0,0,0
                        DB ROOM_DARK_CAVERN_J,0,ROOM_TEMPLE,ROOM_LEDGE_WATERFALL_IN
                        DB 0,ROOM_TEMPLE,0,0
                        DB 0,0,0,0
                        DB 0,ROOM_DARK_CAVERN_I,ROOM_TINY_CELL,0
                        DB ROOM_WATERFALL_BASE,ROOM_CASTLE_LEDGE,ROOM_DARK_CAVERN_I,128
                        DB ROOM_DARK_CAVERN_K,ROOM_DRAIN_C,ROOM_RIVER_CONDUIT,ROOM_DRAIN_B
                        DB ROOM_DARK_CAVERN_K,ROOM_DRAIN_C,ROOM_DRAIN_A,ROOM_DRAIN_C
                        DB ROOM_DARK_CAVERN_K,ROOM_TINY_CELL,ROOM_DRAIN_B,ROOM_DRAIN_D
                        DB ROOM_STONE_STAIRCASE,ROOM_STONE_STAIRCASE,0,ROOM_STONE_STAIRCASE
                        DB 0,ROOM_LEDGE_WATERFALL_IN,0,128
                        DB ROOM_STONE_STAIRCASE,0,ROOM_STONE_STAIRCASE,ROOM_STONE_STAIRCASE
                        DB 0,ROOM_WATERFALL_BASE,ROOM_DARK_CAVERN_K,0
                        DB ROOM_LEDGE_WATERFALL_IN,128,0,128
                        DB 0,0,ROOM_CASTLE_LEDGE,ROOM_CASTLE_COURTYARD
                        DB 0,ROOM_EAST_RIVERBANK,ROOM_DRAWBRIDGE,ROOM_POWDER_MAG
                        DB 0,0,ROOM_CASTLE_COURTYARD,0
                        DB ROOM_CASTLE_COURTYARD,0,ROOM_WOODEN_BRIDGE,ROOM_CASTLE_COURTYARD
                        DB ROOM_RIVER_CONDUIT,0,0,ROOM_EAST_RIVERBANK
                        DB 0,ROOM_WOODEN_BRIDGE,ROOM_DRAIN_A,0

OBJECT_LOCATION_TABLE
                        DW ROOM_DARK_CAVERN_I, ROOM_TREASURE_ROOM, ROOM_BRIDGE_NORTH_ANCHOR
                        DW ROOM_CAVE_ENTRANCE_CLEARING
                        DW ROOM_DEAD_END_INSCRIPTION, ROOM_STONE_STAIRCASE, ROOM_RIVER_OUTCROP
                        DW ROOM_DARK_ROOM
                        DW ROOM_POWDER_MAG, ROOM_WATERFALL_BASE
                        DW ROOM_WIND_CORRIDOR, ROOM_DARK_CAVERN_K
                        DW ROOM_RIVER_CONDUIT, ROOM_TREASURE_ROOM
                        DW ROOM_TREASURE_ROOM, ROOM_TREASURE_ROOM
                        DW ROOM_TREASURE_ROOM, EXIT_NONE
                        DW ROOM_DARK_CAVERN_H, ROOM_CRATER_EDGE
                        DW ROOM_DARK_CAVERN_A, ROOM_CLIFF_FACE
                        DW ROOM_NORTH_SOUTH_TUNNEL, ROOM_TINY_CELL


ROOM_DESC1_TABLE
                        DW DESC_DARK_ROOM, DESC_FOREST_CLEARING, DESC_DARK_FOREST
                        DW DESC_CLOVER_FIELD, DESC_RIVER_CLIFF, DESC_RIVER_BANK
                        DW DESC_CRATER_EDGE, DESC_RIVER_OUTCROP, DESC_MT_YMIR
                        DW DESC_BRIDGE_NORTH, DESC_BRIDGE_MID, DESC_BRIDGE_SOUTH
                        DW DESC_MUSHROOM_ROCK, DESC_CAVE_CLEARING, DESC_CLIFF_FACE
                        DW DESC_CAVE_ENTRY, DESC_DEAD_END, NULL
                        DW DESC_TREASURE_ROOM, DESC_OAK_DOOR, NULL, DESC_WIND_CORRIDOR
                        DW DESC_TORTURE_CHAMBER, DESC_NS_TUNNEL, NULL, DESC_ROUND_ROOM
                        DW DESC_LEDGE_RIVER, DESC_TEMPLE_BALCONY
                        DW NULL, NULL, NULL, NULL, DESC_BAT_CAVE, NULL, DESC_TEMPLE
                        DW NULL, DESC_CRYPT, DESC_TINY_CELL, NULL, DESC_WATERFALL_LEDGE
                        DW NULL, NULL, NULL, NULL, NULL, DESC_WATERFALL_BASE, NULL
                        DW DESC_STONE_STAIR, DESC_CASTLE_LEDGE, DESC_DRAWBRIDGE
                        DW DESC_CASTLE_COURTYARD, DESC_POWDER_MAG, DESC_EAST_BANK
                        DW DESC_WOODEN_BRIDGE, DESC_RIVER_CONDUIT

ROOM_DESC2_TABLE
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, DESC_TORTURE_CHAMBER2, NULL, NULL
                        DW DESC_ROUND_ROOM2, NULL, DESC_TEMPLE_BALCONY2
                        DW NULL, NULL, NULL, NULL, DESC_BAT_CAVE2, NULL, NULL, NULL, DESC_CRYPT2
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                        DW NULL, NULL, NULL, NULL, NULL, NULL, NULL

DESC_DARK_ROOM          DB "You are standing in a darkened room. There is a door to the "
                        DB "north.",0
DESC_FOREST_CLEARING    DB "You are in a forest clearing before a small bark hut. There "
                        DB "are no windows, and locked door to the south. The latch was "
                        DB "engaged when you closed the door.",0
DESC_DARK_FOREST        DB "You are deep in a dark forest. In the distance you can see a mighty river.",0
DESC_CLOVER_FIELD       DB "You are standing in a field of four-leafed clovers. There is "
                        DB "a small hut to the north.",0
DESC_RIVER_CLIFF        DB "The forest has opened up at this point. You are standing on a "
                        DB "cliff overlooking a wide glacial river. A small foot-beaten "
                        DB "path leads south.",0
DESC_RIVER_BANK         DB "You are standing at the rocky edge of the mighty river Gioll. The path forks east and west.",0
DESC_CRATER_EDGE        DB "You are on the edge of an enormous crater. The rim is "
                        DB "extremely slippery. Clouds of water vapour rise high in the "
                        DB "air as the Gioll pours into it.",0
DESC_RIVER_OUTCROP      DB "The path to the east stops here. You are on a rocky outcrop, "
                        DB "projected about 15 feet above the river. In the distance, a "
                        DB "tiny bridge spans the river.",0
DESC_MT_YMIR            DB "You are on the lower slopes of Mt. Ymir. The forest stretches "
                        DB "far away and to the west. Arctic winds blow fiercely, it's "
                        DB "very cold!",0
DESC_BRIDGE_NORTH       DB "You stand on a rocky precipice high above the river, Gioll; "
                        DB "Mt. Ymir stands to the north. A flimsy string bridge spans "
                        DB "the mighty river.",0
DESC_BRIDGE_MID         DB "You have made your way half way across the creaking bridge. "
                        DB "It sways violently from side to side. It's going to collapse "
                        DB "any second!!",0
DESC_BRIDGE_SOUTH       DB "You are on the southern edge of the mighty river, before the string bridge.",0
DESC_MUSHROOM_ROCK      DB "You are standing on a rock in the middle of a mighty oak "
                        DB "forest. Surrounding you are thousands of poisonous "
                        DB "mushrooms.",0
DESC_CAVE_CLEARING      DB "You are in a clearing in the forest. An ancient basalt rock "
                        DB "formation towers above you. To your south is the entrance of "
                        DB "a VERY interesting cave...",0
DESC_CLIFF_FACE         DB "You are on a cliff face over looking the river.",0
DESC_CAVE_ENTRY         DB "You are just inside the cave. Sunlight pours into the cave "
                        DB "lighting a path to the east and another to the south. I don't "
                        DB "mind saying I'm a bit scared!",0
DESC_DEAD_END           DB "This passage appears to be a dead end. On a wall before you "
                        DB "is carved `Find the Sacred Key of Thialfi'.",0
DESC_TREASURE_ROOM      DB "You are in the legendary treasure room of the black elves of "
                        DB "Svartalfheim. Every red-blooded Viking has dreamed of "
                        DB "entering this sacred room.",0
DESC_OAK_DOOR           DB "You can see a small oak door to the east. It has been locked "
                        DB "from the inside.",0
DESC_WIND_CORRIDOR      DB "You are standing in an east-west corridor. You can feel a "
                        DB "faint breeze coming from the east.",0
DESC_TORTURE_CHAMBER    DB "You are standing in what appears to have once been a torture "
                        DB "chamber. Apart from the rather comprehensive range of "
                        DB "instumentsof absolutely inhuman agony,",0
DESC_TORTURE_CHAMBER2   DB "coagulated blood stains on the walls and mangled bits of bone "
                        DB "on the floor make me think that a number of would be "
                        DB "adventurers croaked it here!",0
DESC_NS_TUNNEL          DB "You stand in a long tunnel which has been bored out of the "
                        DB "rock.It runs from north to south. A faint glow comes from a "
                        DB "narrow crack in the eastern wall.",0
DESC_ROUND_ROOM         DB "You are in a large round room with a number of exits. The "
                        DB "walls have been painted in a mystical dark purple and a big "
                        DB "chalk staris drawn in the centre of",0
DESC_ROUND_ROOM2        DB "the floor. Note: This is one of the hidden chambers of the "
                        DB "infamous pagan sect, the monks of Loki. Norse folk believe "
                        DB "them to be gods.",0
DESC_LEDGE_RIVER        DB "You are standing on a narrow ledge, high above a subterranean "
                        DB "river. There is an exit to the east.",0
DESC_TEMPLE_BALCONY     DB "You are on a balcony, overlooking a huge cavern which has "
                        DB "been converted into a pagan temple. Note: this temple has "
                        DB "been dedicated to Loki, the god of",0
DESC_TEMPLE_BALCONY2    DB "fire, who came to live in Svartalfheim after he had been "
                        DB "banished to exile by Odin. Since then he has been waiting "
                        DB "for the `End Of All Things'.",0
DESC_BAT_CAVE           DB "You are in the central cave of a giant bat colony. Above you "
                        DB "hundreds of giant bats hang from the ceiling and the floor "
                        DB "is covered in centuries of",0
DESC_BAT_CAVE2          DB "giant bat droppings. Careful where you step! Incidentally, "
                        DB "the smell is indescribable.",0
DESC_TEMPLE             DB "You are in the temple. To the north is a locked gate and on "
                        DB "the wall is a giant statue of Loki, carved out of the living "
                        DB "rock itself!",0
DESC_CRYPT              DB "You stand in an old and musty crypt, the final resting place "
                        DB "of hundreds of Loki devotees. On the wall is carved:``What 3 "
                        DB "letter word completes a word",0
DESC_CRYPT2             DB "starting with 'G---' and another ending with '---X'' Note: "
                        DB "The monks of Loki must have liked silly puzzles. "
                        DB "Putrefaction and decay fills the air here.",0
DESC_TINY_CELL          DB "You are in a tiny cell. The western wall has now firmly "
                        DB "closed again. There is a ventilator shaft on the eastern "
                        DB "wall.",0
DESC_WATERFALL_LEDGE    DB "You are on another ledge high above a subterranean river. "
                        DB "The water flows in through a hole in the cavern roof, to the "
                        DB "north.",0
DESC_WATERFALL_BASE     DB "You are standing near an enormous waterfall which brings "
                        DB "water down from the surface, from the river Gioll.",0
DESC_STONE_STAIR        DB "You are standing before a stone staircase which leads "
                        DB "southwards.",0
DESC_CASTLE_LEDGE       DB "You are on a narrow and crumbling ledge. On the other side of "
                        DB "the river you can see a magic castle. (Don't ask me why it's "
                        DB "magic...I just know it is)",0
DESC_DRAWBRIDGE         DB "You are by the drawbridge which has just lowered "
                        DB "itself....by magic!!",0
DESC_CASTLE_COURTYARD   DB "You are in the courtyard of the magic castle. WOW! This "
                        DB "castle is really something! On the wall is inscribed 'hzb "
                        DB "tzozi'. A secret escape tunnel leads south",0
DESC_POWDER_MAG         DB "You are in the powder magazine of this really super castle.",0
DESC_EAST_BANK          DB "You are on the eastern side of the river. A small tunnel "
                        DB "leads east into the cliff face.",0
DESC_WOODEN_BRIDGE      DB "You stand before a small wooden bridge which crosses the "
                        DB "river.",0
DESC_RIVER_CONDUIT      DB "You are in a conduit draining into the river. The water comes "
                        DB "up to your knees and is freezing cold. A narrow service path "
                        DB "leads south.",0

VERB_PATTERN_TABLE
                        DW VERB_TAKE, VERB_PUT, VERB_USING, VERB_WITH, VERB_CUT
                        DW VERB_BREAK, VERB_UNLOCK, VERB_OPEN, VERB_KILL, VERB_ATTACK
                        DW VERB_LIGHT, VERB_BURN, VERB_UP, VERB_DOWN, VERB_JUMP, VERB_SWIM

VERB_TAKE               DB "take",0
VERB_PUT                DB "put",0
VERB_USING              DB "using",0
VERB_WITH               DB "with",0
VERB_CUT                DB "cut",0
VERB_BREAK              DB "break",0
VERB_UNLOCK             DB "unlock",0
VERB_OPEN               DB "open",0
VERB_KILL               DB "kill",0
VERB_ATTACK             DB "attack",0
VERB_LIGHT              DB "light",0
VERB_BURN               DB "burn",0
VERB_UP                 DB "up",0
VERB_DOWN               DB "down",0
VERB_JUMP               DB "jump",0
VERB_SWIM               DB "swim",0

DIR_WORD_INDEX_TABLE
                        DW DIR_NORTH_STR, DIR_SOUTH_STR, DIR_WEST_STR, DIR_EAST_STR

DIR_NORTH_STR           DB "north",0
DIR_SOUTH_STR           DB "south",0
DIR_WEST_STR            DB "west",0
DIR_EAST_STR            DB "east",0

; NOTE: article handling (a/an) and leading/trailing spaces in strings to be normalized later via an article routine
MONSTER_NAME_TABLE
                        DW MON_NAME_WIZ, MON_NAME_DEMON, MON_NAME_TROLL
                        DW MON_NAME_DRAGON, MON_NAME_BAT, MON_NAME_DWARF

MONSTER_NOUN_TABLE
                        DW MON_NOUN_WIZ, MON_NOUN_DEMON, MON_NOUN_TROLL
                        DW MON_NOUN_DRAGON, MON_NOUN_BAT, MON_NOUN_DWARF

MON_NAME_WIZ            DB "evil "
MON_NOUN_WIZ            DB "wizard",0
MON_NAME_DEMON          DB "fiery "
MON_NOUN_DEMON          DB "demon",0
MON_NAME_TROLL          DB "axe wielding "
MON_NOUN_TROLL          DB "troll",0
MON_NAME_DRAGON         DB "fire breathing "
MON_NOUN_DRAGON         DB "dragon",0
MON_NAME_BAT            DB "giant "
MON_NOUN_BAT            DB "bat",0
MON_NAME_DWARF          DB "old and gnarled "
MON_NOUN_DWARF          DB "dwarf",0

; NOTE: article handling (a/an) and trimming leading/trailing padding spaces to be addressed later
OBJECT_NAME_NAME_TABLE:
                        DW OBJ_NAME_COIN, OBJ_NAME_COMPASS, OBJ_NAME_BOMB, OBJ_NAME_RUBY
                        DW OBJ_NAME_DIAMOND, OBJ_NAME_PEARL, OBJ_NAME_STONE, OBJ_NAME_RING
                        DW OBJ_NAME_PENDANT, OBJ_NAME_GRAIL, OBJ_NAME_SHIELD, OBJ_NAME_BOX
                        DW OBJ_NAME_KEY, OBJ_NAME_SWORD, OBJ_NAME_CANDLE, OBJ_NAME_ROPE
                        DW OBJ_NAME_BRICK, OBJ_NAME_GRILL

OBJECT_NAME_NOUN_TABLE:
                        DW OBJ_NOUN_COIN, OBJ_NOUN_COMPASS, OBJ_NOUN_BOMB, OBJ_NOUN_RUBY
                        DW OBJ_NOUN_DIAMOND, OBJ_NOUN_PEARL, OBJ_NOUN_STONE, OBJ_NOUN_RING
                        DW OBJ_NOUN_PENDANT, OBJ_NOUN_GRAIL, OBJ_NOUN_SHIELD, OBJ_NOUN_BOX
                        DW OBJ_NOUN_KEY, OBJ_NOUN_SWORD, OBJ_NOUN_CANDLE, OBJ_NOUN_ROPE
                        DW OBJ_NOUN_BRICK, OBJ_NOUN_GRILL

OBJ_NAME_COIN           DB "gold "
OBJ_NOUN_COIN           DB "coin",0
OBJ_NAME_COMPASS        DB "useful looking "
OBJ_NOUN_COMPASS        DB "compass",0
OBJ_NAME_BOMB           DB "home made "
OBJ_NOUN_BOMB           DB "bomb",0
OBJ_NAME_RUBY           DB "blood red "
OBJ_NOUN_RUBY           DB "ruby",0
OBJ_NAME_DIAMOND        DB "sparkling "
OBJ_NOUN_DIAMOND        DB "diamond",0
OBJ_NAME_PEARL          DB "moon-like "
OBJ_NOUN_PEARL          DB "pearl",0
OBJ_NAME_STONE          DB "interesting "
OBJ_NOUN_STONE          DB "stone",0
OBJ_NAME_RING           DB "diamond studded "
OBJ_NOUN_RING           DB "ring",0
OBJ_NAME_PENDANT        DB "magic "
OBJ_NOUN_PENDANT        DB "pendant",0
OBJ_NAME_GRAIL          DB "most holy "
OBJ_NOUN_GRAIL          DB "grail",0
OBJ_NAME_SHIELD         DB "mirror like "
OBJ_NOUN_SHIELD         DB "shield",0
OBJ_NAME_BOX            DB "nondescript black "
OBJ_NOUN_BOX            DB "box",0
OBJ_NAME_KEY            DB "old and rusty "
OBJ_NOUN_KEY            DB "key",0
OBJ_NAME_SWORD          DB "double bladed "
OBJ_NOUN_SWORD          DB "sword",0
OBJ_NAME_CANDLE         DB "small "
OBJ_NOUN_CANDLE         DB "candle",0
OBJ_NAME_ROPE           DB "thin and tatty "
OBJ_NOUN_ROPE           DB "rope",0
OBJ_NAME_BRICK          DB "red house "
OBJ_NOUN_BRICK          DB "brick",0
OBJ_NAME_GRILL          DB "rusty ventilation "
OBJ_NOUN_GRILL          DB "grill",0

OBJDESC1_TABLE:
                        DW MON_NAME_WIZ, MON_NAME_DEMON, MON_NAME_TROLL
                        DW MON_NAME_DRAGON, MON_NAME_BAT, MON_NAME_DWARF
                        DW OBJ_NAME_COIN, OBJ_NAME_COMPASS, OBJ_NAME_BOMB, OBJ_NAME_RUBY
                        DW OBJ_NAME_DIAMOND, OBJ_NAME_PEARL, OBJ_NAME_STONE, OBJ_NAME_RING
                        DW OBJ_NAME_PENDANT, OBJ_NAME_GRAIL, OBJ_NAME_SHIELD, OBJ_NAME_BOX
                        DW OBJ_NAME_KEY, OBJ_NAME_SWORD, OBJ_NAME_CANDLE, OBJ_NAME_ROPE
                        DW OBJ_NAME_BRICK, OBJ_NAME_GRILL

OBJDESC2_TABLE:
                        DW MON_NOUN_WIZ, MON_NOUN_DEMON, MON_NOUN_TROLL
                        DW MON_NOUN_DRAGON, MON_NOUN_BAT, MON_NOUN_DWARF
                        DW OBJ_NOUN_COIN, OBJ_NOUN_COMPASS, OBJ_NOUN_BOMB, OBJ_NOUN_RUBY
                        DW OBJ_NOUN_DIAMOND, OBJ_NOUN_PEARL, OBJ_NOUN_STONE, OBJ_NOUN_RING
                        DW OBJ_NOUN_PENDANT, OBJ_NOUN_GRAIL, OBJ_NOUN_SHIELD, OBJ_NOUN_BOX
                        DW OBJ_NOUN_KEY, OBJ_NOUN_SWORD, OBJ_NOUN_CANDLE, OBJ_NOUN_ROPE
                        DW OBJ_NOUN_BRICK, OBJ_NOUN_GRILL
