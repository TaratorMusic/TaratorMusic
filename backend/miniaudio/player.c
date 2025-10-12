#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "player.h"
#include "miniaudio.h"

#ifdef _WIN32
#include <windows.h>
#define popen _popen
#define pclose _pclose
#endif

typedef struct {
    FILE* pipe;
    ma_uint64 frames_read;
    int paused;
    unsigned char* buffer;
    size_t buffer_filled;
    size_t buffer_pos;
} StreamData;

static ma_engine engine;
static ma_sound sound;
static ma_device stream_device;
static StreamData stream_data;
static FILE* stream_pipe = NULL;
static int is_initialized = 0;
static int is_loaded = 0;
static int is_streaming = 0;
static float current_volume = 1.0f;
static int stream_playing = 0;

static void stop_stream(void);

static void stream_callback(ma_device* pDevice, void* pOutput, const void* pInput, ma_uint32 frameCount) {
    StreamData* data = (StreamData*)pDevice->pUserData;
    size_t bytesPerFrame = ma_get_bytes_per_frame(pDevice->playback.format, pDevice->playback.channels);
    size_t bytesToRead = frameCount * bytesPerFrame;

    if (!data || !data->pipe || data->paused) {
        memset(pOutput, 0, bytesToRead);
        return;
    }

    unsigned char* out = (unsigned char*)pOutput;
    size_t bytesReadTotal = 0;

    while (bytesReadTotal < bytesToRead) {
        if (data->buffer_filled == 0) {
            if (!data->buffer) {
                data->buffer = malloc(65536);
            }
            data->buffer_filled = fread(data->buffer, 1, 65536, data->pipe);
            data->buffer_pos = 0;
            if (data->buffer_filled == 0) break;
        }

        size_t toCopy = data->buffer_filled - data->buffer_pos;
        if (toCopy > bytesToRead - bytesReadTotal) toCopy = bytesToRead - bytesReadTotal;

        memcpy(out + bytesReadTotal, data->buffer + data->buffer_pos, toCopy);
        data->buffer_pos += toCopy;
        bytesReadTotal += toCopy;

        if (data->buffer_pos >= data->buffer_filled) data->buffer_filled = 0;
    }

    if (bytesReadTotal < bytesToRead) {
        memset(out + bytesReadTotal, 0, bytesToRead - bytesReadTotal);
    }

    if (current_volume < 0.99f || current_volume > 1.01f) {
        short* samples = (short*)pOutput;
        size_t sampleCount = bytesReadTotal / sizeof(short);
        for (size_t i = 0; i < sampleCount; i++) {
            int value = (int)(samples[i] * current_volume);
            if (value > 32767) value = 32767;
            if (value < -32768) value = -32768;
            samples[i] = (short)value;
        }
    }

    data->frames_read += bytesReadTotal / bytesPerFrame;
    (void)pInput;
}

void player_init(void) {
    if (ma_engine_init(NULL, &engine) == MA_SUCCESS) {
        is_initialized = 1;
        printf("Audio engine initialized\n");
        fflush(stdout);
    } else {
        printf("Failed to initialize audio engine\n");
        fflush(stdout);
    }
}

void player_cleanup(void) {
    stop_stream();
    if (is_loaded) {
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }
    if (is_initialized) {
        ma_engine_uninit(&engine);
        is_initialized = 0;
    }
    if (stream_data.buffer) free(stream_data.buffer);
    printf("Audio player cleaned up\n");
    fflush(stdout);
}

void play_song(const char *filename) {
    if (!is_initialized) {
        printf("Audio engine not initialized\n");
        fflush(stdout);
        return;
    }

    stop_stream();

    if (is_loaded) {
        ma_sound_stop(&sound);
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }

    if (ma_sound_init_from_file(&engine, filename, 0, NULL, NULL, &sound) != MA_SUCCESS) {
        printf("Failed to load: '%s'\n", filename);
        fflush(stdout);
        return;
    }

    is_loaded = 1;
    ma_sound_set_volume(&sound, current_volume);
    ma_sound_start(&sound);
    printf("Started playing: %s\n", filename);
    fflush(stdout);
}

void stop_song(void) {
    stop_stream();

    if (!is_loaded) {
        printf("No song loaded to stop\n");
        fflush(stdout);
        return;
    }

    ma_sound_stop(&sound);
    ma_sound_seek_to_pcm_frame(&sound, 0);
    printf("Song stopped\n");
    fflush(stdout);
}

