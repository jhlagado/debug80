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
