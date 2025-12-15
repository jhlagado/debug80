# CAVERNS Declarative Rule Engine

## Assembler-Friendly Specification

This document defines a **flat, table-driven game engine model** suitable for implementation in assembler (Z80-class or similar).

The goal is to convert the existing BASIC implementation of *CAVERNS* into **data tables plus a small interpreter**, moving control flow out of game data and into a tiny, fixed interpreter.

This spec is intentionally **not Turing-complete**.

---

## 1. Design Goals

1. **Assembler-friendly**

   * No recursion
   * No trees
   * No dynamic allocation
   * Linear memory access only

2. **Declarative**

   * Game behaviour is described by tables
   * Control flow is replaced by *selection via guards*

3. **Deterministic**

   * Ordered rule evaluation
   * First matching rule wins

4. **Minimal interpreter**

   * Linear guard evaluation (fixed-arity records)
   * Short-circuit evaluation (fail-fast / pass-fast)
   * No expression parsing

---

## 2. Core Runtime State

All runtime state must be representable as **flat arrays or scalar variables**.

### 2.1 Player State

| Name              | Type | Description                  |
| ----------------- | ---- | ---------------------------- |
| `PLAYER_LOCATION` | byte | Current room ID              |
| `TURN_COUNTER`    | word | Incremented once per command |
| `PLAYER_ALIVE`    | byte | 1 = alive, 0 = dead          |

---

### 2.2 Entity State

Entities include **creatures and objects**.
Indices match the original BASIC program.

| Range  | Meaning   |
| ------ | --------- |
| `1–6`  | Creatures |
| `7–24` | Objects   |

#### Arrays

| Array               | Type | Meaning                                             |
| ------------------- | ---- | --------------------------------------------------- |
| `ENTITY_LOCATION[]` | byte | Room ID, or `0xFF` if carried, or `0x00` if removed |
| `ENTITY_FLAGS[]`    | byte | Bit flags (optional extension)                      |

---

### 2.3 Flags / Variables

Flags are stored as **indexed byte values**.

Examples:

| Flag                          | Meaning                    |
| ----------------------------- | -------------------------- |
| `FLAG_CANDLE_LIT`             | 1 if candle lit            |
| `FLAG_BRIDGE_CONDITION`       | 0 = intact, `0x80` = fatal |
| `FLAG_DRAWBRIDGE_STATE`       | Room ID or 0               |
| `FLAG_HOSTILE_CREATURE_INDEX` | 0 or entity ID             |

All flags are accessed by **index**, not name, at runtime.

---

## 3. Phases

Rules are evaluated in **phases**.
Each phase has its own ordered rule list.

Minimum required phases:

| Phase ID           | Name       | Purpose                                |
| ------------------ | ---------- | -------------------------------------- |
| `PHASE_DESCRIBE`   | Describe   | Decide what text to print for location |
| `PHASE_ON_ENTER`   | On Enter   | Immediate effects after movement       |
| `PHASE_ON_COMMAND` | On Command | Player verb handling                   |

---

## 4. Rules

A rule consists of:

1. Phase
2. Guard list
3. Action routine

### 4.1 Rule Record Layout

Fixed width, assembler-friendly:

```
RULE:
  DB phaseId
  DW guardListPtr
  DW actionPtr
```

Rules are evaluated **in table order**.

**First matching rule executes its action and terminates the phase.**

---

## 5. Guard Lists (Conditional Logic)

### 5.1 Model

* A guard list is a **linear sequence of fixed-arity guard records**
* Each guard consumes **exactly two operand bytes** (unused operands are ignored)
* Boolean composition is handled by a small **AND/OR state machine**
* Negation is supported (see Appendix B for the encoding)
* Evaluation is short-circuiting (can stop early on FAIL or PASS)

---

### 5.2 Guard List Format

```
[ opcode ][ opA ][ opB ] … [ G_END ][ 0 ][ 0 ]
```

---

### 5.3 Guard Opcodes (Minimum Set)

#### Player location

| Opcode      | Operand A | Operand B | Passes if                 |
| ----------- | --------- | --------- | ------------------------- |
| `G_AT`      | room      | unused    | `PLAYER_LOCATION == room` |
| `G_NOT_AT`  | room      | unused    | `PLAYER_LOCATION != room` |
| `G_ROOM_LT` | room      | unused    | `PLAYER_LOCATION < room`  |
| `G_ROOM_GT` | room      | unused    | `PLAYER_LOCATION > room`  |

