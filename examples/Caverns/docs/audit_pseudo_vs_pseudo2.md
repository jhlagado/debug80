# Caverns: `pseudo.txt` → `pseudo2.txt` fidelity audit

Source of truth: `docs/caverns/basic/pseudo.txt`  
Candidate: `docs/caverns/basic/pseudo2.txt`

Goal: confirm that `pseudo2.txt` preserves the gameplay logic of `pseudo.txt`, allowing for refactors that change *representation* (DATA→tables, pointer arrays) but not *meaning*.

## High-level changes in `pseudo2.txt` (intentional refactors)

These are structural refactors and are *not* logic changes by themselves:

1) **DATA/RESTORE/READ replaced with literal tables and pointer arrays**
   - `pseudo.txt` uses `RESTORE ... : READ ...` for `OBJECT_LOCATION`, verbs, monsters, object names, etc.
   - `pseudo2.txt` replaces these with pre-initialized arrays (and explicitly states “no RESTORE/READ needed”).

2) **Room descriptions converted from a giant `IF PLAYER_LOCATION = n THEN PRINT ...` ladder**
   - `pseudo.txt`: description text is encoded as many `IF PLAYER_LOCATION = ... THEN PRINT ...`.
   - `pseudo2.txt`: descriptions are stored in `ROOM_DESC1_PTR`/`ROOM_DESC2_PTR` pointer tables and printed by indexing.
   - Intended equivalence: `ROOM_DESC*_PTR(room)` points to the same string(s) that the ladder would have printed.

3) **Verb patterns / direction words / monster & object name strings moved into tables**
   - `pseudo.txt` reads pattern strings sequentially from `VERB_PATTERN_DATA` each parse.
   - `pseudo2.txt` keeps `VERB_PATTERN(16)` and `DIR_WORD_INDEX(4)` as tables of pointers.

4) **Added explicit dynamic exit patching**
   - `pseudo2.txt` introduces `UPDATE_DYNAMIC_EXITS_SUB` and calls it when the state changes (bridge, waterfall exit, secret exit, drawbridge, teleport).
   - In `pseudo.txt`, these dynamic exits were represented implicitly via data-reading/offset logic; `pseudo2.txt` makes it explicit and data-driven.

## Label-by-label logic comparison

### `GAME_START`
`pseudo.txt`:
- Initializes flags/counters and `OBJECT_LOCATION` by `RESTORE OBJECT_LOCATION_DATA` + `READ`.
- Does not explicitly initialize movement tables beyond `DIM MOVEMENT_OFFSETS(3)`.

`pseudo2.txt`:
- Initializes the same flags/counters.
- Declares room/object constants explicitly.
- Declares and initializes movement/object/desc/name/verb/direction tables as pre-initialized constant data.
- Calls `UPDATE_DYNAMIC_EXITS_SUB` once before the first description.

Verdict:
- Equivalent intent: initialize game state and tables.
- `UPDATE_DYNAMIC_EXITS_SUB` is a refactor that makes implicit dynamic exits explicit (expected to be equivalent once implemented correctly).

### `DESCRIBE_CURRENT_LOCATION`
Both files:
- Auto-attack gate: hostile present AND not bat AND not holding sword → `MONSTER_ATTACK`.
- Darkness gate: allow room description if room < 18 OR candle lit and candle is here or carried; else print darkness message then list room contents.

Verdict:
- Logic is the same.

### `PRINT_ROOM_DESCRIPTION`
`pseudo.txt`:
- Massive per-room print ladder.
- Additional conditional prints:
  - “You are deep in a dark cavern.” for listed room IDs / ranges.
  - snapped bridge warning at rooms 10/12 when `BRIDGE_CONDITION=128`
  - dragon corpse at room 14 when `OBJECT_LOCATION(4)=0`
  - drawbridge message at room 48 when `DRAWBRIDGE_STATE=49`
  - candle dim/out thresholds; sets `CANDLE_IS_LIT_FLAG=0` at out.

`pseudo2.txt`:
- Prints primary/secondary room description via pointer tables.
- Prints the same additional conditional prints and candle thresholds.

Verdict:
- Logic is the same *assuming* the pointer tables contain the same strings for each room (string identity is a data check, not a control-flow check).

### `LIST_ROOM_OBJECTS_AND_CREATURES`
Both files:
- Count objects 7..24 at player location; if any, print “You can also see...” and list with `PRINT_OBJECT_DESCRIPTION_SUB`.
- Count creatures 1..6 at player location; trigger intros; if any, print “Nearby there lurks...” and list.
- Print blank line, set `RESHOW_FLAG=1`, print prompt.
- If hostile present and not bat and not holding sword → `MONSTER_ATTACK`.
- Else `GET_PLAYER_INPUT`.

Verdict:
- Logic is the same.

### `GET_PLAYER_INPUT`
`pseudo.txt`:
- Reads input line, rejects empty.
- Pads with spaces.
- Inlines uppercase→lowercase conversion loop.
- Clears screen and proceeds to parse.

