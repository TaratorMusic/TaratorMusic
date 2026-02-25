
### Version 1.8.2 Planned Features

-   Adding to playlist after downloading a song is not working
-   Merge stream and discovery modes
-   Fix playlists not getting edited after adding a song (and probably removing) while playPlaylist is running --> Maybe refresh the playlist variable every time playMusic starts using current playlist id
-   New shortcut --> x to search something, and the app will shuffle between the found results
-   Add shortcut of c for playlist with inputted name (or the closest, can use check_dupe_songs.go or a new Go binary or just SQL?)
-   new readme images

### Version 1.8.3 Planned Features

-   Some songs magically change ID's i dont know what causes it though
-   Dont check for song info if all three values are already filled
-   Fix streamed songs ids glitching inside playlists
-   Fetch song recommendations always finds the same number, is it saving it to the db?
-   Fix the song timer continuing while the streamed song is loading, and not resetting instantly to 0 on song change
-   Add search queries like || && ! "" + ,
-   Add auto-update to ytdlp, using the command execution, Have an option to update ytdlp internally, save last update time to the DB
-   Fix app resizing removing all recommendations-fetched songs
-   Search code for TODO'S
-   Stream seeking not working

### Big updates remaining:

-   Integrate Discord bot that plays the music
-   File conversions, in-app, both music and thumbnail files
-   Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - For this setting, and a button to reset all the points.
-   Customise bass, treble etc. in the customisation modal, or leave them as generic, or customise them whole in the settings page.
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.

### Planned Features

-   Work with mp3 metadatas, all kind, maybe implement in instead of just extraction
-   If the app is pre-release, the version button doesnt light up
-   refresh recommendations table each month (Needs to re-do all rows)
-   initialiseSettingsDatabase has duplicate code
-   The "x" button in modals should close that modal, not the modal with the highest z-index
-   A key + right click to do stuff with songs (add to favorites, delete, etc.)
-   Some songs silently fail loading (probably age-restricted)
-   Customisable queue list with drag and drop (similar to youtube)
-   Add a window, where in the left side you can see your songs and you can filter them via a search bar and sort them, on the right side there will be the playlists, and the users will be able to drag and drop all the songs to the playlists they desire.
-   improve search section in the download modal. Add "amount of songs to search" and the ability to download them individually, and improve styling
-   Add approximate time remaining for volume stabilisation.
-   Hover songs for the full song name?
-   Need to have full online & full offline modes
-   Add an option to toggle volume stabilisation for the song
-   Add song to queue
-   the app assumes 3 boxes height for each device. Calculate the row amount based on #content height
-   does the db cleaning truly work?
-   Error deciphering formats: Error: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20) Stream error: No playable formats found download_music:922 --> Probably caused by lost internet connection, need a way to restart the downloads
-   Make the db saves non-blocking
-   Most Listened Playlist and other playlist data in Statistics
-   If the SQL query to search songs couldnt find the song, use the check_dupe_songs.go, which will return the closest song (still give points, and return nothing if under 0.7)

-   Make three-way & two-way & one-way modal functions into one, because it wastes so much space
-   Data-tooltip on the action buttons are not working
-   Use our check_dupe_songs go file while downloading songs to avoid duplications
-   What if the restart wasnt needed after downloading the assets, we can just force reload the app, or load the missing assets individually
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Redesign main menu
-   Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)
-   Rework the download modal and three-way modal

-   Customise Discord Rich Presence box in the settings
-   Edit app font
-   If currently listening to a music outside a playlist, enter a playlist that the song is in without changing the song / its progress
-   Add the .desktop and the wrapper script inside the app, it will run if the app is AppImage and the user doesnt have the wrapper script in the folder. Create a button in settings to create .desktop
-   Ability to download from 0. to x. song, or x. song to y. song, or y. song to the end while downloading a playlist.
-   Use main speed - Use custom speed for this song (in customisation modal)
-   Changing backgrounds: Make a preview mode so it doesn't instantly change it
-   Merge playlists
-   Paste song thumbnails from the clipboard.
-   In the customisation modal, give an option to search a thumbnail from youtube, with multiple options
-   Use CSS Clamp in the controls bar for preventing overlapping
-   Multi select in the music tab for customising multiple songs
-   Hidden icon
-   Sounds after a download is over --> Toggleable in the settings
-   Search bar in the settings
-   Switch to Golang for ytpl&ytsr (ytpl-ytsr-go)
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
-   Set time zone and time format preference
-   Make splash screen better & cooler
-   Package Data to Desktop
-   Could save data online
-   Add cool animations
-   Clip songs to cut out empty parts automatically?
