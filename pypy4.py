from pytubefix import Playlist
import sys
import requests
import json # Gets Youtube playlist video thumbnails

if len(sys.argv) > 1:
    url = sys.argv[1]
    try:
        playlist = Playlist(url)
        thumbnails = []        
        playlist_id = playlist.playlist_id
        playlist_thumbnail_url = f'I am kinda dumb'
        thumbnails.append(playlist_thumbnail_url)            
        qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']
        
        for video_url in playlist.video_urls:
            video_id = video_url.split("watch?v=")[-1]
            
            found_thumbnail = False
            for quality in qualities:
                thumbnail_url = f'https://img.youtube.com/vi/{video_id}/{quality}.jpg'
                response = requests.head(thumbnail_url)
                if response.status_code == 200:
                    thumbnails.append(thumbnail_url)
                    found_thumbnail = True
                    break
            
            if not found_thumbnail:
                thumbnails.append("No thumbnail found")            
                
        result = [thumbnails[0]] + thumbnails[1:]
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
else:
    print(json.dumps({"error": "No YouTube playlist URL provided"}))