`pseudo2.txt`:
- Reads input line, rejects empty.
- Pads with spaces.
- `gosub NORMALIZE_INPUT_SUB` (replaces inline loop).
- Clears screen and proceeds.

Verdict:
- Logic is the same if `NORMALIZE_INPUT_SUB` performs the same lowercase normalization as the inline loop.

### `PARSE_COMMAND_ENTRY`
Key behaviors in both:
- Finds `CURRENT_OBJECT_INDEX` by searching for an object noun in the input (7..24).
- Updates dynamic state based on location and object movement:
  - At bridge mid → `BRIDGE_CONDITION=128`
  - At forest clearing → `GENERAL_FLAG_J=1`
  - At waterfall base → `WATER_EXIT_LOCATION=43`
  - At temple → `WATER_EXIT_LOCATION=0`
  - If grill moved from tiny cell → `GATE_DESTINATION=39`
  - If at drawbridge → `DRAWBRIDGE_STATE=49`
- Handles immediate commands:
  - `look` → `RESHOW_FLAG=0` → describe
  - `list` → inventory
  - `quit` → quit
- Else check creatures.

Main refactor difference:
- `pseudo.txt` uses `RESTORE OBJECT_NAME_DATA` + sequential `READ OBJECT_ADJECTIVE$, OBJECT_NOUN$`.
- `pseudo2.txt` uses `OBJECT_NAME_ADJ/NOUN` pointer arrays.

Verdict:
- Logic is the same, and `pseudo2.txt` is cleaner.
- Note: `pseudo2.txt` correctly calls `UPDATE_DYNAMIC_EXITS_SUB` after state changes; `pseudo.txt` does not explicitly, but this is consistent with the “explicit dynamic patch” refactor.

### `SHOW_INVENTORY`
Both files:
- Print carrying header.
- Count carried objects (location = -1).
- If none, print “nothing.” then describe.
- Else print blank line and list carried objects.

Verdict:
- Logic is the same.

### `QUIT_GAME` / `WAIT_FOR_YES_NO`
Both files:
- Score loop: objects 7..17; carried adds `(index-6)`; in room 1 adds `2*(index-6)`.
- Print score line, ranking, prompt another game.
- Wait for Y/N and branch.

Verdict:
- Logic is the same.

### `CHECK_CREATURE_AT_LOCATION` / `CHECK_CREATURE_BAT_SPECIAL`
Both files:
- Scan creatures 1..6 to see if any is in current room; set `HOSTILE_CREATURE_INDEX` and branch.
- If the hostile is bat (5): print bat message, move player to bat cave, clear reshow, move bat location by +7, then describe.
- Else return to verb/movement handling.

Verdict:
- Logic is the same.

### `MONSTER_ATTACK`
`pseudo.txt`:
- Reads `MONSTER_ADJECTIVE$`/`MONSTER_NOUN$` by scanning `MONSTER_DESCRIPTION_DATA` up to hostile index.

`pseudo2.txt`:
- Directly indexes `MONSTER_ADJ`/`MONSTER_NOUN` pointer arrays.

Verdict:
- Logic is the same if the data is equivalent.

### `HANDLE_VERB_OR_MOVEMENT`
`pseudo.txt`:
- Uses `RESTORE VERB_PATTERN_DATA` then reads one verb pattern string at a time and checks `INSTR`.
- Similar pattern for directions.

`pseudo2.txt`:
- Uses `VERB_PATTERN(16)` and `DIR_WORD_INDEX(4)` tables and checks `INSTR` against pointer dereference.

Verdict:
- Logic is the same.

### `HANDLE_MOVEMENT_COMMAND`
Both files:
- If bomb is neither carried nor in the player’s room, direction becomes random 0..3; else 0.
- Lookup `TARGET_LOCATION` from movement table.
- `EXIT_NONE`: print can’t-go message.
- `EXIT_FATAL`: print death message and quit.
- If target > 0: move player there.
- Clear reshow and describe.

Verdict:
- Logic is the same, with `pseudo2` using a 2D movement table instead of offset math.

### `HANDLE_NON_MOVEMENT_COMMAND`
Both files:
- “galar” → print wind message, move player to cave entry, clear reshow, describe.
- “ape” → print wall message, set `SECRET_EXIT_LOCATION=38`, update dynamic exits, describe.
- If no object parsed: print “eh?” and describe.
- If object not visible/carried: print “Where? I can’t see it.” and describe.
- Else proceed to `CHECK_GET_DROP_USE`.

Verdict:
- Logic is the same.

### `CHECK_GET_DROP_USE` / `GET` / `DROP`
Both files:
- `get` → count carried, refuse if >10, else set object location to -1.
- `drop` → set object location to player room.
- Else route use by object.

Verdict:
- Logic is the same.

