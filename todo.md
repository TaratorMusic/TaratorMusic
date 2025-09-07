## Needed UI Redesigns

### Downloads tab

The div's arent even aligned, and its just pure HTML

### Main Menu

Not exactly sure what to do yet, but the main will definitely be reworked

### Three way modal

It looks terrible :/

## Bugs

-   Mysterious error in the console: Cannot read properties of undefined (reading 'thumbnail_extension') (Happens after deleting songs) (Not dangerous)

## Coming Soon App Features

Listen Amount - Listen Count - First Listen - Last Listen

Add search bar in the playlists tab and style the create new playlist button
Redesign main menu cuz we will be moving the time spent in app to the statistics page

SEARCH FOR TODOS IN THE SCRIPT

Import the lastfm api and language npm package
Use beep in Go
Separate the imports in the download script for faster launch times
Make three-way & two-way & one-way modal functions into one, because it wastes so much space
Need scrollbars in my music and playlists tab
Data-tooltip on the action buttons are not working

### Planned Features

-   Customise Discord Rich Presence box in the settings
-   Make quick search modal shortcut customisable
-   Add song to queue
-   Add approximate time remaining for volume stabilisation and downloads.
-   Add link customisation to the customisation modal
-   Integrate Discord bot that plays the music
-   Pause downloads, continue anytime: use localstorage --> It should notify the user when the app is restarted that a download is mid-way.
-   Ability to download from 0. to x. song, or x. song to y. song, or y. song to the end while downloading a playlist.
-   Use main speed - Use custom speed for this song (in customisation modal)
-   Changing backgrounds: Make a preview mode so it doesn't instantly change it
-   Use light ML library to check languages
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
-   Use last.fm API to find similar songs and artists. It will search for top 5 similar songs while downloading. It should work with the ystr(song_link) instead of the song name. We will give points to the similar songs like 5 4 3 2 1, and add up these for all the songs in our library to find the best recommendations.
-   Directly stream songs without downloading.
-   Stabilise song and check song data in the customisation modal
-   Configure how the songs are played: True Random - Weight to most played songs - Weight to least played songs
-   File conversions, in-app, both music and thumbnail files
-   check the MusicBrainz API
-   Customise the progress and audio bar, both colors and circle icon
-   More placeholder photos
-   Rewrite download and rich presence sections in Go
-   Add pages to the music tab and a way to navigate between them if using "show x rows".
-   Add "Stabilise All" and "Categorise All" at the top of My Music tab
-   Customisable scrollbars maybe
-   App language
-   Edit app font
-   Edit My Music grid
-   Disable thumbnails
-   Change placeholder thumbnail --> if (userPlaceholderThumbnail) else (placeholderThumbnail)
-   Move app folders
-   Package Data to Desktop
-   Factory Reset (With options like: only settings, remove all songs/playlists etc.)
-   Could save data online

### Tests

-   Need to setup electron tests via playwright
-   jest tests to test the usual stuff
-   go tests to test the backend --> use "exec" to run the files and expect correct output
