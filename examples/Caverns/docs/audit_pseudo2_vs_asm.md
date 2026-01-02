# Caverns: pseudo2 → Z80 assembly audit

Source of truth: `docs/caverns/basic/pseudo2.txt`

Target: `docs/caverns/caverns.asm` (+ shared tables/strings/constants/utils/variables)

Goal: gameplay fidelity (same state updates + branching), not UI/formatting.

## Label mapping (pseudo2 → assembly)

| Pseudo2 label | Assembly label | Pseudo2 line | ASM line |
|---|---|---:|---:|
| `GAME_START` | `gameStart` | 17 | 20 |
| `DESCRIBE_CURRENT_LOCATION` | `describeCurrentLocation` | 142 | 59 |
| `PRINT_ROOM_DESCRIPTION` | `printRoomDescription` | 160 | 108 |
| `LIST_ROOM_OBJECTS_AND_CREATURES` | `listRoomObjectsAndCreatures` | 200 | 245 |
| `GET_PLAYER_INPUT` | `getPlayerInput` | 252 | 395 |
| `PARSE_COMMAND_ENTRY` | `parseCommandEntry` | 271 | 429 |
| `SHOW_INVENTORY` | `showInventory` | 342 | 541 |
| `QUIT_GAME` | `quitGame` | 370 | 602 |
| `WAIT_FOR_YES_NO` | `waitForYesNo` | 390 | 676 |
| `CHECK_CREATURE_AT_LOCATION` | `checkCreatureAtLocation` | 408 | 696 |
| `CHECK_CREATURE_BAT_SPECIAL` | `checkCreatureBatSpecial` | 421 | 729 |
| `MONSTER_ATTACK` | `monsterAttack` | 435 | 752 |
| `HANDLE_VERB_OR_MOVEMENT` | `handleVerbOrMovement` | 446 | 786 |
| `HANDLE_MOVEMENT_COMMAND` | `handleMovementCommand` | 466 | 847 |
| `HANDLE_NON_MOVEMENT_COMMAND` | `handleNonMovementCommand` | 495 | 909 |
| `CHECK_GET_DROP_USE` | `checkGetDropUse` | 528 | 963 |
| `HANDLE_GET_COMMAND` | `handleGetCommand` | 545 | 983 |
| `HANDLE_DROP_COMMAND` | `handleDropCommand` | 565 | 1032 |
| `ROUTE_USE_BY_OBJECT` | `routeUseByObject` | 572 | 1047 |
| `USE_KEY` | `useKey` | 590 | 1065 |
| `USE_SWORD` | `useSword` | 611 | 1102 |
| `SWORD_FIGHT_CONTINUES` | `swordFightContinues` | 629 | 1135 |
| `SWORD_KILLS_TARGET` | `swordKillsTarget` | 656 | 1167 |
| `USE_BOMB` | `useBomb` | 680 | 1221 |
| `USE_ROPE` | `useRope` | 709 | 1272 |
| `PRINT_OBJECT_DESCRIPTION_SUB` | `printObjectDescriptionSub` | 724 | 1305 |
| `ROUTE_BY_VERB_PATTERN` | `routeByVerbPattern` | 731 | 1348 |
| `PRINT_RANKING_SUB` | `printRankingSub` | 765 | 1383 |
| `READ_INPUT_THEN_CLEAR_SUB` | `readInputThenClearSub` | 785 | 1412 |
| `ENCOUNTER_WIZARD_LABEL` | `encounterWizardLabel` | 793 | 1416 |
| `ENCOUNTER_DRAGON_LABEL` | `encounterDragonLabel` | 800 | 1421 |
| `ENCOUNTER_DWARF_LABEL` | `encounterDwarfLabel` | 808 | 1428 |
| `TRIGGER_CREATURE_INTRO_SUB` | `triggerCreatureIntroSub` | 815 | 1433 |
| `UPDATE_DYNAMIC_EXITS_SUB` | `updateDynamicExits` | 1087 | 1447 |

## Per-routine state audit (reads/writes/branches)

Notation:
- “Reads/Writes” refer to persistent game state in RAM (`variables.asm`) and mutable arrays (`movementTable`, `objectLocation`).
- String/table pointer reads are noted, but they are constant data (ROM/const).

### `gameStart` (pseudo2 `GAME_START`)
- Reads: none.
- Writes: (via `initState`) all mutable state + `movementTable[]` + `objectLocation[]`.
- Calls: `initState`, `updateDynamicExits`.
- Branches: unconditional `jp describeCurrentLocation`.