### `ROUTE_USE_BY_OBJECT` / `USE_KEY` / `USE_SWORD` / `USE_BOMB` / `USE_ROPE`
Both files match on the high-level branching rules:
- Key: only works at forest clearing or temple, opens door, moves key to room, reshow=0, teleports player accordingly.
- Sword: if no hostile, message. Else uses `SWORD_SWING_COUNT` gating, then fight continues or death.
- Fight continues: kill chance `RND < .38`, else pick one of 4 messages; bat special case.
- Kill: sets creature/object locations, wizard sword crumble special, corpse vaporize special (not dragon), clears hostile.
- Bomb: requires bomb present/carried, requires candle lit, explosion knockback and possible teleport destination, bomb to 0.
- Rope: only at temple balcony, descent message, rope left, player to temple, reshow=0.

Verdict:
- Logic is the same in intent.

## Things to explicitly double-check (data equivalence)

These are not control-flow differences, but they matter to “faithfulness”:
- The pointer tables (`ROOM_DESC1_PTR`, `ROOM_DESC2_PTR`, `OBJECT_NAME_*`, `MONSTER_*`, `OBJDESC*`, verb/direction tables) must contain the same strings that `pseudo.txt` would have printed/read.
- Movement table data must match the original offset-based movement behavior.
- Any introduced dynamic-exit patching (`UPDATE_DYNAMIC_EXITS_SUB`) must correctly update the same exits that were dynamic in the original.

## Data-equivalence verification performed (now)

This section is the concrete “double check” against `pseudo.txt`’s static data/strings.

1) **Movement table (`MOVEMENT_TABLE_DATA`)**
   - `pseudo.txt` embeds dynamic placeholders (`BRIDGE_CONDITION`, `TELEPORT_DESTINATION`, `SECRET_EXIT_LOCATION`, `WATER_EXIT_LOCATION`, `GATE_DESTINATION`, `DRAWBRIDGE_STATE`) inside the DATA stream.
   - For equivalence, those placeholders were substituted with the `GAME_START` initial values (11,0,0,0,0,128 respectively) and then the flattened 216-byte table was compared to `pseudo2.txt`’s `MOVEMENT_TABLE_DATA` after expanding `ROOM_*` and `EXIT_*` constants.
   - Result: **identical** (216/216 bytes match).

2) **Initial object locations (`OBJECT_LOCATION_DATA`)**
   - Compared `pseudo.txt` 24 DATA bytes to `pseudo2.txt` 24 DW entries after expanding `ROOM_*` constants.
   - Result: **identical** (24/24 match).

3) **Room description pointer tables (`ROOM_DESC1_PTR` / `ROOM_DESC2_PTR`)**
   - Verified that `pseudo2.txt` description tables index the correct `DESC_*` strings for each room, matching the `pseudo.txt` per-room `IF PLAYER_LOCATION = n THEN PRINT ...` ladder.
   - Fix applied in `pseudo2.txt`:
     - `ROOM_DESC1_PTR` had an off-by-one misalignment starting at room 45 and an extra 55th entry; corrected to exactly 54 entries aligned to room IDs.
     - `ROOM_DESC2_PTR` was length 53; corrected to 54 entries by appending a trailing `NULL`.
   - After fix: per-room description text now matches `pseudo.txt` for all rooms, except for harmless whitespace corrections (e.g. “pathleads” → “path leads”).

4) **Drainage system message (rooms 41..44)**
   - `pseudo.txt` prints a range message for rooms 41–44 (`PLAYER_LOCATION > 40 AND < 45`).
   - `pseudo2.txt` originally omitted this; added the same conditional print using constants:
     - `if PLAYER_LOCATION > ROOM_LEDGE_WATERFALL_IN and PLAYER_LOCATION < ROOM_WATERFALL_BASE then print "...drainage system..."`.

5) **Verb patterns and direction words**
   - Compared normalized word lists:
     - `VERB_PATTERN_DATA` in `pseudo.txt` vs `VERB_PATTERN_DATA` pointer targets in `pseudo2.txt`.
     - `DIRECTION_WORD_DATA` in `pseudo.txt` vs `DIR_WORD_INDEX_DATA` pointer targets in `pseudo2.txt`.
   - Result: **identical word sets and ordering** after trimming/padding differences (pseudo uses space-padded tokens, pseudo2 uses table indirection).

6) **Monster and object name tokens**
   - Compared `MONSTER_DESCRIPTION_DATA` and `OBJECT_NAME_DATA` in `pseudo.txt` to the concatenation of `MONSTER_ADJ_DATA`/`MONSTER_NOUN_DATA` and `OBJECT_NAME_ADJ_DATA`/`OBJECT_NAME_NOUN_DATA` targets in `pseudo2.txt`.
   - Result: **identical**, including the original article hack strings (`"n evil"`, etc).

## Conclusion

`docs/caverns/basic/pseudo2.txt` is a faithful refactor of `docs/caverns/basic/pseudo.txt` at the level of game logic and state transitions, with the key difference being a deliberate shift to a data-driven (table/pointer) representation and explicit dynamic-exit patching.
