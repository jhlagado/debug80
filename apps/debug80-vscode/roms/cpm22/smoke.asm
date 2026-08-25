; CP/M transient acceptance program. It creates RESULT.TXT through ordinary
; BDOS calls, writes one sequential record, closes the file, and warm-boots.

        .org    $0100

BDOS                    .equ $0005
BDOS_PRINT_STRING       .equ 9
BDOS_DELETE_FILE        .equ 19
BDOS_WRITE_SEQUENTIAL   .equ 21
BDOS_MAKE_FILE          .equ 22
BDOS_SET_DMA            .equ 26
BDOS_CLOSE_FILE         .equ 16

Start:
        ld      de,ResultFcb
        ld      c,BDOS_DELETE_FILE
        call    BDOS

        ld      de,ResultFcb
        ld      c,BDOS_MAKE_FILE
        call    BDOS
        inc     a
        jp      z,FileError

        ld      de,ResultRecord
        ld      c,BDOS_SET_DMA
        call    BDOS

        ld      de,ResultFcb
        ld      c,BDOS_WRITE_SEQUENTIAL
        call    BDOS
        or      a
        jp      nz,FileError

        ld      de,ResultFcb
        ld      c,BDOS_CLOSE_FILE
        call    BDOS
        inc     a
        jp      z,FileError

        ld      de,SuccessMessage
        ld      c,BDOS_PRINT_STRING
        call    BDOS
        jp      $0000

FileError:
        ld      de,ErrorMessage
        ld      c,BDOS_PRINT_STRING
        call    BDOS
        jp      $0000

SuccessMessage:
        .db     "Wrote RESULT.TXT",13,10,"$"
ErrorMessage:
        .db     "RESULT.TXT write failed",13,10,"$"

ResultFcb:
        .db     0
        .db     "RESULT  "
        .db     "TXT"
        .ds     24,0

ResultRecord:
        .db     "CP/M file services are working",13,10
        .ds     96,$1A

        .binto  $01FF
