; Core constants for the sample machine layout and services

ROMSTART    EQU $0000          ; system/ROM area 0x0000–0x07FF
APPSTART    EQU $0900          ; user program entry point
STACK_TOP   EQU $FF00          ; convenient stack top in RAM

; Terminal ports
TERM_TX_PORT    EQU 0
TERM_RX_PORT    EQU 1
TERM_STATUS     EQU 2          ; bit0 = RX available, bit1 = TX ready

; Service selector values (passed in C) for RST 10H
SVC_PUTCHAR EQU 22             ; A = char
SVC_GETCHAR EQU 23             ; returns A = char
SVC_PUTSTR  EQU 45             ; HL = ptr to 0-terminated string

; ASCII helpers
CR          EQU $0D
LF          EQU $0A
ESC         EQU $1B