---

#### Flags

| Opcode      | Operand A | Operand B | Passes if              |
| ----------- | --------- | --------- | ---------------------- |
| `G_FLAG_EQ` | flag      | value     | `FLAGS[flag] == value` |
| `G_FLAG_NE` | flag      | value     | `FLAGS[flag] != value` |

---

#### Entities

| Opcode            | Operand A | Operand B | Passes if                                 |
| ----------------- | --------- | --------- | ----------------------------------------- |
| `G_ENT_AT_ROOM`   | ent       | room      | `ENTITY_LOCATION[ent] == room`            |
| `G_ENT_AT_PLAYER` | ent       | unused    | `ENTITY_LOCATION[ent] == PLAYER_LOCATION` |
| `G_ENT_CARRIED`   | ent       | unused    | `ENTITY_LOCATION[ent] == 0xFF`            |
| `G_ENT_VISIBLE`   | ent       | unused    | carried OR at player location             |
| `G_ENT_VISIBLE_CURRENT` | flag | unused    | carried OR at player location, where `ent = FLAGS[flag]` |

---

#### Hostile creature

| Opcode              | Operand A | Operand B | Passes if                          |
| ------------------- | --------- | --------- | ---------------------------------- |
| `G_HOSTILE_PRESENT` | unused    | unused    | `FLAG_HOSTILE_CREATURE_INDEX != 0` |
| `G_HOSTILE_EQ`      | ent       | unused    | hostile creature index == ent      |

---

#### Terminator

| Opcode  | Operand A | Operand B | Meaning           |
| ------- | --------- | --------- | ----------------- |
| `G_END` | unused    | unused    | End of guard list |

---

## 6. Actions

Actions are **assembler routines** invoked by rules.

Actions perform side effects only; no conditions.

### 6.1 Required Action Categories

#### Output

* `ACT_PRINT_ROOM_DESCRIPTION`
* `ACT_PRINT_DARKNESS_MESSAGE`
* `ACT_PRINT_TEXT(ptr)`

#### Player

* `ACT_MOVE_PLAYER(room)`
* `ACT_KILL_PLAYER`

#### Entity

* `ACT_ADD_TO_INVENTORY(ent)`
* `ACT_DROP_ENTITY(ent)`
* `ACT_REMOVE_ENTITY(ent)`

#### Flags

* `ACT_SET_FLAG(flag, value)`
* `ACT_INC_FLAG(flag)`

#### Game-specific

* `ACT_SWORD_COMBAT`
* `ACT_BRIDGE_COLLAPSE_ON_MID`

Actions may reference:

* `PLAYER_LOCATION`
* `ENTITY_LOCATION[]`
* `FLAGS[]`

Actions **must not** invoke rules, re-enter the interpreter, or cause recursion.

---

## 7. Rule Duplication (Simple Control Flow)

The simplest way to express “OR” at the *rule* level is to use **multiple rules** with different guards.

Appendix B also defines in-list `G_OR`/`G_AND` control guards and a NOT modifier bit; use those only when it materially reduces duplicated tables.

### Example: Darkness Logic

Original logic (conceptual):

```
room < DARK_CAVERN
OR
(candle lit AND candle visible)
```

Converted to rules:

#### Rule 1 — bright by room

```
PHASE_DESCRIBE
GUARDS: G_ROOM_LT DARK_CAVERN_A
ACTION: ACT_PRINT_ROOM_DESCRIPTION
```

#### Rule 2 — bright by candle (carried)

```
PHASE_DESCRIBE
GUARDS:
  G_FLAG_EQ FLAG_CANDLE_LIT 1
  G_ENT_CARRIED OBJ_CANDLE
ACTION: ACT_PRINT_ROOM_DESCRIPTION
```

#### Rule 3 — bright by candle (present)

```
PHASE_DESCRIBE
GUARDS:
  G_FLAG_EQ FLAG_CANDLE_LIT 1
  G_ENT_AT_PLAYER OBJ_CANDLE
ACTION: ACT_PRINT_ROOM_DESCRIPTION
```

#### Rule 4 — fallback

```
PHASE_DESCRIBE
GUARDS: G_END
ACTION: ACT_PRINT_DARKNESS_MESSAGE
```

---

## 8. Movement and Conditional Exits

Two valid approaches:

