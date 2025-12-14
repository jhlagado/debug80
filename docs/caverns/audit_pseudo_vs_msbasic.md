# Caverns: `msbasic.txt` → `pseudo.txt` fidelity audit

Source of truth: `docs/caverns/basic/msbasic.txt`  
Candidate: `docs/caverns/basic/pseudo.txt`

Scope: **gameplay logic** (state variables, branching, side effects).  
Non-goals: screen/graphics removal, spacing in printed text (formatting).

## Variable mapping (msbasic → pseudo)

| msbasic | Meaning | pseudo |
|---|---|---|
| `A` | `PLAYER_LOCATION` | `PLAYER_LOCATION` |
| `P()` | object/creature locations (1..24) | `OBJECT_LOCATION()` |
| `Z` | `HOSTILE_CREATURE_INDEX` | `HOSTILE_CREATURE_INDEX` |
| `M` | `CURRENT_OBJECT_INDEX` | `CURRENT_OBJECT_INDEX` |
| `H` | `BRIDGE_CONDITION` | `BRIDGE_CONDITION` |
| `D` | `DRAWBRIDGE_STATE` | `DRAWBRIDGE_STATE` |
| `W` | `WATER_EXIT_LOCATION` | `WATER_EXIT_LOCATION` |
| `G` | `GATE_DESTINATION` | `GATE_DESTINATION` |
| `T` | `TELEPORT_DESTINATION` | `TELEPORT_DESTINATION` |
| `E` | `SECRET_EXIT_LOCATION` | `SECRET_EXIT_LOCATION` |
| `C0` | candle lit flag | `CANDLE_IS_LIT_FLAG` |
| `U` | turn counter | `TURN_COUNTER` |
| `F` | sword swing count | `SWORD_SWING_COUNT` |
| `S` | score | `SCORE` |
| `A0$` | input command | `INPUT_COMMAND$` |

## Control-flow mapping (msbasic line ranges → pseudo labels)

This is approximate, but the structure matches cleanly:

- Main loop: msbasic line `5` acts like `DESCRIBE_CURRENT_LOCATION` entry in pseudo (after initial banner).
- Parse/input loop: msbasic `79..107` ≈ `GET_PLAYER_INPUT` + `PARSE_COMMAND_ENTRY` + `SHOW_INVENTORY` + `QUIT_GAME` + `WAIT_FOR_YES_NO`.
- Creature scan: msbasic `108..112` ≈ `CHECK_CREATURE_AT_LOCATION` + `CHECK_CREATURE_BAT_SPECIAL` + `MONSTER_ATTACK`.
- Verb/direction routing: msbasic `113..173` ≈ `HANDLE_VERB_OR_MOVEMENT` + movement/non-movement + get/drop/use + `ROUTE_BY_VERB_PATTERN`.
- Data tables: msbasic `174..191` ≈ pseudo `MOVEMENT_TABLE_DATA`, `MONSTER_DESCRIPTION_DATA`, `OBJECT_NAME_DATA`, `DIRECTION_WORD_DATA`, `VERB_PATTERN_DATA`.

## Logic equivalence findings (by gameplay area)

### 1) Initialization
msbasic line 2:
- `H=11:D=128:W=0:G=0:T=0:E=0`
- Initializes `P(1..24)` from DATA.
- Sets `R=0` (reshow flag), `A=1` (player location), `C0=1` (candle lit).
Pseudo `GAME_START`:
- Same variable values and `OBJECT_LOCATION` loaded from `OBJECT_LOCATION_DATA`.

Verdict: **equivalent**.

### 2) Hostile auto-attack gate + darkness gate
msbasic line 6:
- `IF Z>0 AND Z<>5 AND M<>20 THEN 111` (attack if hostile, not bat, and not holding sword)
msbasic line 7:
- `IF A<18 OR C0=1 AND (P(21)=A OR P(21)=-1) THEN 10` (darkness gate)
Pseudo `DESCRIBE_CURRENT_LOCATION`:
- Same conditions using named variables.

Verdict: **equivalent**.

### 3) Room descriptions + post-description conditional prints
msbasic lines 10.. (room description ladder) plus:
- Dark cavern generic message condition matches pseudo’s condition set.
- Bridge snapped message: `(A=10 OR A=12) AND H=128`.
- Dragon corpse: `A=14 AND P(4)=0`.
- Drawbridge text: `A=48 AND D=49`.
- Candle dim/out thresholds: `U>200` and `U>=230` and `C0=0`.
Pseudo `PRINT_ROOM_DESCRIPTION`:
- Same conditions and messages (string spacing differences are formatting).