void pause_resume_song(void) {
    if (is_streaming) {
        if (!stream_data.paused) {
            stream_data.paused = 1;
            printf("Stream paused\n");
        } else {
            stream_data.paused = 0;
            printf("Stream resumed\n");
        }
        fflush(stdout);
        return;
    }

    if (!is_loaded) {
        printf("No song loaded to pause/resume\n");
        fflush(stdout);
        return;
    }

    if (ma_sound_is_playing(&sound)) {
        ma_sound_stop(&sound);
        printf("Song paused\n");
    } else {
        ma_sound_start(&sound);
        printf("Song resumed\n");
    }
    fflush(stdout);
}

void adjust_volume(float volume) {
    if (volume < 0.0f) volume = 0.0f;
    if (volume > 1.0f) volume = 1.0f;
    current_volume = volume;

    if (is_loaded) {
        ma_sound_set_volume(&sound, volume);
    }

    printf("Volume set to: %.1f%%\n", volume * 100);
    fflush(stdout);
}

void seek_time(float seconds) {
    if (!is_loaded) {
        printf("No song loaded to seek\n");
        fflush(stdout);
        return;
    }

    if (seconds < 0.0f) {
        printf("Invalid seek time: %.1f\n", seconds);
        fflush(stdout);
        return;
    }

    ma_uint32 sampleRate;
    if (ma_sound_get_data_format(&sound, NULL, NULL, &sampleRate, NULL, 0) != MA_SUCCESS) {
        printf("Failed to get sample rate for seeking\n");
        fflush(stdout);
        return;
    }

    ma_uint64 frame = (ma_uint64)(seconds * sampleRate);
    ma_sound_seek_to_pcm_frame(&sound, frame);
    printf("Seeked to: %.1f seconds\n", seconds);
    fflush(stdout);
}

void set_playback_speed(float speed) {
    if (!is_loaded) {
        printf("No song loaded to adjust speed\n");
        fflush(stdout);
        return;
    }

    if (speed < 0.1f) speed = 0.1f;
    if (speed > 4.0f) speed = 4.0f;
    ma_sound_set_pitch(&sound, speed);
    printf("Playback speed set to: %.1fx\n", speed);
    fflush(stdout);
}

void show_status(void) {
    if (is_streaming) {
        float seconds = (float)stream_data.frames_read / 44100.0f;
        printf("Playing: %s\n", stream_playing && !stream_data.paused ? "Yes" : "No");
        printf("Position: %.1f sec\n", seconds);
        printf("Volume: %.1f%%\n", current_volume * 100);
        fflush(stdout);
        return;
    }

    if (!is_loaded) {
        printf("No song loaded\n");
        printf("Playing: No\n");
        printf("Position: 0.0 sec\n");
        printf("Volume: %.1f%%\n", current_volume * 100);
        fflush(stdout);
        return;
    }

    printf("Playing: %s\n", ma_sound_is_playing(&sound) ? "Yes" : "No");

    ma_uint64 cur;
    ma_uint32 rate;
    if (ma_sound_get_cursor_in_pcm_frames(&sound, &cur) == MA_SUCCESS &&
        ma_sound_get_data_format(&sound, NULL, NULL, &rate, NULL, 0) == MA_SUCCESS) {
        printf("Position: %.1f sec\n", (float)cur / rate);
    } else {
        printf("Position: 0.0 sec\n");
    }

    ma_uint64 len;
    if (ma_sound_get_length_in_pcm_frames(&sound, &len) == MA_SUCCESS &&
        ma_sound_get_data_format(&sound, NULL, NULL, &rate, NULL, 0) == MA_SUCCESS) {
        printf("Length: %.1f sec\n", (float)len / rate);
    } else {
        printf("Length: 0.0 sec\n");
    }

    printf("Volume: %.1f%%\n", ma_sound_get_volume(&sound) * 100);
    fflush(stdout);
}

