from pytubefix import YouTube
import sys
import requests # Gets Youtube video thumbnail

if len(sys.argv) > 1:
    url = sys.argv[1]
    try:
        yt = YouTube(url, 'WEB')
        qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']
        
        for quality in qualities:
            thumbnail_url = f'https://img.youtube.com/vi/{yt.video_id}/{quality}.jpg'
            response = requests.head(thumbnail_url)
            if response.status_code == 200:
                print(thumbnail_url)
                break
        else:
            print("No thumbnail found for the provided YouTube URL")    
    except Exception as e:
        print(str(e))
else:
    print("No YouTube URL provided")