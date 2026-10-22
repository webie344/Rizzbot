# Drop PWA

This is a static, self-hostable bundle of the Drop files supplied in chat, with
an in-app camera studio, 24 selectable filters, face-tracked overlays, short
video recording, autoplay-in-view video posts, and PWA install support.

## Before hosting

1. In `app.js`, replace the `YOUR_FIREBASE_...` and `YOUR_CLOUDINARY_...`
   placeholders in `CONFIG` with your own project settings. Set the Telegram
   bot username only if you also provide the matching Telegram module and bot.
2. In Firebase, enable Email/Password authentication, configure Firestore, and
   add your hosting domain to the authorized domains list.
3. In Cloudinary, configure an unsigned upload preset that permits both image
   and video uploads. The app stores a video URL plus a still poster on each
   video post.
4. The supplied HTML referenced `features.js`, but that original file was not
   included. The included placeholder keeps the app shell intact; replace it
   with your own original `features.js` if you need its optional features.
5. Host the folder on HTTPS (or `localhost`) and open `index.html`. Camera
   permissions and PWA installation do not work reliably from `file://`.

## Camera and filters

The first camera use requests camera permission. Microphone permission is
requested only when recording video. Still photos and 15-second video clips
are captured with the selected color treatment and face overlay baked in.
Face tracking loads MediaPipe from its public CDN the first time the camera is
opened, so the initial filter setup needs an internet connection. Camera media
is uploaded only after you press **Post**.

Video posts start muted and loop while at least 55% of the video is visible in
the feed; they pause when scrolled away. The only video control is the
mute/unmute button.

## PWA notes

The service worker caches the app shell for offline loading. Firebase,
Cloudinary, and first-time face-model downloads still need an internet
connection. Update the cache version in `sw.js` when publishing a later bundle.
