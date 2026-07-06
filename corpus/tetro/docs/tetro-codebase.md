# Tetro: a tour of the code

Tetro is a falling-block game for the TEC-1G single-board Z80 computer. It runs under MON-3, draws an 8x8 RGB LED matrix, scans a six-digit seven-segment Score display, writes an HD44780 LCD, reads the MON-3 keypad, and drives a speaker.

The important constraint is that there are no interrupts. The matrix is visible only because the CPU keeps scanning it. Sound and Score display only continue because the same loop keeps servicing them. Game logic has to fit around that hardware maintenance.

This tour follows the Tetro code as it now stands. The shared loop, scan tick, LCD, HUD, sound, and Framebuffer contracts are covered in [shared-codebase.md](shared-codebase.md).

---

## Source layout

The Debug80 target is still the top-level file:

```text
src/tetro/tetro.main.asm
```

That file owns the `ORG`, the reset entry, the main loop, and the include order. Debug80 can treat it as the Tetro target without needing to know how the internal files are arranged.

The current Tetro include order is:

```asm
.include "../shared/constants.asm"
.include "constants.asm"

Start:
    CALL    InitState

MainLoop:
    CALL    ScanFrame
    CALL    LogicTick
    JR      MainLoop

.include "geometry-helpers.asm"
.include "collision.asm"
.include "../shared/framebuffer-core.asm"
.include "../shared/framebuffer-draw.asm"
.include "render.asm"
.include "piece-active.asm"
.include "board-lock.asm"
.include "game-init.asm"
.include "../shared/scan-tick.asm"
.include "scan-frame.asm"
.include "../shared/sound.asm"
.include "sound.asm"
.include "../shared/hud.asm"
.include "hud.asm"
.include "../shared/lcd.asm"
.include "ui.asm"
.include "logic-dispatch.asm"
.include "input.asm"
.include "data.asm"
.include "ram.asm"
```

The include order is deliberate. `shared/scan-tick.asm` calls `SndService` and `HudScanDig` before their labels appear in the include stream. AZM resolves those forward references. The pattern keeps scanout generic while letting the program decide which sound and HUD services satisfy the calls.

The split is intentional. Files under `src/shared/` are generic hardware or buffer routines that can serve more than one game. Files under `src/tetro/` contain Tetro's rules, state, tables, and game-specific wrappers.

This is still a careful harmonisation, not a large engine abstraction. Shared files are the small, stable pieces: scan tick, LCD primitives, Score digit scanning, sound state machine, and Framebuffer core helpers. Tetro keeps its own rules, board representation, scoring events, piece data, and presentation choices.

---

## Runtime model

```asm
MainLoop:
    CALL    ScanFrame
    CALL    LogicTick
    JR      MainLoop
```

Those three instructions in `src/tetro/tetro.main.asm` are the whole runtime. `ScanFrame` emits all eight matrix rows with a fixed dwell delay per row, then blanks the row port. `LogicTick` runs while the matrix is blank and prepares the next frame.

Sound and the seven-segment Score display are serviced once per visible matrix row through `ScanTick`, which `ScanFrame` calls internally. Game logic no longer determines visible row dwell time.

---

## Logic dispatch

`LogicTick` lives in `tetro/logic-dispatch.asm`. It starts by sanitizing the active piece position, then chooses the highest-priority game mode.

The priority is:

1. Game over.
2. Splash.
3. Line-clear hold.
4. Pause.
5. Input lockout.
6. Active play.

The order is part of the design. During game over, only restart gating matters. During a line-clear hold, the active piece is disabled and the next spawn waits. During input lockout, the key that dismissed the splash or restarted the game is not allowed to become a gameplay move.

Active play is now a frame-time update rather than an eight-slice raster update. `ScanFrame` has already displayed the whole matrix and blanked the row port before `LogicTick` runs. The active path polls input, applies gravity, then rebuilds the whole framebuffer with `RebuildFb` for the next visible frame.

This intentionally moves variable work such as collision checks, locks, row clears, score updates, LCD updates, and full framebuffer copy into the blanking interval. The visible rows get their brightness from the fixed scan dwell delay, not from game computation time.
---

## RAM layout

Tetro's mutable state is in `tetro/ram.asm`.

The RAM file is arranged around the systems that mutate it:

- active-piece state
- pending movement and rotation state
- input repeat state
- pause, splash, game-over, and line-clear flags
- Score and line counters
- HUD and speaker state
- frame counter
- scan state and framebuffers
- landed board occupancy and colour planes

The active piece state includes:

- `PlayerX`, `PlayerY`
- `CurPiecePtr`
- `CurPieceIndex`
- `CurrentRotation`
- `CurPieceRight`
- `CurPieceColor`
- `ActPieceEnabled`

The pending fields are a small transaction buffer:

- `PendingX`
- `PendingY`
- `PendingRotation`
- `ShiftCount`

Movement and rotation write candidates into pending state, run collision, and commit only if the placement is legal. That keeps failed moves invisible.

The board is split into four planes:

- `BoardRows` is the occupancy plane.
- `BoardRed`, `BoardGreen`, and `BoardBlue` are colour planes.

Collision reads only `BoardRows`. Rendering reads colour planes directly. This avoids unpacking colour data during collision and avoids reconstructing colour during rendering.

The Framebuffer is double-buffered:

- `FramebufferBack` is composed during the blanking interval.
- `Framebuffer` is read by `ScanFrame` through `ScanTick`.

Both buffers are 32 bytes: eight rows, four bytes per row. The first three bytes are red, green, and blue. The fourth byte is padding.

The shared scanout does not know what these bytes represent as game state. It only emits the front buffer. Tetro owns the meaning of the board planes and active-piece state that produce those bytes.

---

## Initialization and restart

`tetro/game-init.asm` owns startup and restart.

`InitState` calls `InitStateBase`, enables the splash state, shows the splash LCD script, and rebuilds the Framebuffer.

`InitStateBase` resets Tetro state: movement cooldown, gravity period, game-over flags, clear flags, Score, LCD/HUD scan state, sound state, scan mask, scan pointer, board planes, and Score digits.

The splash screen is not idle. The main loop keeps scanning the matrix, servicing sound, scanning the Score display, and incrementing `FramePhase` once per full matrix wrap. When the player presses a key, `SplashState` uses `FramePhase` as `RngSeed`. If the key arrives before any wrap, it falls back to `RngSeedInit`.

`InitRestart` is the post-game-over path. It clears the board and Score but does not reset the RNG seed. A restart continues the pseudo-random stream instead of returning to the same first pieces.

---

## Collision

`tetro/collision.asm` provides the placement test used by spawn, movement, rotation, gravity, and lock.

`CheckCollAtDe` takes:

```text
D = candidate x
E = candidate y
```

It returns carry set if the placement is illegal.

The routine first checks horizontal bounds. `CurPieceRight` lets it test the right edge without scanning the bitmap. If the piece is outside the left or right wall, it returns immediately.

If the horizontal bounds pass, it walks the four rows of the current piece bitmap. Each bitmap row is shifted by `ShiftRowMask` using the candidate x. Empty rows are skipped. Rows above the visible field are allowed, because pieces spawn partly above the display. Rows below the field are collisions.

For visible rows, the shifted mask is ANDed with the matching row in `BoardRows`. A non-zero result means the active piece overlaps a landed cell.

`CheckTopOut` is separate. It detects the loss condition where a piece locks while any occupied bitmap row is still above the visible field.

---

## Movement, gravity, and rotation

`tetro/piece-active.asm` owns active-piece movement, rotation, gravity, spawning, and random piece selection.

Every movement uses the same pattern:

```text
write candidate position
call CheckCollAtDe
commit only if carry is clear
```

`MoveLeft` and `MoveRight` update `PendingX` and call `HorizProbeX`. That helper copies the current y into `PendingY`, tests collision, and commits the candidate x only on success.

Held horizontal movement reloads from `MovePeriod`, which is intentionally slow so repeat acts as a fallback while deliberate taps remain the responsive control path.

`StepActDown` is shared by gravity and soft drop. `ApplyGravity` waits for `GravityCooldown` to expire, then probes one row down. If the probe fails, it calls `LockActPiece`. `SoftDrop` skips the cooldown and probes immediately. If soft drop locks a piece, it sets `DropLockout` so a held drop key does not immediately force the next piece down.

Rotation changes the bitmap, not the position. `RotateCw` and `RotateLeft` save the previous rotation, load the candidate rotation state, then test collision at the current position. If the test fails, the old rotation and metadata are restored. There is no wall kick. On success, Tetro plays the rotate sound and resets the gravity cooldown.

`RngNext8` is an 8-bit shift-register generator. `RngNextPiece` folds higher bits into lower bits, masks to three bits, and retries when the value is 7. That gives piece indices 0 through 6.

---

## Lock, line clear, and Score

`tetro/board-lock.asm` owns the transition from active piece to board.

`LockActPiece` first calls `CheckTopOut`. If the active piece is still partly above the visible field, Tetro merges it into the board and enters game over.

Otherwise, `MergeActBoard` writes the shifted active piece into `BoardRows` and into the colour planes selected by `CurPieceColor`. It uses the same `ShiftRowMask` routine as collision and rendering, so the cells that collide, draw, and merge are the same cells.

`CheckFullRows` scans `BoardRows` for `0xFF`. Full rows are recorded in `ClearMask`.