### 8.1 Minimal (compatible with existing BASIC)

* Keep `MOVEMENT_TABLE[room][dir]`
* Patch values via actions (`ACT_BRIDGE_COLLAPSE_ON_MID`, etc.)

### 8.2 Fully Declarative (preferred)

Use **exit records** evaluated with guards.

#### Exit Record

```
EXIT:
  DB fromRoom
  DB direction
  DB kind        ; 0 = normal, 1 = fatal
  DB toRoom
  DW guardPtr
```

Movement resolution:

1. Scan exits matching `(fromRoom, direction)`
2. First passing guard wins
3. Fatal exits kill player

---

## 9. Sword Combat (Game-Specific Action)

Sword combat is implemented as a **single action routine** invoked by rules.

### Guards

#### No hostile

```
G_FLAG_EQ FLAG_CURRENT_VERB VERB_USE
G_FLAG_EQ FLAG_CURRENT_OBJECT OBJ_SWORD
G_FLAG_EQ FLAG_HOSTILE_CREATURE_INDEX 0
```

→ `ACT_PRINT_NOTHING_TO_KILL`

#### Hostile present

```
G_FLAG_EQ FLAG_CURRENT_VERB VERB_USE
G_FLAG_EQ FLAG_CURRENT_OBJECT OBJ_SWORD
G_FLAG_NE FLAG_HOSTILE_CREATURE_INDEX 0
```

→ `ACT_SWORD_COMBAT`

### Combat behaviour (inside action)

* Increment `SWORD_SWING_COUNT`
* Random chance to kill player
* Random chance to kill enemy
* Special cases (wizard sword crumble)

This logic remains **imperative**, but is isolated and reusable.

---

## 10. Interpreter Algorithm (Pseudo)

```
for rule in RULE_TABLE:
  if rule.phase != currentPhase: continue
  if evaluate_guards(rule.guardPtr):
    call rule.actionPtr
    return
```

Guard evaluation:

```
ptr = guardPtr
loop:
  read guard record (opcode, opA, opB)
  if opcode == G_END: return current_result
  update boolean mode and accumulator (Appendix B)
```

---

## 11. Explicit Non-Goals

This system deliberately does **not** support:

* Nested conditionals
* Loops in data
* Expression trees
* User-defined functions
* Script evaluation

This is a **selection engine**, not a programming language.

---

## 12. Conversion Instructions (for AI / Tooling)

To convert the existing BASIC code:

1. **Identify phases**

   * Describe logic → `PHASE_DESCRIBE`
   * Entry effects → `PHASE_ON_ENTER`
   * Command handling → `PHASE_ON_COMMAND`

2. **Replace IF/GOTO**

   * Convert each conditional path into a rule
   * Duplicate rules instead of OR logic

3. **Replace procedural checks**

   * Convert checks into guard lists
   * Convert side-effects into action routines

4. **Preserve data**

   * Keep room IDs, entity IDs, flags identical
   * Reuse existing movement tables and text

---

## 13. Final Characterisation

> This engine is a **finite, ordered, rule-selection machine**
> with **flat conditional guards** and **imperative effects**.

It is intentionally small, predictable, and perfectly aligned with assembler constraints.


# Appendix: Data Parsing and Interpretation Details

This appendix provides a comprehensive explanation of how the interpreter parses, navigates, and understands the data tables defined in the CAVERNS rule engine. These details supplement the main specification by explaining the underlying principles and methods used to handle fixed-width records, terminators, and overall data-driven navigation.

## Fixed-Width Records and Data Structures

In the CAVERNS engine, all rule and action data is organized into fixed-width records. Each record—whether it represents a rule, a guard, or an action—has a consistent size in memory. This means that the interpreter can navigate through records by simply advancing a known number of bytes. For example, each rule record is always five bytes: one byte for the phase ID, two bytes for the pointer to the guard list, and two bytes for the pointer to the action. Because of this consistent sizing, the interpreter can move from one rule to the next by incrementing its pointer by the fixed size of a rule record.

This fixed-width approach removes the need for length metadata. The interpreter never has to read a length field or count items in advance. It simply steps forward by the known record size.

## Guard Lists and Terminators

For guard lists, the interpreter uses a terminator opcode (`G_END`) to determine the end of the list. Each guard list is a sequence of guard opcodes followed by their arguments, and it continues until the interpreter encounters the `G_END` opcode. This opcode acts as a sentinel, signaling that the list is complete. The interpreter reads each guard and its arguments one by one until it reaches the terminator, at which point it stops processing that list and moves on to the next piece of data.

