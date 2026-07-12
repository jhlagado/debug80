# TEC-1G Keyboard Owner Design

## Context

The TEC-1G webview has multiple hardware surfaces that can consume physical keyboard input:

- the front-panel hex keypad in the Machine panel
- the Matrix Keyboard accordion panel
- the Joystick accordion panel
- native controls such as text inputs, selects, memory/register editors, and serial input

The current behavior is partly accordion-driven and partly focus-driven. The keypad owns normal shortcut routing when the matrix keyboard is closed. The matrix keyboard has an explicit capture state, but opening the matrix panel suppresses keypad routing. The joystick can consume keys only when the joystick panel is open and the matrix keyboard panel is closed.

That means the user cannot keep both Matrix Keyboard and Joystick open and choose which hardware surface receives physical keyboard input.

## Goal

Introduce one explicit webview-level keyboard owner so physical key routing is predictable, visible, and controllable.

The supported owners are:

- `keypad`
- `matrixKeyboard`
- `joystick`
- `none`

Native editable controls temporarily bypass emulator routing regardless of owner.

## Routing Rules

Global key routing should use this order:

1. If the event target is a native editable/control surface, do not route to emulator hardware.
2. If owner is `matrixKeyboard`, route the key to the matrix keyboard controller.
3. If owner is `joystick`, route the key to the joystick controller.
4. If owner is `keypad`, route the key to the TEC keypad shortcut handler.
5. If owner is `none`, leave the event alone.

DOM focus may support accessibility and visual state, but routing should not rely on `document.activeElement` alone.

## Accordion Defaults

Accordion open/close state should choose a sensible default owner:

- Machine open, Matrix Keyboard closed, Joystick closed: owner becomes `keypad`.
- Matrix Keyboard opened: owner becomes `matrixKeyboard`.
- Joystick opened while Matrix Keyboard is closed: owner becomes `joystick`.
- Matrix Keyboard and Joystick both open: owner remains whichever of those two panels the user most recently selected.
- Closing the current owner falls back to the next visible candidate in this order: `matrixKeyboard`, `joystick`, `keypad`, `none`.
- While Matrix Keyboard is open, the front-panel hex keypad remains attached-disabled and cannot become keyboard owner.
- Closing Matrix Keyboard should release matrix capture state and any held matrix keys.
- Closing Joystick should release held joystick keys and clear latch state as it does today.

## User Intent Overrides

The user can change the owner by clicking inside a hardware panel:

- Clicking the Machine panel background or keypad sets owner to `keypad` only when Matrix Keyboard is closed.
- Clicking inside Matrix Keyboard sets owner to `matrixKeyboard`.
- Clicking inside Joystick sets owner to `joystick`.
- Clicking a native editable/control element keeps native focus and does not change owner unless the control is explicitly part of a hardware capture surface.

This lets the user keep Matrix Keyboard and Joystick open at the same time, then switch between typing into the matrix keyboard and playing a joystick-controlled game by clicking the relevant panel.

## Joystick Action Keys

Use a right-hand diamond for joystick action keys:

```text
    I
J       K
    M
```

Recommended mapping:

- `J`: Fire 1
- `I`: Fire 2
- `K`: Fire 3
- `M`: Aux
- `Space`: Fire 1 alias

Movement remains:

- `WASD`
- arrow keys

Visible joystick action layout should mirror the diamond:

```text
      Fire 2
Fire 1      Fire 3
       Aux
```

The existing visible `Comm2` label should become `Aux`. Hardware detail can remain in a tooltip such as `Aux / Pin 9`.

## UI Feedback

Each capture-capable surface should expose the active owner clearly:

- Keypad active
- Matrix keyboard captured
- Joystick controls active
- Click panel to capture keys

The cue should be small and functional, not explanatory prose. It should update when accordion state, pointer interaction, or owner state changes.

## Testing

Add focused tests for:

- owner default selection when opening and closing Matrix Keyboard and Joystick
- Matrix Keyboard and Joystick both open, with click-to-switch ownership
- native input targets bypassing emulator routing
- held keys being released when owner changes away from Matrix Keyboard or Joystick
- joystick `I/J/K/M/Space` mapping and `Comm2` to `Aux` UI label