If no row is full, Tetro plays the lock sound and immediately spawns the next piece.

If one or more rows are full, Tetro plays the clear sound, sets `ClearPending`, loads `ClearTimer`, and disables the active piece. Rendering draws rows in `ClearMask` as white while the timer counts down. When the timer expires, `CollapseRows` removes the rows, `ApplyClearScore` updates Score and gravity speed, and the next piece spawns.

The Score table is data-driven:

```text
1 row  = 100
2 rows = 300
3 rows = 500
4+ rows = 800
```

When the Score reaches the configured threshold, `CurGravPeriod` changes from `GravityPeriod` to `GravPeriodStep1`.

---

## Rendering

Rendering is split between shared buffer helpers, shared draw primitives, and Tetro-specific drawing.

`shared/framebuffer-core.asm` provides:

- `FbClearAll`
- `FbClearRow`
- `FbCopyRow`
- `FbCopyAll`

Those routines know only about the 8x8 RGB Framebuffer layout.

`shared/framebuffer-draw.asm` provides game-neutral RGB draw primitives:

- `MxMask`
- `FbSetCell`
- `FbOrRow`

`tetro/render.asm` contains Tetro-aware rendering:

- `RebuildFb`
- `ClearBoard`
- `RendBoardBack`
- `RendActBack`

`RendBoardBack` copies landed colour planes into the back buffer. During a line-clear hold, rows in `ClearMask` become white. During game over, occupied cells are rendered as a red silhouette.

`RendActBack` draws the falling piece on top. It shifts each bitmap row by `PlayerX`, skips rows outside the visible field, and calls `FbOrRow` to OR the row mask into the selected colour channels.

The active piece is rendered after the board. Collision has already ensured it does not overlap landed cells, so the OR operation is safe.

---

## LCD, HUD, and sound

The LCD stack is split into shared primitives and Tetro screens.

`shared/lcd.asm` knows how to talk to the HD44780, execute a simple script table, write a string at a row command, and append a table-indexed character. A script is a list of row-command bytes and string pointers, terminated by zero.

Tetro screen scripts live in `tetro/data.asm`:

- splash
- running
- Paused
- game over

`tetro/ui.asm` selects those scripts. Running and Paused screens go through `LcdShowHud`, which uses the shared LCD primitives to append the next-piece letter after the `NEXT: ` label. `LcdRefNextPrev` updates only that preview row after a successful spawn.

The seven-segment path is split the same way. `shared/hud.asm` scans one digit per `ScanTick` and owns the shared decimal formatter. `tetro/hud.asm` wraps that formatter for Tetro's Score variable and updates `HudSegBuffer` when the Score changes.

The sound path follows the same pattern. `shared/sound.asm` runs the speaker state machine. `tetro/sound.asm` names the Tetro events and loads their tuning constants.

---

## Shared versus Tetro-specific code

Currently shared and generic:

- `shared/constants.asm`: hardware ports, MON-3 keys, colours, dimensions
- `shared/scan-tick.asm`: matrix scanout and scan-state advance
- `shared/framebuffer-core.asm`: back-buffer clear and copy
- `shared/framebuffer-draw.asm`: matrix x-to-mask conversion and RGB Framebuffer draw primitives
- `shared/sound.asm`: speaker divider service
- `shared/hud.asm`: seven-segment scan, blanking, digit/glyph tables, and decimal formatting
- `shared/lcd.asm`: HD44780 primitive operations, script renderer, row string writer, and table-character writer

Currently Tetro-specific:

- `tetro/constants.asm`: movement, gravity, scoring, spawn, and sound tuning
- `tetro/game-init.asm`: cold Start, restart, and state initialization
- `tetro/logic-dispatch.asm`: Tetro state priority and frame-time update
- `tetro/piece-active.asm`: movement, gravity, rotation, RNG, and spawn
- `tetro/collision.asm`: active-piece placement and top-out checks
- `tetro/board-lock.asm`: merge, line clear, scoring, and game-over entry
- `tetro/geometry-helpers.asm`: pending-position and row-mask helpers
- `tetro/render.asm`: board and active-piece rendering
- `tetro/input.asm`: Tetro keypad mapping, repeat handling, pause, Start, and restart gates
- `tetro/sound.asm`: Tetro sound event wrappers
- `tetro/hud.asm`: Tetro Score display wrapper for the shared HUD formatter
- `tetro/ui.asm`: Tetro LCD screens and next-piece preview
- `tetro/data.asm`: pieces, colours, LCD scripts, Score tables, and preview letters
- `tetro/ram.asm`: Tetro state layout

Tetro now uses shared HUD formatting, LCD row/table primitives, and Framebuffer draw primitives. The game still owns its input meanings, board rendering, active-piece rendering, scoring events, and LCD screen choices.

---

## Data tables

