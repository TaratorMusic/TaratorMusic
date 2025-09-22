#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "miniaudio.h"

ma_engine engine;
ma_sound sound;
int is_initialized = 0;
int is_loaded = 0;

void print_menu();
void play_song(const char* filename);
void stop_song();
void pause_resume_song();
void adjust_volume(float volume);
void seek_time(float seconds);
void set_playback_speed(float speed);
void show_status();
char* get_input();

int main() {
    if (ma_engine_init(NULL, &engine) != MA_SUCCESS) {
        printf("Failed to initialize audio engine\n");
        return 1;
    }
    
    is_initialized = 1;
    
    printf("=== Audio Player ===\n");
    printf("Load a song first using option 1\n\n");
    
    char* input;
    int choice;
    
    while (1) {
        print_menu();
        printf("Enter your choice: ");
        
        input = get_input();
        choice = atoi(input);
        free(input);
        
        switch (choice) {
            case 1: {
                printf("Enter filename (e.g., song.mp3): ");
                char* filename = get_input();
                play_song(filename);
                free(filename);
                break;
            }
            case 2:
                stop_song();
                break;
            case 3:
                pause_resume_song();
                break;
            case 4: {
                printf("Enter volume (0.0 to 1.0): ");
                char* vol_str = get_input();
                float volume = atof(vol_str);
                adjust_volume(volume);
                free(vol_str);
                break;
            }
            case 5: {
                printf("Enter time in seconds to seek to: ");
                char* time_str = get_input();
                float seconds = atof(time_str);
                seek_time(seconds);
                free(time_str);
                break;
            }
            case 6: {
                printf("Enter playback speed (0.5x, 1.0x, 1.5x, 2.0x, etc.): ");
                char* speed_str = get_input();
                float speed = atof(speed_str);
                set_playback_speed(speed);
                free(speed_str);
                break;
            }
            case 7:
                show_status();
                break;
            case 8:
                printf("Exiting...\n");
                goto cleanup;
            default:
                printf("Invalid choice. Please try again.\n");
                break;
        }
        printf("\n");
    }
    
cleanup:
    if (is_loaded) {
        ma_sound_uninit(&sound);
    }
    if (is_initialized) {
        ma_engine_uninit(&engine);
    }
    return 0;
}

void print_menu() {
    printf("=== Audio Player Menu ===\n");
    printf("1. Play/Load song\n");
    printf("2. Stop song\n");
    printf("3. Pause/Resume song\n");
    printf("4. Adjust volume\n");
    printf("5. Seek to time\n");
    printf("6. Set playback speed\n");
    printf("7. Show status\n");
    printf("8. Exit\n");
    printf("========================\n");
}

void play_song(const char* filename) {
    if (is_loaded) {
        ma_sound_stop(&sound);
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }
    
    if (ma_sound_init_from_file(&engine, filename, 0, NULL, NULL, &sound) != MA_SUCCESS) {
        printf("Failed to load sound file: %s\n", filename);
        return;
    }
    
    is_loaded = 1;
    
    if (ma_sound_start(&sound) != MA_SUCCESS) {
        printf("Failed to start playing sound\n");
        ma_sound_uninit(&sound);
        is_loaded = 0;
        return;
    }
    
    printf("Now playing: %s\n", filename);
}

void stop_song() {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    if (ma_sound_stop(&sound) == MA_SUCCESS) {
        printf("Song stopped\n");
        ma_sound_seek_to_pcm_frame(&sound, 0);
    } else {
        printf("Failed to stop song\n");
    }
}

void pause_resume_song() {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    if (ma_sound_is_playing(&sound)) {
        if (ma_sound_stop(&sound) == MA_SUCCESS) {
            printf("Song paused\n");
        } else {
            printf("Failed to pause song\n");
        }
    } else {
        if (ma_sound_start(&sound) == MA_SUCCESS) {
            printf("Song resumed\n");
        } else {
            printf("Failed to resume song\n");
        }
    }
}

void adjust_volume(float volume) {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    if (volume < 0.0f) volume = 0.0f;
    if (volume > 1.0f) volume = 1.0f;
    
    ma_sound_set_volume(&sound, volume);
    printf("Volume set to %.1f%%\n", volume * 100);
}

void seek_time(float seconds) {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    if (seconds < 0.0f) {
        printf("Invalid time. Must be >= 0\n");
        return;
    }
    
    ma_uint32 sampleRate;
    if (ma_sound_get_data_format(&sound, NULL, NULL, &sampleRate, NULL, 0) != MA_SUCCESS) {
        printf("Failed to get sound format information\n");
        return;
    }
    
    ma_uint64 targetFrame = (ma_uint64)(seconds * sampleRate);
    
    if (ma_sound_seek_to_pcm_frame(&sound, targetFrame) == MA_SUCCESS) {
        printf("Seeked to %.1f seconds\n", seconds);
    } else {
        printf("Failed to seek to specified time\n");
    }
}

void set_playback_speed(float speed) {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    if (speed < 0.1f || speed > 4.0f) {
        printf("Speed must be between 0.1x and 4.0x\n");
        return;
    }
    
    ma_sound_set_pitch(&sound, speed);
    printf("Playback speed set to %.1fx\n", speed);
}

void show_status() {
    if (!is_loaded) {
        printf("No song loaded\n");
        return;
    }
    
    printf("=== Song Status ===\n");
    printf("Playing: %s\n", ma_sound_is_playing(&sound) ? "Yes" : "No");
    
    ma_uint64 currentFrame;
    if (ma_sound_get_cursor_in_pcm_frames(&sound, &currentFrame) == MA_SUCCESS) {
        ma_uint32 sampleRate;
        if (ma_sound_get_data_format(&sound, NULL, NULL, &sampleRate, NULL, 0) == MA_SUCCESS) {
            float currentSeconds = (float)currentFrame / sampleRate;
            printf("Position: %.1f seconds\n", currentSeconds);
        }
    }
    
    ma_uint64 lengthInFrames;
    if (ma_sound_get_length_in_pcm_frames(&sound, &lengthInFrames) == MA_SUCCESS) {
        ma_uint32 sampleRate;
        if (ma_sound_get_data_format(&sound, NULL, NULL, &sampleRate, NULL, 0) == MA_SUCCESS) {
            float lengthInSeconds = (float)lengthInFrames / sampleRate;
            printf("Length: %.1f seconds\n", lengthInSeconds);
        }
    }
    
    printf("Volume: %.1f%%\n", ma_sound_get_volume(&sound) * 100);
    printf("==================\n");
}

char* get_input() {
    char* input = malloc(256);
    if (fgets(input, 256, stdin) != NULL) {
        size_t len = strlen(input);
        if (len > 0 && input[len-1] == '\n') {
            input[len-1] = '\0';
        }
    }
    return input;
}