void stream_url(const char *url) {
    if (!is_initialized) {
        printf("Audio engine not initialized\n");
        fflush(stdout);
        return;
    }

    stop_stream();

    if (is_loaded) {
        ma_sound_stop(&sound);
        ma_sound_uninit(&sound);
        is_loaded = 0;
    }

    char cmd[2048];
#ifdef _WIN32
    const char* yt_dlp = "./bin/yt-dlp.exe";
    const char* ffmpeg = "./node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe";
#elif defined(__APPLE__)
    const char* yt_dlp = "./bin/yt-dlp_macos";
    const char* ffmpeg = "./node_modules/@ffmpeg-installer/darwin-x64/ffmpeg";
#else
    const char* yt_dlp = "./bin/yt-dlp_linux";
    const char* ffmpeg = "./node_modules/@ffmpeg-installer/linux-x64/ffmpeg";
#endif

#ifdef _WIN32
    snprintf(cmd, sizeof(cmd),
        "%s -f \"ba[ext=m4a]/ba/bestaudio\" -o - \"%s\" "
        "--no-playlist --no-cache-dir --geo-bypass "
        "--no-warnings --quiet --no-progress --no-mtime | "
        "%s -hide_banner -loglevel error -i pipe: "
        "-f s16le -acodec pcm_s16le -ar 44100 -ac 2 pipe:",
        yt_dlp, url, ffmpeg);
#elif defined(__APPLE__)
    snprintf(cmd, sizeof(cmd),
        "%s -f \"ba[ext=m4a]/ba/bestaudio\" -o - \"%s\" "
        "--no-playlist --no-cache-dir --geo-bypass "
        "--no-warnings --quiet --no-progress --no-mtime | "
        "%s -hide_banner -loglevel error -i pipe:0 "
        "-f s16le -acodec pcm_s16le -ar 44100 -ac 2 pipe:1",
        yt_dlp, url, ffmpeg);
#else
    snprintf(cmd, sizeof(cmd),
        "%s -f \"ba[ext=m4a]/ba/bestaudio\" -o - \"%s\" "
        "--no-playlist --no-cache-dir --geo-bypass "
        "--no-warnings --quiet --no-progress --no-mtime | "
        "stdbuf -oL -eL %s -hide_banner -loglevel error -i pipe:0 "
        "-f s16le -acodec pcm_s16le -ar 44100 -ac 2 pipe:1",
        yt_dlp, url, ffmpeg);
#endif

    stream_pipe = popen(cmd, "r");
    if (!stream_pipe) {
        printf("Failed to start stream pipeline\n");
        fflush(stdout);
        return;
    }

    stream_data.pipe = stream_pipe;
    stream_data.frames_read = 0;
    stream_data.paused = 0;
    stream_data.buffer_filled = 0;
    stream_data.buffer_pos = 0;
    stream_playing = 1;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_s16;
    config.playback.channels = 2;
    config.sampleRate = 44100;
    config.dataCallback = stream_callback;
    config.pUserData = &stream_data;

    if (ma_device_init(NULL, &config, &stream_device) != MA_SUCCESS) {
        printf("Failed to initialize stream device\n");
        pclose(stream_pipe);
        stream_pipe = NULL;
        fflush(stdout);
        return;
    }

    if (ma_device_start(&stream_device) != MA_SUCCESS) {
        printf("Failed to start stream device\n");
        ma_device_uninit(&stream_device);
        pclose(stream_pipe);
        stream_pipe = NULL;
        fflush(stdout);
        return;
    }

    is_streaming = 1;
    printf("Started streaming: %s\n", url);
    fflush(stdout);
}

static void stop_stream(void) {
    if (!is_streaming) return;

    ma_device_uninit(&stream_device);

    if (stream_pipe) {
        pclose(stream_pipe);
        stream_pipe = NULL;
    }

    stream_data.frames_read = 0;
    stream_data.paused = 0;
    stream_data.buffer_filled = 0;
    stream_data.buffer_pos = 0;
    stream_playing = 0;
    is_streaming = 0;
    printf("Stream stopped\n");
    fflush(stdout);
}

int main() {
    setbuf(stdout, NULL);

    printf("Audio player starting...\n");
    fflush(stdout);

    player_init();

    char line[512];
    printf("Ready for commands\n");
    fflush(stdout);

    while (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        if (len > 0 && (line[len-1] == '\n' || line[len-1] == '\r')) {
            line[len-1] = '\0';
            len--;
        }
        if (len > 1 && (line[len-1] == '\n' || line[len-1] == '\r')) {
            line[len-1] = '\0';
        }

        printf("Received command: '%s'\n", line);
        fflush(stdout);

        if (strncmp(line, "play ", 5) == 0) {
            play_song(line + 5);
        } else if (strncmp(line, "stream ", 7) == 0) {
            stream_url(line + 7);
        } else if (strncmp(line, "stop", 4) == 0) {
            if (is_streaming) stop_stream();
            else stop_song();
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
            printf("Quitting...\n");
            fflush(stdout);
            break;
        } else {
            printf("Unknown command: '%s'\n", line);
            fflush(stdout);
        }
    }

    player_cleanup();
    return 0;
}