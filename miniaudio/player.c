/* player.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "player.h"
#include "miniaudio.h"

static ma_engine engine;
static ma_sound sound;
static int is_initialized = 0;
static int is_loaded = 0;

void player_init(void) {
    if (ma_engine_init(NULL, &engine) == MA_SUCCESS) {
        is_initialized = 1;
    }
}

void player_cleanup(void) {
    if (is_loaded) {
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }
    if (is_initialized) {
        ma_engine_uninit(&engine);
        is_initialized = 0;
    }
}

void play_song(const char *filename) {
    if (!is_initialized) return;
    if (is_loaded) {
        ma_sound_stop(&sound);
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }
    if (ma_sound_init_from_file(&engine, filename, 0, NULL, NULL, &sound) != MA_SUCCESS) {
    printf("Failed to load: '%s'\n", filename);
    return;
}

    is_loaded = 1;
    ma_sound_start(&sound);
}

void stop_song(void) {
    if (!is_loaded) return;
    ma_sound_stop(&sound);
    ma_sound_seek_to_pcm_frame(&sound, 0);
}

void pause_resume_song(void) {
    if (!is_loaded) return;
    if (ma_sound_is_playing(&sound))
        ma_sound_stop(&sound);
    else
        ma_sound_start(&sound);
}

void adjust_volume(float volume) {
    if (!is_loaded) return;
    if (volume < 0.0f) volume = 0.0f;
    if (volume > 1.0f) volume = 1.0f;
    ma_sound_set_volume(&sound, volume);
}

void seek_time(float seconds) {
    if (!is_loaded || seconds < 0.0f) return;
    ma_uint32 sampleRate;
    if (ma_sound_get_data_format(&sound, NULL, NULL, &sampleRate, NULL, 0) != MA_SUCCESS) return;
    ma_uint64 frame = (ma_uint64)(seconds * sampleRate);
    ma_sound_seek_to_pcm_frame(&sound, frame);
}

void set_playback_speed(float speed) {
    if (!is_loaded) return;
    if (speed < 0.1f) speed = 0.1f;
    if (speed > 4.0f) speed = 4.0f;
    ma_sound_set_pitch(&sound, speed);
}

void show_status(void) {
    if (!is_loaded) return;
    printf("Playing: %s\n", ma_sound_is_playing(&sound) ? "Yes" : "No");
    ma_uint64 cur;
    ma_uint32 rate;
    if (ma_sound_get_cursor_in_pcm_frames(&sound, &cur) == MA_SUCCESS &&
        ma_sound_get_data_format(&sound, NULL, NULL, &rate, NULL, 0) == MA_SUCCESS) {
        printf("Position: %.1f sec\n", (float)cur / rate);
    }
    ma_uint64 len;
    if (ma_sound_get_length_in_pcm_frames(&sound, &len) == MA_SUCCESS &&
        ma_sound_get_data_format(&sound, NULL, NULL, &rate, NULL, 0) == MA_SUCCESS) {
        printf("Length: %.1f sec\n", (float)len / rate);
    }
    printf("Volume: %.1f%%\n", ma_sound_get_volume(&sound) * 100);
}

int main() {
    player_init();
    char line[256];
    while (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        if (len > 0 && (line[len-1] == '\n' || line[len-1] == '\r')) line[len-1] = '\0';
        if (strncmp(line, "play ", 5) == 0) {
            play_song(line + 5);
        } else if (strncmp(line, "stop", 4) == 0) {
            stop_song();
        } else if (strncmp(line, "pause", 5) == 0) {
            pause_resume_song();
        } else if (strncmp(line, "volume ", 7) == 0) {
            adjust_volume(strtof(line + 7, NULL));
        } else if (strncmp(line, "seek ", 5) == 0) {
            seek_time(strtof(line + 5, NULL));
        } else if (strncmp(line, "speed ", 6) == 0) {
            set_playback_speed(strtof(line + 6, NULL));
        } else if (strncmp(line, "status", 6) == 0) {
            show_status();
        } else if (strncmp(line, "quit", 4) == 0) {
            break;
        }
    }
    player_cleanup();
    return 0;
}
