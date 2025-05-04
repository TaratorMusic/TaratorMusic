import sys
import os
import json
import base64
import requests
from pytubefix import YouTube, Playlist

def get_output_path(subfolder):
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(sys.executable))), subfolder)

if len(sys.argv) < 2:
    print(json.dumps({"error": "No command type provided."}), flush=True)
    sys.exit(1)

command = sys.argv[1]
args = sys.argv[2:]

result = {}

try:
    if command == "Title":
        if args:
            yt = YouTube(args[0])
            result = json.dumps(yt.title)
        else:
            result = json.dumps({"error": "No YouTube URL provided"})

    elif command == "Thumbnail":
        if args:
            yt = YouTube(args[0], 'WEB')
            qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']
            for quality in qualities:
                thumbnail_url = f'https://img.youtube.com/vi/{yt.video_id}/{quality}.jpg'
                response = requests.head(thumbnail_url)
                if response.status_code == 200:
                    result = thumbnail_url
                    break
            else:
                result = "No thumbnail found"
        else:
            result = "No YouTube URL provided"

    elif command == "PlaylistTitle":
        if args:
            playlist = Playlist(args[0])
            titles = [playlist.title] + [video.title for video in playlist.videos]
            result = json.dumps(titles)
        else:
            result = json.dumps({"error": "No playlist URL provided"})

    elif command == "PlaylistThumbnail":
        if args:
            playlist = Playlist(args[0])
            thumbnails = []
            qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']
            for video_url in playlist.video_urls:
                video_id = video_url.split("watch?v=")[-1]
                found = False
                for quality in qualities:
                    thumbnail_url = f'https://img.youtube.com/vi/{video_id}/{quality}.jpg'
                    if requests.head(thumbnail_url).status_code == 200:
                        thumbnails.append(thumbnail_url)
                        found = True
                        break
                if not found:
                    thumbnails.append("No thumbnail found")
            result = json.dumps(thumbnails)
        else:
            result = json.dumps({"error": "No playlist URL provided"})

    elif command == "DownloadMusic":
        if len(args) >= 2:
            url = args[0]
            filename = args[1]
            output_dir = get_output_path('musics')
            yt = YouTube(url)
            audio_stream = yt.streams.filter(only_audio=True).first()

            if not audio_stream:
                result = json.dumps({"error": "No audio stream found"})
            else:
                audio_stream.download(output_path=output_dir, filename=f"{filename}.mp3")
                result = json.dumps({"Success": f"Downloaded: {filename}.mp3"})
        else:
            result = json.dumps({"error": "Need YouTube URL and filename"})

    elif command == "DownloadThumbnail":
        if len(args) >= 2:
            base64_file = args[0]
            output_name = args[1]
            output_dir = get_output_path('thumbnails')
            new_file_path = os.path.join(output_dir, f"{output_name}_thumbnail.jpg")

            with open(base64_file, 'r') as f:
                base64_data = f.read()
                if base64_data.startswith('data:image/jpeg;base64,'):
                    base64_data = base64_data.split(',')[1]

            with open(new_file_path, 'wb') as out_file:
                out_file.write(base64.b64decode(base64_data))

            result = json.dumps({"message": f"Thumbnail saved to {new_file_path}"})
        else:
            result = json.dumps({"error": "Need input base64 file and output name"})

    elif command == "PlaylistNames":
        if args:
            playlist = Playlist(args[0])
            result = json.dumps(playlist.video_urls)
        else:
            result = json.dumps({"error": "No playlist URL provided"})

    else:
        result = json.dumps({"error": f"Unknown command: {command}"})

except Exception as e:
    result = json.dumps({"error": str(e)})

print(result, flush=True)