### `initState` (pseudo2 `GAME_START` init block)
- Reads: `movementTableData`, `objectLocationTable` (const tables).
- Writes:
  - `bridgeCondition=roomBridgeMid` (pseudo: 11)
  - `drawbridgeState=exitFatal` (pseudo: 128)
  - `waterExitLocation=0`
  - `gateDestination=0`
  - `teleportDestination=0`
  - `secretExitLocation=0`
  - `generalFlagJ=0`
  - `hostileCreatureIndex=0`
  - `reshowFlag=0`
  - `playerLocation=roomDarkRoom`
  - `candleIsLitFlag=boolTrue`
  - `fearCounter=0`
  - `turnCounter=0`
  - `swordSwingCount=0`
  - `score=0`
  - `movementTable[]` copied from `movementTableData`
  - `objectLocation[]` copied from `objectLocationTable`
- Calls: none.
- Branches: none.

### `updateDynamicExits` (pseudo2 `UPDATE_DYNAMIC_EXITS_SUB`)
- Reads: `bridgeCondition`, `teleportDestination`, `secretExitLocation`, `waterExitLocation`, `gateDestination`, `drawbridgeState`.
- Writes: patches `movementTable[]` for:
  - bridge anchors (north/south)
  - oak door east teleport
  - crypt east secret exit
  - tiny cell north water exit
  - tiny cell east gate destination
  - castle ledge east drawbridge state
- Calls: none.
- Branches: none.

### `describeCurrentLocation` (pseudo2 `DESCRIBE_CURRENT_LOCATION`)
- Reads: `hostileCreatureIndex`, `currentObjectIndex`, `playerLocation`, `candleIsLitFlag`, `objectLocation[objCandle]`.
- Writes: none.
- Calls: `printStr` (darkness message), branches to `printRoomDescription` / `listRoomObjectsAndCreatures` / `monsterAttack`.
- Branches:
  - Auto-attack if `hostileCreatureIndex!=0` AND `!=creatureBatIndex` AND `currentObjectIndex!=objSword`.
  - Darkness gate: if `playerLocation < roomDarkCavernA` OR (`candleIsLitFlag!=0` AND (candle at location OR `roomCarried`)).

### `printRoomDescription` (pseudo2 `PRINT_ROOM_DESCRIPTION`)
- Reads: `playerLocation`, `bridgeCondition`, `drawbridgeState`, `turnCounter`, `objectLocation[objDragon]`.
- Writes: `candleIsLitFlag=0` when candle out threshold reached.
- Calls: `printStr`.
- Branches: mirrors pseudo2 conditional prints (dark cavern list/ranges, bridge snapped, dragon corpse, drawbridge message, candle dim/out).

### `listRoomObjectsAndCreatures` (pseudo2 `LIST_ROOM_OBJECTS_AND_CREATURES`)
- Reads: `playerLocation`, `objectLocation[]`, `hostileCreatureIndex`, `currentObjectIndex`.
- Writes:
  - `visibleObjectCount`, `visibleCreatureCount`
  - `loopIndex` (loop control)
  - `currentObjectIndex` during listing
  - `reshowFlag=boolTrue` after printing prompt
- Calls:
  - `triggerCreatureIntroSub` during creature counting
  - `printObjectDescriptionSub` during listing
  - `printNewline`, `printStr`
- Branches:
  - Only prints headers if counts non-zero.
  - Auto-attack gate at end matches pseudo2.

### `getPlayerInput` (pseudo2 `GET_PLAYER_INPUT`)
- Reads: keyboard via `readLine`/`sysGetc`.
- Writes:
  - `inputBuffer[]` (null-terminated, padded with spaces)
  - `turnCounter++`
- Calls: `readLine`, `normalizeInput`, `clearScreen`.
- Branches:
  - Re-prompts if empty input (checks `inputBuffer+1 == 0` after padding).

### `parseCommandEntry` (pseudo2 `PARSE_COMMAND_ENTRY`)
- Reads:
  - `inputBuffer[]`
  - `objectNameNounTable[]` (const pointers)
  - `playerLocation`
  - `objectLocation[objGrill]`
