; Utility routines for Z80 translation support
; Conventions:
; - Inputs in A/HL (DE/BC as needed), IX/IY for advanced use
; - Outputs in A or HL
; - Uses system macros: sysGetc, sysPutc, sysPuts
; - All buffers null-terminated unless specified

; getc: read one character into A (blocks until available)
getc:
    sysGetc             ; A = char, flags set accordingly
    ret

; putc: write character in A
putc:
    sysPutc             ; writes A
    ret

; readLine: reads a line into buffer at HL, max length in B (not counting terminator)
; - Converts CR/LF to terminator 0
; - Echo optional: toggle via C (0 = no echo, nonzero = echo)
; Returns HL pointing to terminator; A = length stored (excluding terminator)
readLine:
    push bc
    ld d,0               ; length counter in D
readLoop:
    sysGetc             ; A = ch
    cp 13                ; CR?
    jr z,readDone
    cp 10                ; LF?
    jr z,readDone
    ld e,a               ; save char
    ld a,d
    cp b                 ; length >= max?
    jr nc,readLoop       ; ignore extra chars
    ld a,e
    ld (hl),a            ; store char
    inc hl
    inc d
    ld a,c               ; echo flag from caller
    or a
    jr z,readLoop
    dec hl
    ld a,(hl)            ; reload char for echo
    inc hl
    sysPutc             ; echo
    jr readLoop
readDone:
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

; randByte: returns pseudo-random 0..255 in A
; - Simple 8-bit state at randState (one byte)
randByte:
    ld hl,randState
    ld a,(hl)
    ld b,a
    rlca
    rlca
    xor b
    ld (hl),a
    ret

; rand0To3: returns pseudo-random 0..3 in A
rand0To3:
    call randByte
    and 3
    ret

; rand0To6: returns pseudo-random 0..6 in A (rejects 7)
rand0To6:
rbLoop:
    call randByte
    and 7
    cp 7
    jr z,rbLoop
    ret

; compareStr: compare null-terminated strings at HL and DE
; Returns Z if equal, NZ otherwise
compareStr:
compareLoop:
    ld a,(hl)
    cp (de)
    ret nz
    or a
    ret z
    inc hl
    inc de
    jr compareLoop

; findTokenIndex: scan table of null-terminated strings
; Inputs: HL = token ptr, DE = table ptr, B = count
; Returns: A = 1..count on match, 0 if none; preserves HL
findTokenIndex:
    push hl
    ld c,1
findNext:
    ld a,b
    or a
    jr z,findNotFound
    push bc
    push de
    push hl
    call compareStr
    pop hl
    pop de
    pop bc
    jr z,findFound
    ; advance DE to next string
findSkipStr:
    ld a,(de)
    inc de
    or a
    jr nz,findSkipStr
    inc c
    djnz findNext
findNotFound:
    xor a
    pop hl
    ret
findFound:
    ld a,c
    pop hl
    ret

; getWordFromTable: fetch word pointer/value from a word table by 1-based index
; Inputs:
;   HL = table base (DW entries)
;   A  = index (1..N)
; Outputs:
;   DE = word at table[index]
; Clobbers: A, HL
getWordFromTable:
    dec a                 ; A = index-1 (0-based)
    add a,a               ; A = (index-1)*2
    ld e,a
    ld d,0
    add hl,de             ; HL -> entry
    ld e,(hl)             ; DE = word (little-endian)
    inc hl
    ld d,(hl)
    ret

; getByteFromTable: fetch byte from a byte table by 1-based index
; Inputs:
;   HL = table base (DB entries)
;   A  = index (1..N)
; Outputs:
;   A  = byte at table[index]
; Clobbers: HL
getByteFromTable:
    dec a                 ; A = index-1 (0-based)
    ld e,a
    ld d,0
    add hl,de             ; HL -> entry
    ld a,(hl)
    ret

; tokenizeInput: simple whitespace tokenizer in-place
; Inputs: HL = buffer (null-terminated)
; Outputs: tokenPtrs array (caller defines), tokenCount byte
; - Splits on space, collapses multiple spaces
tokenizeInput:
    ; Caller supplies tokenPtrs (word array) and tokenCount (byte)
    ; Implementation intentionally left for integration context
    ret

