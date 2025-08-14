### For 1.7.0:
Finish mass skip downloads. At the start of redownloadAllSongs ask with a modal.
slice(0,-4) is a recipe for disaster. Also search for ".mp3" and ".jpg"
Both thumbnail names and extensions have the extension in the database
Playlist thumbnails use name instead of ID
Playlist thumbnails are saved as full PC routes instead of in-app routes
Add playlist thumbnail extension to the playlists database.

---

Save each songs listen data as timestamps and length in a new database table for statistics. (SAVE AS UNIX!)
Customise RPC section in the settings
Integrate DC bot that plays the music
Pause downloads, continue anytime: use localstorage
Use main speed - Use custom speed for this song (in customisation modal)
Instead of fileToDelete, make a button inside openCustomiseModal and add addEventListener to remove the song using the song ID
Merge the functions of bottom right button