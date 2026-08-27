; RAM layout for the Pacmo scrolling experiment.
RamStart:
PlayerX:
        DB      0
PlayerY:
        DB      0
Monsters:
Monster0:
        DS      (PC_MNST0)
Monster1:
        DS      (PC_MNST0)
Monster2:
        DS      (PC_MNST0)
EnemyX EQU Monster0 + 0
EnemyY EQU Monster0 + 1
EnemyDir EQU Monster0 + 2
PW_ENMYT EQU Monster0 + 3
PW_ENMYR EQU Monster0 + 4
PW_ENMYS EQU Monster0 + 5
Enemy2X EQU Monster1 + 0
Enemy2Y EQU Monster1 + 1
PW_ENMY2 EQU Monster1 + 2
PW_ENMY3 EQU Monster1 + 3
PW_ENMY0 EQU Monster1 + 4
PW_ENMY1 EQU Monster1 + 5
Enemy3X EQU Monster2 + 0
Enemy3Y EQU Monster2 + 1
PW_ENMY4 EQU Monster2 + 2
PW_ENMY7 EQU Monster2 + 3
PW_ENMY5 EQU Monster2 + 4
PW_ENMY6 EQU Monster2 + 5
PW_ENMYP:
        DB      0
ViewX:
        DB      0
ViewY:
        DB      0
CM_MVCLD:
        DB      0
LastKey:
        DB      0
PW_SPLSH:
        DB      0
PW_PSDAU:
        DB      0
CM_HDSCN:
        DB      0
CM_SPKRP:
        DB      0
CM_SNDTM:
        DB      0
CM_SNDD0:
        DB      0
CM_SNDDV:
        DB      0
PacScore:
        DW      0
CM_HDSGB:
        DS      6
CM_FRMPH:
        DB      0
PW_RNDRT:
        DW      0
PW_PWRPL:
        DB      0
PW_PWRTM:
        DW      0
PW_PWRT1 EQU PW_PWRTM
PW_PWRT0 EQU PW_PWRTM + 1
PW_RNDDN:
        DB      0
PW_PLYRC:
        DB      0
PW_GMVRA:
        DB      0
PacLevel:
        DB      0
PacLives:
        DB      0
PW_LVLDN:
        DW      0
PW_LVLD1 EQU PW_LVLDN
PW_LVLD0 EQU PW_LVLDN + 1
PW_GVRGT:
        DW      0
PW_GVRG1 EQU PW_GVRGT
PW_GVRG0 EQU PW_GVRGT + 1
ScanMask:
        DB      0
ScanPtr:
        DW      0
CM_FRMBF EQU $
CM_FRMB0 EQU CM_FRMBF + 32
PW_ETNRW EQU CM_FRMB0 + 32
RamEnd EQU PW_ETNRW + 30
