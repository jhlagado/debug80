; Utility routines for Z80 translation support
; Conventions:
; - Inputs in A/HL (DE/BC as needed), IX/IY for advanced use
; - Outputs in A or HL
; - Uses system macros: SYS_GETC, SYS_PUTC, SYS_PUTS
; - All buffers null-terminated unless specified

; getc: read one character into A (blocks until available)
getc:
    SYS_GETC             ; A = char, flags set accordingly
    ret

; putc: write character in A
putc:
    SYS_PUTC             ; writes A
    ret

; puts: write null-terminated string at HL
puts:
    SYS_PUTS             ; HL -> string, prints until 0
    ret

; readLine: reads a line into buffer at HL, max length in B (not counting terminator)
; - Converts CR/LF to terminator 0
; - Echo optional: toggle via C (0 = no echo, nonzero = echo)
; Returns HL unchanged; A = length stored (excluding terminator)
readLine:
    push bc
    ld d,0               ; length counter in D
.readLoop:
    SYS_GETC             ; A = ch
    cp 13                ; CR?
    jr z,.done
    cp 10                ; LF?
    jr z,.done
    ld e,a               ; save char
    ld a,d
    cp b                 ; length >= max?
    jr nc,.readLoop      ; ignore extra chars
    ld a,e
    ld (hl),a            ; store char
    inc hl
    inc d
    ld a,c               ; echo flag from caller
    or a
    jr z,.readLoop
    dec hl
    ld a,(hl)            ; reload char for echo
    inc hl
    SYS_PUTC             ; echo
    jr .readLoop
.done:
    ld (hl),0
    ld a,d               ; return length in A
    pop bc
    ret

; toLowerAscii: lowercase A if 'A'..'Z'
toLowerAscii:
    cp 'A'
    ret c
    cp 'Z'+1
    ret nc
    add a,32
    ret

; rand0_3: returns pseudo-random 0..3 in A
; - Simple LFSR/state at RAND_STATE (one byte)
; - Caller must define RAND_STATE storage
rand0_3:
    ld hl,RAND_STATE
    ld a,(hl)
    ld b,a
    rlca
    rlca
    xor b
    ld (hl),a
    and 3                ; 0..3
    ret

; compareStr: compare null-terminated strings at HL and DE
; Returns Z if equal, NZ otherwise
compareStr:
.loop:
    ld a,(hl)
    cp (de)
    ret nz
    or a
    ret z
    inc hl
    inc de
    jr .loop

; findTokenIndex: scan table of null-terminated strings
; Inputs: HL = token ptr, DE = table ptr, B = count
; Returns: A = 1..count on match, 0 if none; preserves HL
findTokenIndex:
    push hl
    ld c,1
.next:
    ld a,b
    or a
    jr z,.notFound
    push bc
    push de
    push hl
    call compareStr
    pop hl
    pop de
    pop bc
    jr z,.found
    ; advance DE to next string
.skipStr:
    ld a,(de)
    inc de
    or a
    jr nz,.skipStr
    inc c
    djnz .next
.notFound:
    xor a
    pop hl
    ret
.found:
    ld a,c
    pop hl
    ret

; tokenizeInput: simple whitespace tokenizer in-place
; Inputs: HL = buffer (null-terminated)
; Outputs: TOKEN_PTRS array (caller defines), TOKEN_COUNT byte
; - Splits on space, collapses multiple spaces
tokenizeInput:
    ; Caller supplies TOKEN_PTRS (word array) and TOKEN_COUNT (byte)
    ; Implementation intentionally left for integration context
    ret

; printObjectDesc: helper to print "a" + adj + noun + ", "
; Inputs: HL = ptr to adj string, DE = ptr to noun string
printObjectDesc:
    push de
    push hl
    ld a,'a'
    call putc
    ld hl,SPACE_STR
    call puts
    pop hl               ; adj
    call puts
    ld hl,SPACE_STR      ; separator
    call puts
    pop de               ; noun
    ex de,hl
    call puts
    ld a,','
    call putc
    ld a,' '
    call putc
    ret

; Data placeholders (caller to allocate in BSS/vars area)
RAND_STATE: db 1
SPACE_STR: db " ",0