- Writes:
  - `currentObjectIndex` (0 if none matched)
  - Dynamic flags/locations:
    - if `playerLocation==roomBridgeMid`: `bridgeCondition=exitFatal` and `updateDynamicExits`
    - if `playerLocation==roomForestClearing`: `generalFlagJ=boolTrue`
    - if `playerLocation==roomWaterfallBase`: `waterExitLocation=roomDrainC (43)` and `updateDynamicExits`
    - if `playerLocation==roomTemple`: `waterExitLocation=0` and `updateDynamicExits`
    - if `objectLocation[objGrill] != roomTinyCell`: `gateDestination=roomDarkCavernJ (39)` and `updateDynamicExits`
    - if `playerLocation==roomDrawbridge`: `drawbridgeState=roomDrawbridge (49)` and `updateDynamicExits`
  - `reshowFlag=0` on LOOK
- Calls:
  - `containsStr` for noun scan and command tokens
  - `updateDynamicExits` when needed
- Branches:
  - LOOK → `describeCurrentLocation`
  - LIST → `showInventory`
  - QUIT → `quitGame`
  - else → `checkCreatureAtLocation`

### `showInventory` (pseudo2 `SHOW_INVENTORY`)
- Reads: `objectLocation[7..24]`.
- Writes:
  - `visibleObjectCount`
  - `loopIndex`
  - `currentObjectIndex` while printing
- Calls: `printStr`, `printNewline`, `printObjectDescriptionSub`.
- Branches:
  - If no carried objects → print “nothing.” then `describeCurrentLocation`.

### `quitGame` (pseudo2 `QUIT_GAME`)
- Reads: `objectLocation[7..17]`, `turnCounter`.
- Writes: `score` recomputed from scratch.
- Calls: `printNewline`, `printStr`, `printNum`, `printRankingSub`, then `waitForYesNo`.
- Branches:
  - Score loop matches pseudo2: carried adds `(index-6)`, in `roomDarkRoom` adds `2*(index-6)`.

### `waitForYesNo` (pseudo2 `WAIT_FOR_YES_NO`)
- Reads: keyboard via `getc`.
- Writes: `yesnoKey`.
- Calls: `getc`, `toLowerAscii`.
- Branches:
  - `y` → `gameStart`
  - `n` → `gameEnd` (halt loop)
  - other → loop

### `checkCreatureAtLocation` (pseudo2 `CHECK_CREATURE_AT_LOCATION`)
- Reads: `playerLocation`, `objectLocation[1..6]`.
- Writes: `hostileCreatureIndex` (scans 1..6, else 0).
- Calls: none.
- Branches:
  - If any creature shares room → `checkCreatureBatSpecial`
  - else → `handleVerbOrMovement`

### `checkCreatureBatSpecial` (pseudo2 `CHECK_CREATURE_BAT_SPECIAL`)
- Reads: `hostileCreatureIndex`, `objectLocation[creatureBatIndex]`.
- Writes:
  - if bat: prints text, sets `playerLocation=roomBatCave`, `reshowFlag=0`,
    and moves bat location by `batRelocateOffset` (7).
- Calls: `printStr`.
- Branches:
  - bat → `describeCurrentLocation`
  - else → `handleVerbOrMovement`

### `monsterAttack` (pseudo2 `MONSTER_ATTACK`)
- Reads: `hostileCreatureIndex`, `monsterNameTable[]`, `monsterNounTable[]`.
- Writes: none.
- Calls: `printStr` multiple times.
- Branches: unconditional `quitGame`.

### `handleVerbOrMovement` (pseudo2 `HANDLE_VERB_OR_MOVEMENT`)
- Reads: `inputBuffer[]`.
- Writes:
  - `verbPatternIndex` while scanning
  - `directionIndex` while scanning
- Calls: `containsStr` repeatedly.
- Branches:
  - First match in `verbPatternTable[1..16]` → `routeByVerbPattern`
  - Else first match in `dirWordIndexTable[0..3]` → `handleMovementCommand`
  - Else → `handleNonMovementCommand`

### `handleMovementCommand` (pseudo2 `HANDLE_MOVEMENT_COMMAND`)
- Reads: `playerLocation`, `movementTable[]`, `objectLocation[objBomb]`.
- Writes:
  - `randomDirectionIndex` (0 or random 0..3)
  - `targetLocation`
  - `playerLocation` if moving
  - `reshowFlag=0`
- Calls: `rand0To3`, `printStr`, `printNewline`.
- Branches:
  - EXIT_NONE → prints can’t-go message (no move)
  - EXIT_FATAL → prints death text then `quitGame`
  - else if target > 0 → move player

