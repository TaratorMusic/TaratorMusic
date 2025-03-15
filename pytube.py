from pytubefix import YouTube, Playlist
import sys
import json
import os
import requests
import base64

script_name = os.path.basename(sys.argv[1])

if script_name == "Title":
    if len(sys.argv) > 2:
        try:
            yt = YouTube(sys.argv[2])
            title = yt.title
            result = json.dumps(title)
        except Exception as e:
            result = json.dumps({"error": str(e)})
    else:
        result = json.dumps({"error": "No YouTube URL provided"})

elif script_name == "Thumbnail":
    if len(sys.argv) > 2:
        try:
            yt = YouTube(sys.argv[2], 'WEB')
            qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']
            
            for quality in qualities:
                thumbnail_url = f'https://img.youtube.com/vi/{yt.video_id}/{quality}.jpg'
                response = requests.head(thumbnail_url)
                if response.status_code == 200:
                    result = thumbnail_url
                    break
            else:
                result = "No thumbnail found for the provided YouTube URL"
        except Exception as e:
            result = str(e)
    else:
        result = "No YouTube URL provided"

elif script_name == "PlaylistTitle":
    if len(sys.argv) > 2:
        try:
            playlist = Playlist(sys.argv[2])
            playlist_title = playlist.title
            video_titles = [playlist_title] + [video.title for video in playlist.videos]
            result = json.dumps(video_titles)
        except Exception as e:
            result = json.dumps({"error": str(e)})
    else:
        result = json.dumps({"error": "No YouTube playlist URL provided"})

elif script_name == "PlaylistThumbnail":
    if len(sys.argv) > 2:
        try:
            playlist = Playlist(sys.argv[2])
            thumbnails = []
            
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
            
            result = json.dumps([thumbnails[0]] + thumbnails[1:])
        except Exception as e:
            result = json.dumps({"error": str(e)})
    else:
        result = json.dumps({"error": "No YouTube playlist URL provided"})

elif script_name == "DownloadMusic":
    if len(sys.argv) > 3:
        try:
            yt = YouTube(sys.argv[2])
            output_directory = os.path.join(os.path.dirname(__file__), 'musics')
            os.makedirs(output_directory, exist_ok=True)
            yt.streams.filter(only_audio=True).first().download(output_path=output_directory, filename=f"{sys.argv[3]}.mp3")
            result = json.dumps({"Success": "Everything has been downloaded"})
        except Exception as e:
            result = json.dumps({"Error": str(e)})
    else:
        result = json.dumps({"error": 'Insufficient arguments received. Need URL and filename.'})

elif script_name == "DownloadThumbnail":
    if len(sys.argv) > 3:
        try:
            output_dir = os.path.join(os.path.dirname(__file__), 'thumbnails')
            os.makedirs(output_dir, exist_ok=True)
            new_file_name = f"{sys.argv[3]}_thumbnail.jpg"
            new_file_path = os.path.join(output_dir, new_file_name)
            
            with open(sys.argv[2], 'r') as file:
                base64_data = file.read()
                if base64_data.startswith('data:image/jpeg;base64,'):
                    base64_data = base64_data.split(',')[1]
                    
            with open(new_file_path, 'wb') as file:
                file.write(base64.b64decode(base64_data))
            
            result = json.dumps({"message": f"Thumbnail saved to: {new_file_path}"})
        except Exception as e:
            result = json.dumps({"error": f"Error: {e}"})
    else:
        result = json.dumps({"error": 'Insufficient arguments provided. Need thumbnail source URL/path and input value.'})

elif script_name == "PlaylistNames":
    if len(sys.argv) > 2:
        try:
            playlist = Playlist(sys.argv[2])
            video_urls = playlist.video_urls
            result = video_urls
        except Exception as e:
            result = {"error": f"Error: {e}"}
    else:
        result = "Error, not enough arguments."

else:
    result = json.dumps({"error": f"Unknown script type: {script_name}"})

print(result)
