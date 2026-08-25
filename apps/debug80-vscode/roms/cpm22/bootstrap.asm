; Debug80 ideal CP/M 2.2 cold bootstrap.
;
; Debug80 loads this project-owned program at $0000 after reset. It reads the
; complete two-track CP/M system area through the ideal sector device and then
; enters the guest BIOS cold-boot vector. The BIOS replaces the page-zero bytes
; used by this loader before entering the CCP.

        .org    $0000

SYSTEM_BASE             .equ $E400
BIOS_BASE               .equ $FA00
SYSTEM_SECTORS          .equ 52
SECTORS_PER_TRACK       .equ 26
SECTOR_BYTES            .equ 128

PORT_DISK_STATUS        .equ $10
PORT_DISK_DRIVE         .equ $11
PORT_DISK_TRACK_LOW     .equ $12
PORT_DISK_TRACK_HIGH    .equ $13
PORT_DISK_SECTOR        .equ $14
PORT_DISK_DATA          .equ $15
DISK_COMMAND_READ       .equ 1

Start:
        di
        ld      sp,$0100
        xor     a
        ld      (CurrentTrack),a
        out     (PORT_DISK_DRIVE),a
        ld      a,1
        ld      (CurrentSector),a
        ld      a,SYSTEM_SECTORS
        ld      (SectorsRemaining),a
        ld      hl,SYSTEM_BASE

ReadNextSector:
        ld      a,(CurrentTrack)
        out     (PORT_DISK_TRACK_LOW),a
        xor     a
        out     (PORT_DISK_TRACK_HIGH),a
        ld      a,(CurrentSector)
        out     (PORT_DISK_SECTOR),a
        ld      a,DISK_COMMAND_READ
        out     (PORT_DISK_STATUS),a
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,BootError

        ld      b,SECTOR_BYTES
        ld      c,PORT_DISK_DATA
        inir
        in      a,(PORT_DISK_STATUS)
        or      a
        jr      nz,BootError

        ld      a,(CurrentSector)
        inc     a
        cp      SECTORS_PER_TRACK+1
        jr      c,StoreSector
        ld      a,1
        ld      (CurrentSector),a
        ld      a,(CurrentTrack)
        inc     a
        ld      (CurrentTrack),a
        jr      SectorAdvanced

StoreSector:
        ld      (CurrentSector),a

SectorAdvanced:
        ld      a,(SectorsRemaining)
        dec     a
        ld      (SectorsRemaining),a
        jr      nz,ReadNextSector
        jp      BIOS_BASE

BootError:
        halt
        jr      BootError

CurrentTrack:
        .db     0
CurrentSector:
        .db     1
SectorsRemaining:
        .db     0

        .binto  $00FF
