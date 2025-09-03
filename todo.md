## Needed UI Redesigns
### Settings tab
Settings tab desperately needs some design changes, because i never designed it to begin with. It should have the categories quickly accessible (Keybinds, Customisation, Settings, and maybe more later like Discord) and smaller gaps between the setting and its description. Finally the buttons should at least be styled with CSS.

### Downloads tab
The div's arent even aligned, and its just pure HTML

### Main Menu
Not exactly sure what to do yet, but the main will definitely be reworked

### Three way modal
It looks terrible :/

## Bugs
- the seconds number is updating inconsistently, rather than updating every second. --> Switch to Go package "beep" for playing audio
- Mysterious error in the console: Cannot read properties of undefined (reading 'thumbnail_extension') (Happens after deleting songs) (Not dangerous)

## TODO App Features

### Add a scroll bar but styled (Chrome only)

### Statistics!
Statistics tab:
- Favorite Song --> FAVORITE SONG:
- Thumbnail - Name by Artist
- Language - Genre
- Listen Amount - Listen Count - First Listen - Last Listen

- Favorite Genre (TODO)
- Favorite Language (TODO)
- Favorite Artist (TODO)
Pie chart here

First ever song play time

most active day-hours with heatmaps

Total Amounts:
- x playlists formed
- x songs listened inside playlists
- x songs listened outside playlists
- x songs listened total
- x songs downloaded from youtube
- x songs downloaded from spotify
- x songs downloaded total
- x hours spent in-app and x hours this session

- HTML TABLE Sortable menu with all songs and their stats (Listen count, length, percentage listened)

### New Features
- Customise Discord Rich Presence box in the settings
- Integrate Discord bot that plays the music
- Pause downloads, continue anytime: use localstorage
- Use main speed - Use custom speed for this song (in customisation modal)
- Changing backgrounds: Make a preview mode so it doesn't instantly change it
- Intelligent shuffle: All the songs will get pointed depending on how long you listened to them (Percentages), songs with higher points will play more, there will be a toggle - for this setting, and a button to reset all the points.
- Use last.fm API to find similar songs and artists. 
- Directly stream songs without downloading.
- Configure how the songs are played: True Random - Weight to most played songs - Weight to least played songs
- Quick song search shortcut and modal

### Legacy Code Changes:
- "favorites" playlist id changed from 1 to "Favorites".
- Song listen timers moved from songs table to listens table. If a person has the old data, don't show it in first song play time or most active times chart.

### Tests
- Need to setup electron tests via playwright
- jest tests to test the usual stuff
- go tests to test the backend

### Code Cleanup
- Make three-way & two-way & one-way modal functions into one, because it wastes so much space
- Clean up the database functions
- Instead of fileToDelete, make a button inside openCustomiseModal and add addEventListener to remove the song using the song ID

### Quality of 
- Pressing enter in the download modal should press the button
- Add pages to the music tab and a way to navigate between them if using "show x rows".
- Add "Stabilise All" and "Categorise All" at the top of My Music tab
- Add approximate time remaining for volume stabilisation and downloads.
- Add link customisation to the customisation modal

### New Settings

- App language
- Edit app font
- Edit My Music grid
- Disable thumbnails
- Change placeholder thumbnail --> if (userPlaceholderThumbnail) else (placeholderThumbnail)
- Move app folders
- Package Data to Desktop
- Factory Reset (With options like: only settings, remove all songs/playlists etc.)