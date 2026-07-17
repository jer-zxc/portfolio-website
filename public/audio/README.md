# Audio slots

Drop these files in here to enable sound (wired up in `src/main.js`):

* `background-music.mp3` — looping background track, on by default. Browsers block autoplay-with-sound until a user gesture, so it actually starts on the first click/keypress anywhere on the page if it hasn't already. Click `interact_volume` in the scene to mute/unmute.
* `hover1.mp3` — short blip played whenever the pointer hovers one of the whitelisted `interact_*` props (see `hoverSoundGroupKeys` in `main.js`: 1, 2, 3, about, me, z, x, c, home, f12, light, esc, control_creature, caps, shift, control, windows, alt, volume).

Until real files are dropped in, playback and hover events still fire but `play()` just rejects quietly - no console errors, no crash.
