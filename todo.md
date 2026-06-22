### Version 1.8.8 Planned Features

-   In lyrics modal, wish to save? on close button.
-   Lyrics modal should open for a specific song id instead of playing songs ID
-   Auto translate feature will be inside the create new translation modal
-   translate lyrics automatic function (check gpt star)
-   Lyrics should support multiple languages (next to each other, two boxes, different font color maybe, pick the language at the top)
-   MERGE Customisation modal and lyrics modal???? && ability to make the lyrics part bigger in height.
-   Auto pick if a translation exists upon opening the customisation modal

-   What happens when you close the download modal by the X button while downloading?
-   - Just add a cancel button instead.
-   - Remove the x button.
-   - That will cancel the current downloads and clean the modal.
-   - Download modal should have a search section and a download section, download section should have the thumbnail & song name/info
-   search at the same time while downloading, uses same text bar
-   New option while downloading: Start playing the song after the download is finished

-   recommendations just for a song or playlist
-   song listen data in the customisation modal
-   Statistics page is loading too slowly. Add pages inside
-   Opening a streamed song infinitely changes songs (Find out / fix the reason songs infinitely change. Happens very rarely)
-   using previous song button to rewind to the start of the song doesnt update the song timer in rich presence
-   go to x. page, also when something is searched you cant see if you are ahead (show page count, ability to pick page count directly.)
-   page mode yön tuşları disabled olsun çalışmayacaksa
-   found text doesnt reset in search song modal after the song starts playing
-   If there is a search thing prevent recommendations taking its place upon rendermusics
-   Editing streamed songs does not refresh anything
-   Song link comparation takes playlist additions of the link to account ??

### Version 1.9.0 Planned Features
-   UI Revamp. Draw every window and prepare them for every future update. Playlists tab should get a revamp, along with every modal
-   Work with mp3 metadatas, all kind, maybe implement in instead of just extraction
-   Stream seeking not working
-   Fix streaming in windows
-   Maybe add song progress bar or volume bar or both to PiP whatevers most wanted
-   Add auto-update to ytdlp, using the command execution, Have an option to update ytdlp internally, save last update time to the DB
-   In windows there is a bug where my music search bar is empty and no songs are shown, but no errors in the console
-   Add song to queue, Customisable queue list with drag and drop (similar to youtube)
-   Some streamed songs dont have thumbnails in menus
-   tooltip spawns wrongly then gets fixed afterwards
-   Customise Dc Rich Presence box in the settings
-   search song'da az şarkı bulursa yön tuşları ile thumbnail ve isme göre seçme olsun. ayrıca ararken benzer harfleri de alsın durdevdan
-   keeping the music tab open is lagging
-   auto form playlist from artist-genre-language
-   Lyrics storage for picture in picture
-   Add a progress bar in the lyrics page. Maybe use soundwaves?
-   Search code for TODO'S

### Big updates remaining:

-   Integrate Dc bot that plays the music
-   File conversions, in-app, both music and thumbnail files
-   Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - For this setting, and a button to reset all the points.
-   Customise bass, treble etc. in the customisation modal, or leave them as generic, or customise them whole in the settings page.
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.

### Planned Features

-   Add sorting to the music tab. But each category will have a blob background with different color
-   PiP bugs out when main process is minimised
-   refresh recommendations table each month (Needs to re-do all rows)
-   The "x" button in modals should close that modal, not the modal with the highest z-index
-   A key + right click to do stuff with songs (add to favorites, delete, etc.)
-   Add a window, where in the left side you can see your songs and you can filter them via a search bar and sort them, on the right side there will be the playlists, and the users will be able to drag and drop all the songs to the playlists they desire.
-   improve search section in the download modal. Add "amount of songs to search" and the ability to download them individually, and improve styling
-   Add approximate time remaining for volume stabilisation.
-   Hover songs for the full song name?
-   Need to have full online & full offline modes
-   Add an option to toggle volume stabilisation for the song
-   the app assumes 3 boxes height for each device. Calculate the row amount based on #content height
-   Error deciphering formats: Error: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20) Stream error: No playable formats found download_music:922 --> Probably caused by lost internet connection, need a way to restart the downloads
-   Most Listened Playlist and other playlist data in Statistics
-   If the SQL query to search songs couldnt find the song, use the check_dupe_songs.go, which will return the closest song (still give points, and return nothing if under 0.7)

-   Make three-way & two-way & one-way modal functions into one, because it wastes so much space
-   Use our check_dupe_songs go file while downloading songs to avoid duplications
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Redesign main menu
-   Change the info fetch Go script, so its a daemon, and you can queue the songs on it (or fetch individual songs)
-   Rework the download modal and three-way modal

-   Edit app font
-   If currently listening to a music outside a playlist, enter a playlist that the song is in without changing the song / its progress
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
-   Move app folders / add more music folders
-   Set time zone and time format preference
-   Make splash screen better & cooler
-   Package Data to Desktop + ability to repackage from a folder
-   Could save data online
-   Add cool animations
-   Clip songs to cut out empty parts automatically?