`tetro/data.asm` contains display tables and piece data.

Most static Tetro data lives here: piece bitmaps, rotation lookup tables, colour tables, LCD text, LCD scripts, Score values, and row masks.

The piece tables are parallel:

- `PiecePtrTable` points to the 4-row bitmap for each piece and rotation.
- `PieceRightTbl` stores the rightmost occupied column for bounds checks.
- `PieceColorTbl` stores the RGB colour mask for each piece.

Each bitmap row is an 8-bit mask. The occupied cells are in the high bits before shifting, and `ShiftRowMask` moves them into the board position at runtime.

The same file also contains:

- row bit masks
- line-clear Score values
- LCD strings
- LCD script tables
- piece preview letters

Changing a message, Score value, colour, piece bitmap, preview letter, or LCD screen is usually a data edit rather than a logic edit.

---

## A piece from spawn to lock

On boot, `InitState` clears Tetro state, shows the splash, and rebuilds the Framebuffer. The main loop starts immediately. `ScanFrame` keeps the matrix alive with fixed row dwell, keeps Score digits blank, services sound, and advances the frame counter.

When the player presses a key on the splash screen, `SplashState` seeds the RNG, generates the first next-piece index, sets `InputLockout`, spawns the first active piece, initializes the Score display, shows the running LCD screen, and rebuilds the Framebuffer.

`SpawnActPiece` promotes `NextPieceIndex` to `CurPieceIndex`, generates a new upcoming piece, sets the spawn position, resets movement and gravity cooldowns, and tests collision at the spawn point. If spawn collides immediately, Tetro enters game over.

During play, each frame polls input during the blanking interval. The keypad mapping is handled locally in `tetro/input.asm`; that file calls Tetro movement and rotation routines directly. Left and right key codes stay as MON-3 hardware constants, while the movement handlers define what action each key performs for the current matrix orientation:

```asm
KeyLeft:         EQU     0x11
KeyRight:        EQU     0x10
```

Tetro also accepts an inverted-T numeric layout: `1` moves left, `3` moves right, `2` soft-drops, and `6` rotates clockwise. These aliases route through the same handlers as the dedicated movement, drop, and rotate keys.

Slice 1 applies gravity. If the downward probe succeeds, the piece moves down. If it fails, `LockActPiece` merges or ends the game.

Slices 2 through 6 clear rows of the back buffer. Slice 7 finishes the clear, renders board and active piece, and copies the back buffer to the live Framebuffer.

When a piece locks, Tetro checks top-out, merges into the board, checks full rows, and either spawns immediately or enters the line-clear hold. Completed rows flash white, collapse, update the Score, and then the next piece spawns.

Game over leaves the loop running. The matrix, Score display, LCD, and speaker are still serviced. After the key gate expires, a new key press calls `InitRestart`.

---

## Map

```text
target
  src/tetro/tetro.main.asm
    ORG, Start, MainLoop, include order

shared hardware helpers
  shared/scan-tick.asm
    ScanTick -> SndService, HudScanDig, ScanNext
  tetro/scan-frame.asm
    ScanFrame, fixed row dwell, inter-frame blanking
  shared/sound.asm
    SndStart, SndService
  shared/hud.asm
    HudScanDig, HudBlankDig
  shared/lcd.asm
    LcdBusy, LcdCmd, LcdString, LcdScript, LcdPutc, LcdRowStr, LcdPutcTbl
  shared/framebuffer-core.asm
    FbClearAll, FbClearRow, FbCopyRow, FbCopyAll
  shared/framebuffer-draw.asm
    MxMask, FbSetCell, FbOrRow

Tetro wrappers and presentation
  tetro/sound.asm
    SndTrigRotate, LOCK, CLEAR, GameOver
  tetro/hud.asm
    UpdScoreDisplay
  tetro/ui.asm
    LcdShowSplash, RUNNING, Paused, GameOver, NEXT preview
  tetro/input.asm
    keypad mapping, repeat handling, pause/Start/restart gates

Tetro rules
  tetro/constants.asm
    movement, gravity, scoring, spawn, and sound tuning
  tetro/game-init.asm
    cold Start, restart, and state initialization
  tetro/logic-dispatch.asm
    LogicTick frame-time dispatcher
  tetro/piece-active.asm
    movement, gravity, rotation, RNG, spawn
  tetro/collision.asm
    CheckCollAtDe, CheckTopOut
  tetro/board-lock.asm
    lock, merge, line clear, Score, game over
  tetro/geometry-helpers.asm
    pending-position loading and row-mask shifting
  tetro/render.asm
    Tetro board/active rendering over shared Framebuffer core

state and data
  tetro/ram.asm
    all mutable Tetro state
  tetro/data.asm
    pieces, colours, Score table, LCD scripts, preview letters
```