This method ensures that guard lists can vary in length without needing any length metadata. The `G_END` opcode is the only signal the interpreter needs to know when to stop reading the list.

## How the Interpreter Navigates Data

The interpreter works by maintaining a pointer that advances through memory. For rule records, the interpreter increments its pointer by the fixed size of a rule record after processing each rule. For guard lists, it reads each guard opcode and its arguments in sequence until it finds the `G_END` opcode, at which point it knows that the current list is complete.

In other words, the interpreter never has to guess how many items are in a list or how long a record is. It always knows the size of the records and relies on end markers for lists. This makes the system simple, predictable, and perfectly suited to an assembler environment.

## Summary of Changes and Additions

This appendix adds a detailed explanation of how the interpreter uses fixed-width records and terminators to navigate the data tables. It clarifies that every record is a known, consistent size and that guard lists are read until a `G_END` opcode is found. These additions do not change the core specification, but they make the data encoding rules explicit so the interpreter can stay simple and predictable.

# Appendix B: Guard Encoding, Boolean Semantics, and Interpreter Mechanics

This appendix formally specifies how conditional logic is represented, encoded, and evaluated in the CAVERNS declarative rule engine.

It is normative. Where it differs from earlier sections, this appendix takes precedence.

---

## B.1 Design Constraints Recap

The conditional system is constrained by the following hard requirements:

- Assembler-first implementation (Z80-class machines)
- No recursion
- No expression trees
- No variable-arity instructions
- No dynamic memory
- No interpreter-side allocation
- Preference for duplicated data over interpreter complexity

As a result, **all guards have fixed arity**, and **Boolean composition is linear and stateful**.

---

## B.2 Fundamental Model

### Terminology

- **Rule**  
  A fixed-width record: `(phase, guard-list pointer, action pointer)`

- **Guard list**  
  A variable-length *sequence of guards*, terminated by `G_END`

- **Guard**  
  A single Boolean test with:
  - one opcode byte
  - exactly two operand bytes

- **Action**  
  A subroutine invoked when a rule’s guards succeed

---

## B.3 Guard Anatomy (Fixed Arity)

### B.3.1 Guard Encoding

Every guard occupies **exactly 3 bytes**:

```

BYTE 0: opcode
BYTE 1: operand A
BYTE 2: operand B

```

This is true for **all guards**, without exception.

- Unary guards ignore operand B
- Constant guards ignore both operands
- Binary guards use both operands

There is **no variable arity**.

---

### B.3.2 Opcode Layout

The opcode byte is structured as follows:

```

bit 7   bit 6..0

---

NOT     guard opcode

```

- **Bit 7 (0x80)** — NOT modifier  
  If set, the Boolean result of the guard is inverted.

- **Bits 0–6** — Guard opcode (0–127)

This allows:
- `G_AT` and `NOT G_AT`
- `G_FLAG_EQ` and `NOT G_FLAG_EQ`
- without duplicating opcode space

---

## B.4 Boolean Evaluation Semantics

### B.4.1 Guard List Evaluation

A guard list is evaluated **linearly**, from first guard to `G_END`.

The interpreter maintains a single Boolean accumulator:

```

current_result

```

and a single Boolean mode flag:

```

boolean_mode ∈ {AND, OR}

```

---

### B.4.2 Initial State

At the start of guard list evaluation:

```

boolean_mode = AND
current_result = TRUE

```

This choice ensures that an empty guard list (`G_END` immediately) always succeeds.

---

## B.5 AND / OR State Machine

### B.5.1 Boolean Mode Guards

Two special guards modify the Boolean evaluation mode.

They still follow the fixed-arity rule.

| Guard | Meaning |
|----|----|
| `G_AND` | Switch evaluation mode to AND |
| `G_OR`  | Switch evaluation mode to OR |

Operands are ignored.

Encoding example:

```

DB G_OR, 0, 0

```

---

### B.5.2 Evaluation Algorithm

For each guard in the list:

1. If opcode is `G_AND` or `G_OR`
   - update `boolean_mode`
   - continue to next guard

2. Otherwise:
   - evaluate the guard’s predicate → `guard_result`
   - if NOT bit set: `guard_result = !guard_result`

3. Combine with accumulator:

