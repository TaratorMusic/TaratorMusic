## Coming Soon App Features

-   Complete recommendations.js
-   My music tab will have Stream vs Downloaded mode, in Stream mode the search bar will search from youtube and there will be one page of recommendations. The edit button will be changed to download song. The listen data will still be saved to the database, but under youtube link id. When the song is downloaded, we will replace all the link id's to the tarator id. Save to the db if the user prefers downloads or streaming.

-   If the user freshly installed an update, make sure to refresh the bin folder (use commented version change line in renderer)
-   add stream function to miniaudio wrapper
-   to stats db: last time recommendations db is refreshed (refresh it each month)

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
-   Package Data to Desktop
-   Could save data online
-   Add cool animations
-   Clip songs to cut out empty parts automatically?