; containsStr: return 1 in A if needle (DE) is found in haystack (HL), else 0
; - Simple brute-force substring search; both strings are null-terminated
containsStr:
    push hl
    push de
csNextStart:
    ld a,(hl)             ; end of haystack?
    or a
    jr z,csNotFound
    push hl               ; save current haystack ptr
    push de
csCompare:
    ld a,(de)             ; needle char
    or a
    jr z,csFound          ; hit terminator => match
    cp (hl)
    jr nz,csMismatch
    inc hl
    inc de
    jr csCompare
csMismatch:
    pop de                ; restore needle ptr
    pop hl                ; restore haystack start
    inc hl                ; advance haystack start
    jr csNextStart
csFound:
    pop de                ; drop needle save
    pop hl                ; drop haystack save
    ld a,1                ; found
    pop de                ; restore original DE
    pop hl                ; restore original HL
    ret
csNotFound:
    xor a                 ; not found
    pop de                ; restore original DE
    pop hl                ; restore original HL
    ret

; Data placeholders (caller to allocate in BSS/vars area)
randState: db 1
crlfStr:  db 13,10,0
ansiClearStr: db 27,"[2J",27,"[H",0

; printStr: print null-terminated string at HL
printStr:
    sysPuts
    ret

; printNewline: emit CR/LF via printStr (crlfStr)
printNewline:
    ld hl,crlfStr
    jp printStr

; printLine: print string then CR/LF
; Input: HL -> string
; Clobbers: HL
printLine:
    call printStr
    ld hl,crlfStr
    jp printStr

