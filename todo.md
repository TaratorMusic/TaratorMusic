## Needed UI Redesigns

### Downloads tab

The div's arent even aligned, and its just pure HTML

### Main Menu

Not exactly sure what to do yet, but the main will definitely be reworked

### Three way modal

It looks terrible :/

## Bugs

-   Error deciphering formats: Error: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20) Stream error: No playable formats found download_music:922 --> Probably caused by lost internet connection, need a way to restart the downloads

## Coming Soon App Features

- // TODO: UNLIMITED EVENTLISTENERS IN LINE 500 something "resize"
-   When something is searched in the my music tab, and its results are shorter than a page, the grid acts weirdly
-   When a song is renamed, it doesnt get renamed in the cache. --> NO NEED TO SCROLL ALL THE WAY UP ON DATA CHANGE
-   While searching for songs in "My Music" tab, make a setting for the search, "All, only songs, artists, genre, language"

### Version 1.7.7:

-   Use deezer api for similar songs data, and save them to the DB. It will search for top 5 similar songs while downloading. It should work with the ystr(song_link) instead of the song name. We will give points to the similar songs like 5 4 3 2 1, and add up these for all the songs in our library to find the best recommendations.
-   Add song to queue
-   Make the charts on song listen time instead of song amounts perhaps? or toggle
-   Most Listened Playlist and other playlist data in Statistics
-   Add pages to the music tab and a way to navigate between them if using "show x rows".
-   If the SQL query to search songs couldnt find the song, use the check_dupe_songs.go, which will return the closest song (still give points, and return nothing if under 0.7)
-   Make quick search modal shortcut customisable

### Version 1.7.8+:

-   Make three-way & two-way & one-way modal functions into one, because it wastes so much space
-   Data-tooltip on the action buttons are not working
-   Use our check_dupe_songs go file while downloading songs to avoid duplications
-   What if the restart wasnt needed after downloading the assets, we can just force reload the app, or load the missing assets individually
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Redesign main menu

### Planned Features

-   Rewrite downloading sections in Go
-   Customise Discord Rich Presence box in the settings
-   Edit app font
-   Add the .desktop and the wrapper script inside the app, it will run if the app is AppImage and the user doesnt have the wrapper script in the folder.
-   Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)
-   Add approximate time remaining for volume stabilisation and downloads.
-   Integrate Discord bot that plays the music
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.
-   Ability to download from 0. to x. song, or x. song to y. song, or y. song to the end while downloading a playlist.
-   Use main speed - Use custom speed for this song (in customisation modal)
-   Changing backgrounds: Make a preview mode so it doesn't instantly change it
-   Customise bass, treble etc. in the customisation modal, or leave them as generic, or customise them whole in the settings page.
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
-   Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - For this setting, and a button to reset all the points.
-   Directly stream songs without downloading.
-   Configure how the songs are played: True Random - Weight to most played songs - Weight to least played songs
-   File conversions, in-app, both music and thumbnail files
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
-   Package Data to Desktop
-   Could save data online