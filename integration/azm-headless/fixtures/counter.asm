.org $4000

Start:
    ld a,(Counter)
    inc a
    ld (Counter),a
_idle:
    jr _idle

Counter:
    .db 0
