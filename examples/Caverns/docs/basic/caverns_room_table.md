# Caverns Room Table (Current ASM Map)

Source: `examples/Caverns/src/tables.asm` + `examples/Caverns/src/strings.asm`.

- Exit order: **N,S,W,E**.
- This reflects the *current* ASM map (not `mwb.txt`).

| Room | Description | N | S | W | E | Symmetry Notes (rooms 1–15) |
|---:|---|---:|---:|---:|---:|---|
| 1 | You are standing in a darkened room. There is a door to the north. | 2 | 0 | 0 | 0 | N->2 but S from 2 returns blocked |
| 2 | You are in a forest clearing before a small bark hut. There engaged when you closed the door. | 0 | 0 | 3 | 4 |  |
| 3 | You are deep in a dark forest. In the distance you can see a mighty river. | 0 | 0 | 5 | 2 |  |
| 4 | You are standing in a field of four-leafed clovers. There is a small hut to the west. | 0 | 0 | 2 | 9 |  |
| 5 | The forest has opened up at this point. You are standing on a cliff overlooking a wide glacial river. A small foot-beaten path leads south. | 0 | 6 | 0 | 3 |  |
| 6 | You are standing at the rocky edge of the mighty river Gioll. The path forks east and west. | 5 | 0 | 7 | 8 |  |
| 7 | You are on the edge of an enormous crater. The rim is extremely slippery. Clouds of water vapour rise high in the air as the Gioll pours … | 0 | 0 | 128 | 6 |  |
| 8 | The path to the east stops here. You are on a rocky | 0 | 0 | 6 | 0 |  |
| 9 | You are on the lower slopes of Mt. Ymir. The forest stretches far away and to the west. Arctic winds blow | 0 | 10 | 4 | 0 |  |
| 10 | Mt. Ymir stands to the north. A flimsy string bridge spans the mighty river. | 9 | 11 | 0 | 0 |  |
| 11 | You have made your way half way across the creaking bridge. It sways violently from side to side. It's going to collapse any second!! | 10 | 12 | 128 | 128 |  |
| 12 | the string bridge. | 11 | 13 | 13 | 0 |  |
| 13 | You are standing on a rock in the middle of a mighty oak forest. Surrounding you are thousands of poisonous mushrooms. | 12 | 0 | 14 | 12 |  |
| 14 | You are in a clearing in the forest. An ancient basalt rock formation towers above you. To your south is the entrance of a VERY interesti… | 15 | 16 | 0 | 13 |  |
| 15 | You are on a cliff face over looking the river. | 0 | 14 | 0 | 0 |  |
| 16 | You are just inside the cave. Sunlight pours into the cave lighting a path to the east and another to the south. I don't mind saying I'm … | 14 | 18 | 0 | 17 |  |
| 17 | This passage appears to be a dead end. On a wall before you is carved `Find the Sacred Key of Thialfi'. | 0 | 0 | 16 | 0 |  |
| 18 | (no description) | 16 | 0 | 23 | 0 |  |
| 19 | You are in the legendary treasure room of the black elves of Svartalfheim. Every red-blooded Viking has dreamed of entering this sacred r… | 0 | 0 | 20 | 0 |  |
| 20 | You can see a small oak door to the east. It has been locked from the inside. | 21 | 23 | 0 | 0 |  |
| 21 | (no description) | 0 | 24 | 0 | 20 |  |
| 22 | You are standing in an east-west corridor. You can feel a faint breeze coming from the east. | 0 | 23 | 21 | 16 |  |
| 23 | You are standing in what appears to have once been a torture chamber. Apart from the rather comprehensive range coagulated blood stains o… | 22 | 0 | 18 | 18 |  |
| 24 | You stand in a long tunnel which has been bored out of the rock.It runs from north to south. A faint glow comes from a narrow crack in th… | 21 | 26 | 0 | 18 |  |
| 25 | (no description) | 0 | 27 | 24 | 0 |  |
| 26 | You are in a large round room with a number of exits. The walls have been painted in a mystical dark purple and a big chalk staris drawn … | 24 | 27 | 29 | 25 |  |
| 27 | subterranean river. There is an exit to the east. | 18 | 0 | 0 | 28 |  |
| 28 | been converted into a pagan temple. Note: this temple has banished to exile by Odin. Since then he has been waiting for the `End Of All T… | 0 | 0 | 27 | 0 |  |
| 29 | (no description) | 0 | 33 | 0 | 26 |  |
| 30 | (no description) | 29 | 31 | 0 | 0 |  |
| 31 | (no description) | 32 | 0 | 0 | 0 |  |
| 32 | (no description) | 33 | 30 | 0 | 0 |  |
| 33 | You are in the central cave of a giant bat colony. Above you hundreds of giant bats hang from the ceiling and the floor is covered in cen… | 0 | 31 | 34 | 0 |  |
| 34 | (no description) | 0 | 0 | 0 | 33 |  |
| 35 | You are in the temple. To the north is a locked gate and on living rock itself! | 0 | 0 | 0 | 0 |  |
| 36 | (no description) | 39 | 0 | 35 | 40 |  |
| 37 | place of hundreds of Loki devotees. On the wall is carved:``What 3 letter word completes a word starting with 'G---' and another ending w… | 0 | 35 | 0 | 0 |  |
| 38 | You are in a tiny cell. The western wall has now firmly closed again. There is a ventilator shaft on the eastern wall. | 0 | 0 | 0 | 0 |  |
| 39 | (no description) | 0 | 36 | 38 | 0 |  |
| 40 | You are on another ledge high above a subterranean river. the north. | 45 | 48 | 36 | 128 |  |
| 41 | (no description) | 46 | 43 | 54 | 42 |  |
| 42 | (no description) | 46 | 43 | 41 | 43 |  |
| 43 | (no description) | 46 | 38 | 42 | 44 |  |
| 44 | (no description) | 47 | 47 | 0 | 47 |  |
| 45 | You are standing near an enormous waterfall which brings | 0 | 40 | 0 | 128 |  |
| 46 | (no description) | 47 | 0 | 47 | 47 |  |
| 47 | You are standing before a stone staircase which leads southwards. | 0 | 45 | 46 | 0 |  |
| 48 | You are on a narrow and crumbling ledge. On the other side of the river you can see a magic castle. (Don't ask me why it's magic...I just… | 40 | 128 | 0 | 128 |  |
| 49 | You are by the drawbridge which has just lowered itself....by magic!! | 0 | 0 | 48 | 50 |  |
| 50 | You are in the courtyard of the magic castle. WOW! This castle is really something! On the wall is inscribed 'hzb tzozi'. A secret escape… | 0 | 52 | 49 | 51 |  |
| 51 | You are in the powder magazine of this really super castle. | 0 | 0 | 50 | 0 |  |
| 52 | You are on the eastern side of the river. A small tunnel leads east into the cliff face. | 50 | 0 | 53 | 50 |  |
| 53 | You stand before a small wooden bridge which crosses the river. | 54 | 0 | 0 | 52 |  |
| 54 | You are in a conduit draining into the river. The water comes up to your knees and is freezing cold. A narrow service path leads south. | 0 | 53 | 41 | 0 |  |
