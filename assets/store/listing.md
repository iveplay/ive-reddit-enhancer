# Store listing

## Single purpose

Improves browsing media on Reddit: a grid layout for feeds, a fullscreen viewer with slideshow, a media-type filter and auto-scroll.

## Permission justifications

**storage**
Saves the extension's settings (which features are on, grid columns, slideshow speed, volume) on the user's device so they persist between visits. Nothing is sent anywhere.

**Host permission: \*://\*.reddit.com/\***
The extension works on Reddit pages: it adds the grid view, viewer and filter to reddit.com, and reads Reddit's own post data (e.g. whether a video has sound) to power the media filter.

**Host permission: \*://\*.redd.it/\***
Reddit hosts its images, GIFs and videos on redd.it. The extension reads GIF files from there to know how long one loop lasts, so the slideshow moves on after a full play instead of cutting it off.

**Host permission: \*://\*.redgifs.com/\***
Many Reddit posts embed Redgifs videos. The extension runs inside those embedded players to show them in HD with sound, report the clip length to the slideshow, and pass swipes and taps through to the viewer.

**Host permission: \*://\*.imgur.com/\***
Many Reddit posts link GIFs hosted on Imgur. The extension reads those GIF files to time the slideshow the same way as for redd.it.

## Data usage

- Collects no user data. Settings are stored locally only.
- No analytics, no remote code, no third-party servers apart from the media hosts the user is already viewing.

## Remote code

No. All code is bundled in the package.