```

if boolean_mode == AND:
current_result = current_result AND guard_result
if current_result == FALSE:
FAIL immediately
else if boolean_mode == OR:
current_result = current_result OR guard_result
if current_result == TRUE:
PASS immediately

```

4. Continue until `G_END`

---

### B.5.3 End-of-List Result

When `G_END` is encountered:

- If evaluation has not terminated early:
  - result is `current_result`
- PASS if `TRUE`, FAIL if `FALSE`

---

## B.6 Why This Is Not Recursive (and Why That’s OK)

This system:

- does **not** build expression trees
- does **not** recurse into sub-guards
- does **not** allocate stacks

Despite this, it can express:

- pure AND chains
- pure OR chains
- mixed AND/OR sequences
- NOT applied to any atomic predicate

Example:

```

(A AND B) OR (C AND NOT D)

```

Encoded linearly as:

```

A
B
G_OR
C
NOT D
G_END

```

This works because:
- AND is dominant until switched
- OR short-circuits on success
- AND short-circuits on failure

---

## B.7 Guard Opcode Set (Revised)

All guards consume **two operands**, even if unused.

### Player location

| Opcode | Operand A | Operand B | Meaning |
|----|----|----|----|
| `G_AT` | room | unused | player at room |
| `G_NOT_AT` | room | unused | player not at room |
| `G_ROOM_LT` | room | unused | location < room |
| `G_ROOM_GT` | room | unused | location > room |

---

### Flags

| Opcode | Operand A | Operand B | Meaning |
|----|----|----|----|
| `G_FLAG_EQ` | flag | value | flag == value |
| `G_FLAG_NE` | flag | value | flag != value |

---

### Entities

| Opcode | Operand A | Operand B | Meaning |
|----|----|----|----|
| `G_ENT_AT_ROOM` | ent | room | entity at room |
| `G_ENT_AT_PLAYER` | ent | unused | entity at player |
| `G_ENT_CARRIED` | ent | unused | entity carried |
| `G_ENT_VISIBLE` | ent | unused | carried or at player |
| `G_ENT_VISIBLE_CURRENT` | flag | unused | visible where `ent = FLAGS[flag]` |

---

### Hostile creature

| Opcode | Operand A | Operand B | Meaning |
|----|----|----|----|
| `G_HOSTILE_PRESENT` | unused | unused | hostile exists |
| `G_HOSTILE_EQ` | ent | unused | hostile == ent |

---

### Boolean control

| Opcode | Operand A | Operand B | Meaning |
|----|----|----|----|
| `G_AND` | unused | unused | switch to AND |
| `G_OR`  | unused | unused | switch to OR |
| `G_END` | unused | unused | end of list |

---

## B.8 Parsing Guarantees

The interpreter relies on **only three invariants**:

1. Every guard is exactly 3 bytes
2. Guard lists terminate with `G_END`
3. Rules are fixed-width records

As a result:

- No length metadata is required
- No external structure tables are required
- Parsing is single-pass, forward-only

---

## B.9 Interpreter Pseudocode (Final)

```

boolean_mode = AND
current_result = TRUE
ptr = guard_list_ptr

loop:
opcode, a, b = read_guard(ptr)
ptr += 3

```
if opcode == G_END:
    return current_result

if opcode == G_AND:
    boolean_mode = AND
    continue

if opcode == G_OR:
    boolean_mode = OR
    continue

negate = opcode & 0x80
opcode = opcode & 0x7F

guard_result = evaluate(opcode, a, b)

if negate:
    guard_result = !guard_result

if boolean_mode == AND:
    if !guard_result:
        return FAIL
else:  # OR
    if guard_result:
        return PASS
```

```

---

## B.10 Explicit Changes vs Earlier Specification

This appendix introduces **clarifications and constraints**, not conceptual changes:

### Clarified / tightened
- Guard arity is **fixed at 2 operands**
- Boolean composition is **stateful AND/OR**, not implicit AND-only
- NOT is implemented via **opcode high bit**, not separate guards

### No changes to
- Rule structure
- Phase model
- Action semantics
- Non–Turing completeness guarantee

The earlier document remains valid, but this appendix **fully specifies** the guard system.

---

## B.11 Design Philosophy (Restated)

This system prefers:

> duplicated data  
> over interpreter cleverness  

> linear evaluation  
> over structural expressiveness  

This is intentional and aligned with assembler realities.
