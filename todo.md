### Version 1.9.x Planned Features

-   Sidebar revamp
-   Aligner doesnt work, bugged

-   Add settings modal to the my music search bar. Toggle searching by artist, genre, language, file name, and add lyrics. Add amount of songs to search there too. Move the enter button to the left of the amount of songs to search div. Move page mode scroll mode toggler to that div. 

-   Remodel customisation modal to fit better
-   UI Revamp. Draw every window and prepare them for every future update. Playlists tab should get a revamp, along with every modal
-   auto form playlist from artist-genre-language
-   A key + right click to do stuff with songs (add to favorites, delete, etc.)
-   Add approximate time remaining for volume stabilisation.
-   Most Listened Playlist and other playlist data in Statistics
-   Hover songs for the full song name?
-   Search bar in the settings

-   What happens when you close the download modal by the X button while downloading?
-   - Just add a cancel button instead.
-   - Remove the x button.
-   - That will cancel the current downloads and clean the modal.
-   - Download modal should have a search section and a download section, download section should have the thumbnail & song name/info
-   search at the same time while downloading, uses same text bar
-   improve search section in the download modal. Add "amount of songs to search" and the ability to download them individually, and improve styling
-   Error deciphering formats: Error: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20) Stream error: No playable formats found download_music:922 --> Probably caused by lost internet connection, need a way to restart the downloads
-   Ability to download from 0. to x. song, or x. song to y. song, or y. song to the end while downloading a playlist.
-   Sounds after a download is over --> Toggleable in the settings
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.
-   Ability to queue downloads

### Big updates remaining:

-   Integrate Dc bot that plays the music
-   File conversions, in-app, both music and thumbnail files
-   Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - For this setting, and a button to reset all the points. Configure how the songs are played: True Random - Weight to most played songs - Weight to least played songs
-   Customise bass, treble etc. in the customisation modal, or leave them as generic, or customise them whole in the settings page. Add speed to this category.
-   Customise Dc Rich Presence box in the settings

### Planned Features

-   Work with mp3 metadatas, all kind, maybe implement in instead of just extraction
-   Stream seeking not working
-   Staleness check on recommendations table rows
-   Add sorting to the music tab. But each category will have a blob background with different color
-   PiP bugs out when main process is minimised
-   The "x" button in modals should close that modal, not the modal with the highest z-index
-   Add a window, where in the left side you can see your songs and you can filter them via a search bar and sort them, on the right side there will be the playlists, and the users will be able to drag and drop all the songs to the playlists they desire.
-   Need to have full online & full offline modes
-   the app assumes 3 boxes height for each device. Calculate the row amount based on #content height

-   Use our check_dupe_songs go file while downloading songs to avoid duplications
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)

-   Edit app font
-   If currently listening to a music outside a playlist, enter a playlist that the song is in without changing the song / its progress
-   Use main speed - Use custom speed for this song (in customisation modal)
-   Changing backgrounds: Make a preview mode so it doesn't instantly change it
-   Merge playlists
-   Paste song thumbnails from the clipboard.
-   In the customisation modal, give an option to search a thumbnail from youtube, with multiple options
-   Use CSS Clamp in the controls bar for preventing overlapping
-   Multi select in the music tab for customising/deleting multiple songs
-   Hidden icon
-   Customise the progress and audio bar, both colors and circle icon
-   More placeholder photos
-   Customisable scrollbars maybe
-   App language
-   Make all mpris stuff work
-   Edit My Music grid
-   Also it would be great if connecting the song data to last.fm is possible
-   Disable thumbnails
-   Change placeholder thumbnail --> if (userPlaceholderThumbnail) else (placeholderThumbnail)
-   Move app folders / add more music folders
-   Set time zone and time format preference
-   Make splash screen better & cooler
-   Package Data to Desktop + ability to repackage from a folder
-   Could save data online
-   Add cool animations
-   Clip songs to cut out empty parts automatically?
