#include <stdio.h>
#include <stdlib.h>
#include "miniaudio.h"

int main() {
    ma_engine engine;
    if (ma_engine_init(NULL, &engine) != MA_SUCCESS) {
        printf("Failed to initialize audio engine\n");
        return 1;
    }

    const char *songs[2] = {"example1.mp3", "example2.mp3"};
    ma_sound sound;
    int current = 0;

    while (1) {
        if (ma_sound_init_from_file(&engine, songs[current], 0, NULL, NULL, &sound) != MA_SUCCESS) {
            printf("Failed to load sound: %s\n", songs[current]);
        } else {
            printf("Playing: %s\n", songs[current]);
            ma_sound_start(&sound);
        }

        printf("Press Enter to swap songs...\n");
        getchar();

        ma_sound_uninit(&sound); 
        current = 1 - current;   
    }

    ma_engine_uninit(&engine);
    return 0;
}
