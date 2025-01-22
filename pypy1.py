from pytubefix import YouTube
import sys
import json # Gets Youtube video title

if len(sys.argv) > 1:
    try:
        youtube_url = sys.argv[1]
        yt = YouTube(youtube_url, use_po_token=True)
        title = yt.title
        print(json.dumps(title))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
else:
    print(json.dumps({"error": "No YouTube URL provided"}))