# TaratorMusic

![tarator512_icon](https://github.com/user-attachments/assets/beb57a59-adab-411e-b2ef-723fd4d97997)

## Why TaratorMusic?

- Free and open source
- No ads
- Usable offline
- Download your Youtube and Spotify songs and playlists
- Real song shuffling
- Quick launch time
- Many features while keeping the app light

## [LICENSE](LICENSE)

## Technologies Used

Vanilla HTML-CSS-JS for the code,

Electron to make it a desktop app, electron-updater to detect new versions and give the user the option to update,

@distube/ytdl-core and @distube/ytpl libraries for installing youtube videos, thumbnails and playlists. @distube/ytsr for searching videos in youtube.

cheerio and puppeteer to scrape song and playlist data from Spotify,

Better-SQLite3 to store most listened songs, playlists and settings data,

FFmpeg and FFprobe to automatically stabilise audio levels,

Discord Rich Presence to momentarily share listened songs in Discord

Jest and Github Actions to protect code quality and automatically roll out builds

## How to download:

-   Go to the <a href="https://github.com/Victiniiiii/TaratorMusic/releases/latest">releases tab</a> and download whichever version suits your computer.
-   .exe files are meant for Windows, .dmg files are meant for Mac, and AppImage files are meant for linux users. You dont need to download .yml or .blockmap files, they just help updating the app. You just need to run them, they are all included.
-   Tip for Linux: It will create app folders (musics, playlists, settings etc.) where the AppImage runs, so you can put it in any folder you want and create a .desktop file to run it from the desktop.
-   Make sure to contain the app files and musics inside an SSD, which will improve app speeds tremendously.
-   When a new update is available, the version box at the top right of the main menu will start lighting up. You will be able to see the new content before you choose to update the app. When you update the app for Windows and Mac needs to be reinstalled from the github page, but for Linux you can update in-app.
-   Enjoy!

## Current Features:

### Incredible Launching Speed

The launch of this app just takes 2.2 seconds! This number was taken from a computer with these specs: SATA SSD, Linux Mint, 16GB RAM, i7 7700, 2224 songs installed.

### Actual Random

The randomness of the next song in TaratorMusic has been statistically proven by Chi Square Test. In the test, 10.000 random songs have played after each other, and the test was successful even at 0.01 significance level.  

### Download Your Own

In this app, you can easily paste a link in the download section, change its name or thumbnail, and press download to make the music and its thumbnail appear in your folders. Works for playlists too! Or you can just carry your own mp3 files to the musics folder, and their thumbnails to the thumbnails folder.  

### Customisation

You can customise everything starting from the app itself, the musics and the playlists. The music files and the playlists can be renamed, and get their thumbnails changed inside the app. The settings tab has a high variety of options on how to change user experience.  

### Discord

This app is connected to Discord via Rich Presence. Thus everyone can know you are using TaratorMusic, and what song you are listening to. Although its easily toggleable inside the settings tab if you don't want it.  

### Memory Efficiency

TaratorMusic only uses 75MB per second of memory while open, 95MB per second while listening to a song, and 125 MB per second while downloading a song. The lightweightness of the app makes it suitable for computers with very low specs.

### Volume Stabilisation

You can enable and disable the volume stabilisation provided by FFmpeg package. It will help all the songs be near the same volume, eliminating the need to change the volume every new song in case they are too quiet or loud.

### Redownload All Your Songs

If you have your old databases intact, you can redownload all your songs back using a button in the settings page!

## Upcoming Features:

### Statistics

The data of how many times and for how long you listened to each song are currently in your local database, but not being used. There will be a "Statistics" page which will be similar to Spotify Wrapped, and you will be able to see all your stats there.

### Immense Playlist Control

When this feature is implemented, you will be able to customise your playlists incredibly easily, by just dragging songs between playlists, cloning playlists, selecting your songs just like you are in a file manager!

### Pause Your Downloads, Continue Anytime

Why not pause the long playlist download and continue later? Won't be that hard to implement.

### Customise the songs by editing basses, drums, etc.

You will be able to customise every aspect of a song using FFmpeg in the future.

### Apple Music Support

Apple Music URL's will be available in the future just like Spotify URL's.

### Automatic Playlist Forming

You will be able to form playlists automatically, depending on songs' names' languages, or song types, using lightweight machine learning.

### Improved Shuffle Customisation

In the future, there will be an option to active "Improved Shuffle Customisation", which will learn from how much you listened to each song and by how long, and will weight the shuffle in the advantage of more listened songs. The "weight" will be customisable for each song easily, if you want to take or give weight to certain songs.

### Customise your Discord Rich Presence

The option to fully customise the rich presence will be given to the users in the near future.

### Stream songs directly to Discord voice chat via a bot

You will be able to stream your songs directly to voice chats only using in-app features.

### And more!

You can contact me and suggest more improvements and i will do my best implementing them. Or send a pull request.

## Screenshots:

### Yes, the UI doesn't look that good yet.
I will focus on the designs after implementing the features planned, since they can change anytime, it would take too much time redesigning.   
Currently just focusing on adding as many features as possible.

<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/6ceb7ca6-1d86-43db-a7c2-d710cf1b943b" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/e478dcf1-1c98-43f6-99ea-19b664eefb5c" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/9d080d17-e830-476d-887f-e74a9f2f7c1a" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/0af91765-0663-421e-b253-3b3577aa1cf3" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/271b74a4-19e9-43a5-8802-5f5da965f1e3" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/3a48bc2e-0382-4ebe-aac6-feb28615a9aa" />