import sys
from pytubefix import Playlist # Gives playlist elements as an array

if len(sys.argv) > 1:
    try:
        playlist_url = sys.argv[1]
        playlist = Playlist(playlist_url)
        video_urls = playlist.video_urls
        print(video_urls)
    except Exception as e:
        print(({"error": f"Error: {e}"}))
else: 
    print("Error, not enough arguments.")