; clearScreen: stub hook for platform-specific CLS
; Uses ANSI: ESC[2J ESC[H (clear screen and home cursor).
clearScreen:
    ld hl,ansiClearStr
    jp printStr

; printNum: print signed 16-bit in HL (decimal)
; Adapted from provided printDec routine; uses putc
printNum:
    bit 7,h
    jr z,printNum2
    ld a,'-'
    call putc
    xor a
    sub l
    ld l,a
    sbc a,a
    sub h
    ld h,a
printNum2:
    push bc
    ld c,0                      ; leading zeros flag = false
    ld de,-10000
    call printNum4
    ld de,-1000
    call printNum4
    ld de,-100
    call printNum4
    ld e,-10
    call printNum4
    inc c                       ; flag = true for at least digit
    ld e,-1
    call printNum4
    pop bc
    ret
printNum4:
    ld b,'0'-1
printNum5:
    inc b
    add hl,de
    jr c,printNum5
    sbc hl,de
    ld a,'0'
    cp b
    jr nz,printNum6
    xor a
    or c
    ret z
    jr printNum7
printNum6:
    inc c
printNum7:
    ld a,b
    jp putc

; normalizeInput: lowercase a null-terminated string in-place
; Input: HL -> string; Output: HL -> terminator; Clobbers: A
normalizeInput:
normLoop:
    ld a,(hl)                     ; load current char
    or a                          ; terminator?
    ret z                         ; done if 0
    cp 'A'                        ; below 'A'?
    jr c,normNext                 ; skip
    cp 'Z'+1                      ; past 'Z'?
    jr nc,normNext                ; skip
    add a,32                      ; to lowercase
    ld (hl),a                     ; write back
normNext:
    inc hl                        ; advance
    jr normLoop                   ; continue

; printSpace: convenience to emit a single space
printSpace:
    ld a,' '
    jp putc

; printAdj: print correct article + space + adjective at HL
; - HL: pointer to adjective string (may have leading spaces; may include trailing space)
; - Emits "a " or "an " based on first non-space character, then the adjective
printAdj:
    push hl
    ld d,h
    ld e,l               ; DE scans for first non-space
adjSkipSpaces:
    ld a,(de)
    cp ' '
    jr nz,adjHaveChar
    inc de
    jr adjSkipSpaces
adjHaveChar:
    call toLowerAscii
    ld b,a               ; first non-space, lowercased
    ld a,'a'
    call putc
    ld a,b
    cp 'a'
    jr z,adjVowel
    cp 'e'
    jr z,adjVowel
    cp 'i'
    jr z,adjVowel
    cp 'o'
    jr z,adjVowel
    cp 'u'
    jr nz,adjAfter
adjVowel:
    ld a,'n'
    call putc
adjAfter:
    call printSpace
    pop hl               ; restore adjective ptr
    jp printStr

; containsByteListZeroTerm
; Purpose: test whether a byte value exists in a 0-terminated byte list.
; Inputs:
;   A  = value to find
;   HL = pointer to list (DB v1, v2, ..., 0)
; Outputs:
;   Z  = 1 if found, Z = 0 if not found
; Clobbers: A, B, HL
containsByteListZeroTerm:
    ld b,a                        ; B = target value
cbztLoop:
    ld a,(hl)                     ; A = current list value
    or a                          ; terminator (0)?
    jr z,cbztNotFound             ; end of list -> not found
    cp b                          ; found?
    ret z                         ; yes (Z=1)
    inc hl                        ; next byte
    jr cbztLoop                   ; keep scanning
cbztNotFound:
    or 1                          ; force Z=0 to signal not found
    ret

; getObjLoc
; Purpose: fetch object/creature location byte from objectLocation[].
; Inputs:
;   A = object index (1..objectCount)
; Outputs:
;   A = location byte (0, room id 1..roomMax, or roomCarried)
; Clobbers: HL, DE
getObjLoc:
    dec a                         ; A = index-1 (0-based)
    ld e,a                        ; DE = offset
    ld d,0
    ld hl,objectLocation          ; HL = base of location array
    add hl,de                     ; HL = &objectLocation[index-1]
    ld a,(hl)                     ; A = location
    ret

; setObjLoc
; Purpose: store an object/creature location byte into objectLocation[].
; Inputs:
;   A = object index (1..objectCount)
;   E = location byte to store (0, room id 1..roomMax, or roomCarried)
; Outputs: none
; Clobbers: A, HL, DE
setObjLoc:
    dec a                         ; A = index-1 (0-based)
    ld d,0
    ld l,a                        ; HL = offset
    ld h,0
    ld a,e                        ; A = value
    ld de,objectLocation          ; DE = base
    add hl,de                     ; HL = &objectLocation[index-1]
    ld (hl),a                     ; store location
    ret

; isObjHereOrCarried
; Purpose: test if an object is either in the current room or carried.
; Inputs:
;   A = object index (1..objectCount)
; Outputs:
;   Z = 1 if (location == playerLocation) OR (location == roomCarried)
;   Z = 0 otherwise
; Clobbers: A, B, HL, DE
isObjHereOrCarried:
    call getObjLoc                ; A = location
    ld b,a                        ; B = location
    ld a,(playerLocation)         ; A = current room
    cp b                          ; here?
    ret z                         ; yes -> Z=1
    ld a,b                        ; A = location
    cp roomCarried                ; carried?
    ret

; printWordTableEntryIfNotNull
; Purpose: print a string pointer from a DW table indexed by a 1-based byte id.
; Inputs:
;   HL = table base (DW entries)
;   A  = 1-based index into table
; Outputs:
;   Z  = 1 if entry was NULL (printed nothing), Z = 0 if printed
; Clobbers: A, DE, HL
printWordTableEntryIfNotNull:
    call getWordFromTable         ; DE = table entry (pointer or 0)
    ld a,d
    or e
    ret z                         ; NULL -> return with Z=1
    ex de,hl                      ; HL = string pointer
    call printStr                 ; emit string
    or 1                          ; force Z=0 to indicate "printed"
    ret

; getWordTableEntryToHl
; Purpose: fetch a DW table entry into HL (instead of DE).
; Inputs:
;   HL = table base (DW entries)
;   A  = 1-based index into table
; Outputs:
;   HL = entry value (pointer)
;   Z  = 1 if entry was NULL (HL=0), Z = 0 otherwise
; Clobbers: A, DE
getWordTableEntryToHl:
    call getWordFromTable         ; DE = entry (or 0)
    ld a,d
    or e                          ; Z=1 if NULL
    ex de,hl                      ; HL = entry
    ret
