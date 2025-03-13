from pytubefix import Playlist
import sys
import json # Gets Youtube playlist video titles

if len(sys.argv) > 1:
    try:
        playlist_url = sys.argv[1]
        playlist = Playlist(playlist_url)
        playlist_title = playlist.title
        video_titles = [playlist_title] + [video.title for video in playlist.videos]
        print(json.dumps(video_titles))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
else:
    print(json.dumps({"error": "No YouTube playlist URL provided"}))
