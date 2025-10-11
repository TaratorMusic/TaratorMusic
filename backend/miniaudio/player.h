#pragma once
#ifdef __cplusplus
extern "C" {
#endif
void player_init(void);
void player_cleanup(void);
void play_song(const char *filename);
void stop_song(void);
void pause_resume_song(void);
void adjust_volume(float volume);
void seek_time(float seconds);
void set_playback_speed(float speed);
void show_status(void);
void stream_url(const char *url);
#ifdef __cplusplus
}
#endif