### `handleNonMovementCommand` (pseudo2 `HANDLE_NON_MOVEMENT_COMMAND`)
- Reads: `inputBuffer[]`, `currentObjectIndex`, `playerLocation`, `objectLocation[currentObjectIndex]`.
- Writes:
  - `reshowFlag=0` and `playerLocation=roomCaveEntry` for “galar”
  - `secretExitLocation=roomTinyCell` for “ape” and calls `updateDynamicExits`
- Calls: `containsStr`, `printStr`, `updateDynamicExits`.
- Branches (mirrors pseudo2 order):
  - “galar” → teleport + `describeCurrentLocation`
  - “ape” → open wall + `describeCurrentLocation`
  - if `currentObjectIndex==0` → print “eh?” + `describeCurrentLocation`
  - if object not visible/not carried → print “Where? I can’t see it.” + `describeCurrentLocation`
  - else → `checkGetDropUse`

### `checkGetDropUse` (pseudo2 `CHECK_GET_DROP_USE`)
- Reads: `inputBuffer[]`.
- Writes: none.
- Calls: `containsStr`.
- Branches:
  - “ get ” → `handleGetCommand`
  - “ drop ” → `handleDropCommand`
  - else → `routeUseByObject`

### `handleGetCommand` (pseudo2 `HANDLE_GET_COMMAND`)
- Reads: `objectLocation[7..24]`, `currentObjectIndex`, `playerLocation`.
- Writes:
  - `carriedCount` (computed)
  - `objectLocation[currentObjectIndex]=roomCarried` if allowed
- Calls: `printStr` on overflow.
- Branches:
  - if `carriedCount > maxCarryItems` → message + `describeCurrentLocation`
  - else carry object.

### `handleDropCommand` (pseudo2 `HANDLE_DROP_COMMAND`)
- Reads: `currentObjectIndex`, `playerLocation`.
- Writes: `objectLocation[currentObjectIndex]=playerLocation`.
- Calls: none.
- Branches: unconditional `describeCurrentLocation`.

### `routeUseByObject` (pseudo2 `ROUTE_USE_BY_OBJECT`)
- Reads: `currentObjectIndex`.
- Writes: none.
- Calls: `printStr` for default case.
- Branches:
  - `objKey` → `useKey`
  - `objSword` → `useSword`
  - `objCandle` → `useBomb` (candle ignites bomb)
  - `objRope` → `useRope`
  - else → message then `describeCurrentLocation`

### `useKey` (pseudo2 `USE_KEY`)
- Reads: `playerLocation`.
- Writes:
  - `objectLocation[objKey]=playerLocation`
  - `reshowFlag=0`
  - `playerLocation` becomes `roomDarkRoom` (from forest) or `roomCrypt` (from temple)
- Calls: `printStr`.
- Branches:
  - if not in forest-clearing or temple → “It won’t open!”

### `useSword` / `swordFightContinues` / `swordKillsTarget` (pseudo2 `USE_SWORD`…)
- Reads: `hostileCreatureIndex`, `swordSwingCount`, RNG, `currentObjectIndex`.
- Writes:
  - `swordSwingCount++`
  - `randomFightMessage`
  - `objectLocation[currentObjectIndex]=roomCarried` on kill
  - `objectLocation[hostileCreatureIndex]` updated:
    - troll/bat: +`corpseRelocateOffset` (10)
    - others: set to 0
    - wizard special: print crumbles + move sword to `roomTemple` (35)
  - `hostileCreatureIndex=0` after kill
- Calls: `rand0To6`, `randByte`, `rand0To3`, `printStr`.
- Branches:
  - if `hostileCreatureIndex==0` → “nothing to kill”
  - miss threshold: approximates pseudo2 `RND*7+15 > swordSwingCount`
  - kill chance approximates pseudo2 `RND < .38`
  - if bat during fight: branches to bat special handling
  - message selection 0..3 matches pseudo2 semantics
  - corpse vaporization printed if not dragon

### `useBomb` (pseudo2 `USE_BOMB`)
- Reads: `objectLocation[objBomb]`, `playerLocation`, `candleIsLitFlag`.
- Writes:
  - If bomb not present/carried: sets `candleIsLitFlag=0`
  - On explode:
    - `reshowFlag=0`
    - if `playerLocation > roomDarkRoom`: decrements room id; if becomes `roomOakDoor` sets `teleportDestination=roomTreasureRoom` and updates exits
    - `objectLocation[objBomb]=0`
