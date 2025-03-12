import sys
from pytubefix import Playlist # Gives playlist elements as an array
from pytubefix.cli import on_progress

if len(sys.argv) > 1:
    try:
        playlist_url = sys.argv[1]
        playlist = Playlist(playlist_url, on_progress_callback=on_progress, client='WEB')
        video_urls = playlist.video_urls
        print(video_urls)
    except Exception as e:
        print(({"error": f"Error: {e}"}))
else: 
    print("Error, not enough arguments.")