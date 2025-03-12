import os
import sys
from pytubefix import YouTube
from pytubefix.cli import on_progress
import json # Downloads musics

if len(sys.argv) > 2:
    youtube_url = sys.argv[1]
    filename = sys.argv[2]
    try:
        yt = YouTube(youtube_url, on_progress_callback=on_progress, client='WEB')
        output_directory = os.path.join(os.path.dirname(__file__), 'musics')
        yt.streams.filter(only_audio=True).first().download(output_path=output_directory, filename=f"{filename}.mp3")
        print(json.dumps({"Success": "Everything has been downloaded"}))
    except Exception as e:
        print(json.dumps({"Error": str(e)}))
else:
    print(json.dumps({"error": 'Insufficient arguments received. Need URL and filename.'}))