Verdict: **equivalent**.

### 4) Listing room objects/creatures and prompt
msbasic’s object/creature loops and headers correspond directly to pseudo `LIST_ROOM_OBJECTS_AND_CREATURES`.
Auto-attack after prompt matches: `IF Z>0 AND Z<>5 AND M<>20 THEN ...`.

Verdict: **equivalent**.

### 5) Input normalization + parse
msbasic lines 79..81:
- Reads `A0$`, rejects empty.
- Pads with spaces.
- Uppercase→lowercase loop.
Pseudo `GET_PLAYER_INPUT`:
- Same behavior (implemented as a loop in pseudo).

Verdict: **equivalent**.

### 6) Dynamic state updates during parse
msbasic lines 87..92:
- `IF A=11 THEN H=128` (bridge mid)
- `IF A=2 THEN J=1` (hut flag)
- `IF A=45 THEN W=43`, `IF A=35 THEN W=0` (water exit)
- `IF P(24)<>38 THEN G=39` (gate destination once grill moved)
- `IF A=49 THEN D=49` (drawbridge lowered)
Pseudo `PARSE_COMMAND_ENTRY`:
- Same updates (with named constants in later pseudo2, but pseudo.txt uses numeric IDs like msbasic).

Verdict: **equivalent**.

### 7) Movement handling
msbasic lines 115..123:
- Randomizes direction index `Q` only if `P(8) <> -1 AND P(8) <> A` (note: this uses **index 8**, not 9).
- Loads movement row by RESTORE+READ through room index.
- Applies `B=0` no-exit message; `B=128` death; else moves.
Pseudo `HANDLE_MOVEMENT_COMMAND`:
- Same logic, including the `OBJECT_LOCATION(8)` check (so it matches msbasic exactly).

Important note:
- If you believe the randomized-direction check “should” be tied to the bomb (which is object 9 elsewhere), msbasic itself uses `P(8)` here, and pseudo mirrors that. As far as this audit is concerned, pseudo is faithful to msbasic’s behavior.

Verdict: **equivalent**.

### 8) Non-movement commands (galar/ape/eh?/visibility)
msbasic lines 124..129:
- “galar” teleports to 16, `R=0`.
- “ape” sets `E=38`, prints message, returns to loop **without** explicit dynamic-exit patching.
- If `M<1` prints “eh?”.
- If not carried/visible prints “Where? I can’t see it.”
Pseudo `HANDLE_NON_MOVEMENT_COMMAND`:
- Same behavior and ordering (and also does not patch exits in this `pseudo.txt` version).

Verdict: **equivalent**.

### 9) GET/DROP and USE routing
msbasic lines 130..140:
- `get` counts carried and refuses if >10, else `P(M)=-1`.
- `drop` sets `P(M)=A`.
- USE routes by `ON M-18 GOTO 141,143,157,163`:
  - `M=19` key, `M=20` sword, `M=21` candle→bomb logic, `M=22` rope.
Pseudo `ROUTE_USE_BY_OBJECT`:
- Implements the same mapping via `SELECTED_USE_INDEX = CURRENT_OBJECT_INDEX - 18`.

Verdict: **equivalent**.

### 10) Key/sword/bomb/rope logic
msbasic lines 141..164 match pseudo blocks:
- Key allowed rooms, key drops, reshow reset, teleport target.
- Sword gating, miss threshold `RND*7+15 > F`, kill chance `.38`, message selection `INT(RND*4)`, corpse vaporize, wizard sword crumble sets `P(20)=35`.
- Bomb logic uses `P(9)` presence and candle lit `C0`.
- Rope only at balcony.

Verdict: **equivalent**.

### 11) Verb pattern routing and ranking
msbasic lines 166..173 implements the same verb mapping and default responses as pseudo `ROUTE_BY_VERB_PATTERN`.
Ranking thresholds and messages match pseudo `PRINT_RANKING_SUB`.

Verdict: **equivalent**.

## Conclusion

`docs/caverns/basic/pseudo.txt` is a faithful, label-structured rewrite of `docs/caverns/basic/msbasic.txt` with variable renaming and clearer control flow. All core gameplay conditions and state updates audited above match the msbasic source of truth.