- Calls: `printStr`, `updateDynamicExits`.

### `useRope` (pseudo2 `USE_ROPE`)
- Reads: `playerLocation`, `currentObjectIndex`.
- Writes:
  - if allowed: `reshowFlag=0`, `objectLocation[currentObjectIndex]=playerLocation`, `playerLocation=roomTemple`
- Calls: `printStr`.

### `printObjectDescriptionSub` (pseudo2 `PRINT_OBJECT_DESCRIPTION_SUB`)
- Reads: `currentObjectIndex`, `objdesc1Table[]`, `objdesc2Table[]`.
- Writes: none (prints only).
- Calls: `printAdj`, `printSpace`, `printStr`, `putc`.
- Notes: Uses computed article (`a/an`) based on adjective first letter; pseudo2 always prints `"a"` then strings; this is an intended improvement (grammar), not a logic change.

### `routeByVerbPattern` (pseudo2 `ROUTE_BY_VERB_PATTERN`)
- Reads: `verbPatternIndex`.
- Writes: none.
- Calls: `printStr`, `printNewline`.
- Branches: maps indices 1..4 to GET/DROP/USE; indices 5..6 to “Nothing happens”; 7..12 to “Please tell me how…”; 13..16 to “I can’t…”.

### `printRankingSub` (pseudo2 `PRINT_RANKING_SUB`)
- Reads: `score`.
- Writes: none.
- Calls: `printStr`.
- Branches: threshold ladder matches pseudo2 `<20`, `<50`, `<100`, `<126`, else.

### `readInputThenClearSub` (pseudo2 `READ_INPUT_THEN_CLEAR_SUB`)
- Pseudo2 reads input and clears screen.
- Assembly is a stub and is unused by control flow (input handled by `getPlayerInput`).

### `encounterWizardLabel` / `encounterDragonLabel` / `encounterDwarfLabel` / `triggerCreatureIntroSub`
- Reads: `currentObjectIndex`.
- Writes: none (except via control flow; just prints).
- Calls: `printStr`.
- Branches: wizard/dragon/dwarf indices match pseudo2 (1,4,6).

## Audit checklist (by pseudo2 section)

### `GAME_START`
Pseudo2 intent:
- Reset flags/counters and player state.
- Initialize tables from static data.
- Call `UPDATE_DYNAMIC_EXITS_SUB`.
- Jump to `DESCRIBE_CURRENT_LOCATION`.

Assembly status:
- Implemented via `gameStart` → `initState` → `updateDynamicExits` → `describeCurrentLocation`.
- Tables: `initState` copies `movementTableData` → `movementTable` and `objectLocationTable` → `objectLocation`.

Notes:
- `clearScreen` is currently a stub in `utils.asm` (prints newlines). This affects presentation only, not logic.

### `DESCRIBE_CURRENT_LOCATION`
Pseudo2 intent:
- If hostile creature exists and not bat and player not holding sword → `MONSTER_ATTACK`.
- Darkness gating:
  - if before dark caverns, OR candle lit AND (candle at location OR carried) → room description.
  - else print darkness warning then list contents.

Assembly status:
- Hostile gating matches: checks `hostileCreatureIndex != 0`, `!= creatureBatIndex`, and `currentObjectIndex != objSword` then `jp monsterAttack`.
- Darkness gating matches: compares `playerLocation < roomDarkCavernA` OR `candleIsLitFlag != 0` AND candle location equals `playerLocation` or `roomCarried`.

### `PRINT_ROOM_DESCRIPTION`
Pseudo2 intent:
- Print room desc1 and desc2 if non-null.
- Print “dark cavern” generic line for specific cave rooms / ranges + wooden bridge.
- Print snapped bridge warning if at bridge anchors and `bridgeCondition == EXIT_FATAL`.
- Print dragon corpse if at cave entrance clearing and `objectLocation(OBJ_DRAGON) == 0`.
- Print drawbridge text if at castle ledge and drawbridge lowered into drawbridge room.
- Candle dim/out text; set candle flag to 0 at out threshold.

Assembly status:
- Desc1/desc2 pointer fetch uses `roomDesc1Table`/`roomDesc2Table` with (room-1)*2 indexing and null checks.
- Dark cavern condition replicated via explicit compares + range check (Temple balcony range).
- Bridge anchor check replicated; tests `bridgeCondition == exitFatal`.
- Dragon corpse check replicated using `objectLocation+objDragon-1 == 0`.
- Drawbridge check replicated.
- Candle thresholds replicated; sets `candleIsLitFlag` to 0 at out threshold.

