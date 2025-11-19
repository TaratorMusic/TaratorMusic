# TaratorMusic

![tarator512_icon](https://github.com/user-attachments/assets/beb57a59-adab-411e-b2ef-723fd4d97997)
[![Star History Chart](https://api.star-history.com/svg?repos=TaratorMusic/TaratorMusic&type=date&legend=top-left)](https://www.star-history.com/#TaratorMusic/TaratorMusic&type=date&legend=top-left)

## Why TaratorMusic?

-   Free and open source, no ads
-   Offline first, with online features
-   Download your Youtube and Spotify songs and playlists
-   Real song shuffling
-   Quick launch time
-   Many features while keeping the app light

## [LICENSE](LICENSE)

## Technologies Used

HTML & CSS & JavaScript for the Front-end, Node.js and Go for the Back-end

C and its miniaudio library for playing audio

Electron to make it a cross platform desktop app, electron-updater to detect new versions and give the user the option to update

@distube/ytdl-core and @distube/ytpl libraries for installing youtube videos, thumbnails and playlists. @distube/ytsr for searching videos in youtube

cheerio and puppeteer to scrape song and playlist data from Spotify

Better-SQLite3 to store most listened songs, playlists and settings data

Chart.js to show user stats in the statistics tab

MusicBrainz API to fetch song genre, artist and language information

FFmpeg and FFprobe to automatically stabilise audio levels

Discord Rich Presence to momentarily share listened songs in Discord

Github Actions to protect code quality and automatically roll out builds

## How to develop:

-   Firstly, you need NPM, Node.js and Go installed on your computer. 
-   Python might be needed for post-install (for better-sqlite3), preferably below version 3.12 (Needs distutils).
-   Secondly, you can clone the git repository to a folder of your choice.
-   Thirdly, use "npm install" to download all the node modules.
-   Lastly, use "npm start" to run the app.

## How to download:

-   Go to the <a href="https://github.com/Victiniiiii/TaratorMusic/releases/latest">releases tab</a> and download whichever version suits your computer.
-   .exe files are meant for Windows, .dmg files are meant for Mac, and AppImage files are meant for linux users. You just need to run them, they are all included. You don't need to download .yml or .blockmap files.
-   Tip for Linux: It will create app folders (musics, playlists, databases etc.) where the AppImage runs, so you can put it in any folder you want and create a .desktop file to run it from the desktop.
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

TaratorMusic only uses around 0% - 1% CPU and under 200 MB of RAM during playback. The lightweightness of the app makes it suitable for computers with very low specs.

### Volume Stabilisation

You can enable and disable the volume stabilisation provided by FFmpeg package. It will help all the songs be near the same volume, eliminating the need to change the volume every new song in case they are too quiet or loud.

### Redownload All Your Songs

If you have your old databases intact, you can redownload all your songs back using a button in the settings page!

### Instant Song Search

Thought of a song, but too bothered to go to the musics tab, search and play it? With this feature, you can use a keyboard shortcut of your choice to search for your song, and it will play the song whose name is closest to your query! (Current shortcut is: CTRL+F)

### Statistics

Interested in your listen data? The statistics tab lets you see your favorite song, favorite genres, artists and languages in pie charts, weekly and hourly listen data in heatmaps, and many more other statistics!

## Upcoming Features:

### (COMING VERY SOON) Personalised Song Recommendations

You will be able to get special song recommendations based on what songs you have listened to, and for how long.

### (COMING VERY SOON) Stream songs directly without downloading

When you just want to browse, you will be able to quickly listen to your app recommended songs.

### Automatic Playlist Forming

You will be able to form playlists automatically, depending on songs' languages, genres or artists.

### Immense Playlist Control

When this feature is implemented, you will be able to customise your playlists incredibly easily, by just dragging songs between playlists, cloning playlists, selecting your songs just like you are in a file manager!

### Pause Your Downloads, Continue Anytime

Why not pause the long playlist download and continue later?

### Customise the songs by editing basses, drums, etc.

You will be able to customise every aspect of a song using FFmpeg in the future.

### Apple Music Support

Apple Music URL's will be available in the future just like Spotify URL's.

### File conversions, in-app

The app will let you change the extensions of both your songs and thumbnails directly.

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

<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/8399a037-ff19-4934-a084-ac06b9fde19c" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/31569403-2927-42a6-8662-4435711a8b48" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/d4add7cc-9e18-4154-9229-a2cb13ae2875" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/9253008d-0028-47cf-8386-cb9408d3b587" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/a3c0ff80-55a1-4ba8-822e-7600e1a46325" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/2745601c-9764-4234-8769-50872969ba32" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/43dda80a-e324-4c7a-8ff9-900bfc6b3187" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/a519e201-184c-4517-a4ef-f85641b019c3" />
<img width="1600" height="882" alt="image" src="https://github.com/user-attachments/assets/2b6a7df6-88cf-40f9-8d11-a50e8b3e6ab4" />
