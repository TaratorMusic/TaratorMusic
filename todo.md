## Coming Soon App Features
---
Streaming song customisation modal:

-   Name
-   Thumbnail
-   Genre
-   Artist
-   Language
-   Volume (Coming Soon)
-   Speed (Coming Soon)
-   Add to Database
-   Download
---

-   Make song progress 00:00 when you start a streamed song. Also make the total song time from fullSong.length
-   Add enter button & refresh button with no functionality for now.
-   Stream seeking not working
-   Search for TODO
-   Listened songs should get their data in the songs table --> At playMusic(), if songId not in songs, create a new row
-   Make an alertModal() for yt rate limits, and in-app rate limits for fetching
-   The stream & recommendations search bar will just YTSR. But you will need to press enter so need a button for that. Will be disabled while in offline mode.
-   Make refresh button disabled on stream and offline modes, make page mode select & its buttons disabled while in recommendations mode

-   When you swap from recommendations mode while songs are loading, you cant
-   Make edit mode specific to streamed videos (less editing)
-   Add "not interested" to customise modal. Which should exclude it from playing unless directly played.
-   When a song is downloaded, check if the DB has its link as an id, if there is, just overwrite the information
-   getRecommendations backup songs if there is no data
-   Add refresh recommendations button

-   Learn how to stream using ytdlp binary and miniaudio
-   add stream function to miniaudio wrapper
-   Make sure the data is saved to the timers table and songs table etc.

-   After each download - song play, check if song has a new artist, if yes grab its similar artists (run getRecommendations time to time)
-   Fetch recommendations data function currently never ran. Make it run if the table doesnt exist (but need to prevent early closing somehow)
-   playlists_formed not working and not in statistics
-   ytsr breaks so often because of youtube limits, switch to my Go version maybe alongside ytpl
-   does playlist thumbnail changing work?
-   Playing playlist songs are very broken
-   Do long songs have a skipping problem? (5secs)
-   Create recommendations cache so it fetches everything once
-   If the user freshly installed an update, make sure to refresh the bin folder (use commented version change line in renderer)
-   to stats db: last time recommendations db is refreshed (refresh it each month)
-   Compile for windows and mac binaries too
-   Just jump to 1.8.0 after all of these

### Big updates remaining:

-   Integrate Discord bot that plays the music
-   File conversions, in-app, both music and thumbnail files
-   Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - For this setting, and a button to reset all the points.
-   Customise bass, treble etc. in the customisation modal, or leave them as generic, or customise them whole in the settings page.
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.

### Planned Features

-   improve search section in the download modal. Add "amount of songs to search" and the ability to download them individually, and improve styling
-   New shortcut --> CTRL + G to search something, and the app will shuffle between the found results
-   Add approximate time remaining for volume stabilisation.
-   Hover songs for the full song name?
-   Need to have full online & full offline modes
-   Add an option to toggle volume stabilisation for the song, and pre-set artist-language-genre info in the download options
-   Add song to queue
-   the app assumes 3 boxes height for each device. Calculate the row amount based on #content height
-   does the db cleaning truly work?
-   Error deciphering formats: Error: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20) Stream error: No playable formats found download_music:922 --> Probably caused by lost internet connection, need a way to restart the downloads
-   Make the db saves non-blocking
-   Make the charts on song listen time instead of song amounts perhaps? or toggle
-   Most Listened Playlist and other playlist data in Statistics
-   Add pages to the music tab and a way to navigate between them if using "show x rows".
-   If the SQL query to search songs couldnt find the song, use the check_dupe_songs.go, which will return the closest song (still give points, and return nothing if under 0.7)
-   Make quick search modal shortcut customisable
-   Compile go & C binaries at github actions and gitignore them. Compile only the needed ytdlp binary.

-   Make three-way & two-way & one-way modal functions into one, because it wastes so much space
-   Data-tooltip on the action buttons are not working
-   Use our check_dupe_songs go file while downloading songs to avoid duplications
-   What if the restart wasnt needed after downloading the assets, we can just force reload the app, or load the missing assets individually
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Redesign main menu- Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)
-   Rework the download modal and three-way modal

-   Rewrite downloading sections in Go
-   Customise Discord Rich Presence box in the settings
-   Edit app font
-   If currently listening to a music outside a playlist, enter a playlist that the song is in without changing the song / its progress
-   Add the .desktop and the wrapper script inside the app, it will run if the app is AppImage and the user doesnt have the wrapper script in the folder.
-   Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)
-   Ability to download from 0. to x. song, or x. song to y. song, or y. song to the end while downloading a playlist.
-   Use main speed - Use custom speed for this song (in customisation modal)
-   Changing backgrounds: Make a preview mode so it doesn't instantly change it
-   Merge playlists
-   Paste song thumbnails from the clipboard.
-   Exclude songs from shuffles (Not interested button, could be in the bottom right, or in the customisation modal, or both)
-   In the customisation modal, give an option to search a thumbnail from youtube, with multiple options
-   Use CSS Clamp in the controls bar for preventing overlapping
-   Multi select in the music tab for customising multiple songs
-   Hidden icon
-   Add "drag and drop" features
-   Sounds after a download is over --> Toggleable in the settings
-   Search bar in the settings
-   Configure how the songs are played: True Random - Weight to most played songs - Weight to least played songs
-   Customise the progress and audio bar, both colors and circle icon
-   More placeholder photos
-   Customisable scrollbars maybe
-   App language
-   Make all mpris stuff work
-   Edit My Music grid
-   Also it would be great if connecting the song data to last.fm is possible
-   Disable thumbnails
-   Change placeholder thumbnail --> if (userPlaceholderThumbnail) else (placeholderThumbnail)
-   Move app folders
-   Set time zone preference
-   Make splash screen better & cooler
-   Package Data to Desktop
-   Could save data online
-   Add cool animations
-   Clip songs to cut out empty parts automatically?