### `LIST_ROOM_OBJECTS_AND_CREATURES`
Pseudo2 intent:
- Count visible objects (7..24), print header and list with `PRINT_OBJECT_DESCRIPTION_SUB`.
- Count visible creatures (1..6), trigger intros, print header and list.
- Print blank line + prompt, set `RESHOW_FLAG=1`.
- If hostile present and not bat and player not holding sword → `MONSTER_ATTACK`.
- Else `GET_PLAYER_INPUT`.

Assembly status:
- Object and creature loops implemented; headers printed only if counts non-zero.
- Encounter intros: `triggerCreatureIntroSub` called during creature counting loop.
- Prompt sets `reshowFlag` to `boolTrue`.
- Auto-attack gating mirrored.

### `GET_PLAYER_INPUT`
Pseudo2 intent:
- Read non-empty command line.
- Pad with spaces, normalize (lowercase), increment turn counter.
- Clear screen, continue to parse.

Assembly status:
- Reads into `inputBuffer` via `readLine`, forces leading/trailing spaces, normalizes lowercase, increments `turnCounter`, calls `clearScreen`, jumps to `parseCommandEntry`.

### `PARSE_COMMAND_ENTRY`
Pseudo2 intent:
- Scan object nouns 7..24 to set `currentObjectIndex`.
- Update dynamic exits/flags:
  - if at bridge mid: `bridgeCondition=128`, update exits
  - if at forest clearing: `generalFlagJ=1`
  - if at waterfall base: `waterExitLocation=43`, update exits
  - if at temple: `waterExitLocation=0`, update exits
  - if grill moved from tiny cell: `gateDestination=39`, update exits
  - if at drawbridge room: `drawbridgeState=49`, update exits
- Handle immediate commands:
  - look → reshow=0, describe
  - list → inventory
  - quit → quit
- Else check creatures.

Assembly status:
- Noun scan implemented by indexing `objectNameNounTable` and using `containsStr` against `inputBuffer`.
- Dynamic updates implemented.
- Gate destination bug fix applied: sets `gateDestination` to `roomDarkCavernJ` (39) when grill moved.
- look/list/quit token checks implemented via `containsStr`.

### Remaining sections
These are implemented in assembly but must be audited in detail against pseudo2:
- `CHECK_CREATURE_AT_LOCATION` / `CHECK_CREATURE_BAT_SPECIAL`
- `MONSTER_ATTACK`
- `HANDLE_VERB_OR_MOVEMENT` / `HANDLE_MOVEMENT_COMMAND`
- `HANDLE_NON_MOVEMENT_COMMAND` (magic words)
- `CHECK_GET_DROP_USE` / `GET` / `DROP`
- `ROUTE_USE_BY_OBJECT` and `USE_*` routines
- `PRINT_OBJECT_DESCRIPTION_SUB`
- `ROUTE_BY_VERB_PATTERN`
- `QUIT_GAME` scoring/ranking text thresholds

## Open issues / known non-identical behavior

1) Sword combat randomness: updated to mirror pseudo2 much more closely:
   - Miss threshold now uses `rand0To6 + 15` (15..21) compared against `swordSwingCount` (matches `RND*7+15` intent).
   - Kill chance now uses `randByte < 97` to approximate `RND < .38`.
   This should be close to pseudo2’s distribution, but it is still an approximation (integer PRNG and thresholds).
2) `clearScreen` is a presentation stub.

## Confirmed mismatches found during audit

1) `HANDLE_NON_MOVEMENT_COMMAND` / “eh?” check ordering:
   - Pseudo2: after handling `galar`/`ape`, if `CURRENT_OBJECT_INDEX < 1` prints `"eh?"`.
   - Assembly had a control-flow bug where the non-`ape` path jumped directly to visibility checking, skipping the `"eh?"` check.
   - Fixed by inserting `hnmEnsureObjectParsed` and routing the non-`ape` path through it.

2) `ROUTE_USE_BY_OBJECT` candle/bomb mapping:
   - Pseudo2 routes `OBJ_CANDLE` to `USE_BOMB` (candle ignites bomb logic).
   - Assembly briefly routed `OBJ_BOMB` to `useBomb`; now restored to match pseudo2 (`objCandle` → `useBomb`).
