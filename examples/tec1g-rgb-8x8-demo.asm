; TEC-1G RGB 8x8 matrix demo (MON-3 style)
; Cycles through all 8 colors, including black:
; 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white.
;
; Ports from TEC-Expander 8x8 RGB docs:
;   0x05 = row select
;   0x06 = red columns
;   0xF8 = green columns
;   0xF9 = blue columns

            org 04000h

PORT_ROW    equ 05h
PORT_RED    equ 06h
PORT_GREEN  equ 0F8h
PORT_BLUE   equ 0F9h

main:
            xor a                   ; start at black (0)

color_loop:
            push af
            call show_color
            pop af
            inc a
            and 07h                 ; 0..7 then wrap
            jr color_loop

; A = RGB color bits:
; bit0=R, bit1=G, bit2=B
show_color:
            ld e, a
            ld b, 90                ; frames per color

frame_loop:
            ld c, 01h               ; row mask (1,2,4,...,128)
            ld d, 08h               ; 8 rows

row_loop:
            ; Red plane
            ld a, e
            and 01h
            jr z, red_off
            ld a, 0FFh
            out (PORT_RED), a
            jr red_done
red_off:
            xor a
            out (PORT_RED), a
red_done:

            ; Green plane
            ld a, e
            and 02h
            jr z, green_off
            ld a, 0FFh
            out (PORT_GREEN), a
            jr green_done
green_off:
            xor a
            out (PORT_GREEN), a
green_done:

            ; Blue plane
            ld a, e
            and 04h
            jr z, blue_off
            ld a, 0FFh
            out (PORT_BLUE), a
            jr blue_done
blue_off:
            xor a
            out (PORT_BLUE), a
blue_done:

            ; Enable current row and hold briefly.
            ld a, c
            out (PORT_ROW), a
            call row_hold

            ; Blank row between scans to reduce ghosting.
            xor a
            out (PORT_ROW), a

            rlc c
            dec d
            jr nz, row_loop

            djnz frame_loop
            ret

row_hold:
            ld hl, 0200h
row_hold_loop:
            dec hl
            ld a, h
            or l
            jr nz, row_hold_loop
            ret
