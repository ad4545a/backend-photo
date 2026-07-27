# Swarnkar Samaj — Backend

Backend for the gallery frontend already in this project. Matches the API
shape your `api.js` expects, plus a few additive endpoints for pagination,
admin management, and lazy video playback (see "Frontend changes" below).

**Storage split, as requested:**
- Photos → uploaded to a Telegram chat via a bot, referenced by `file_id`.
- Videos → uploaded to a Google Drive folder via a service account.
- All metadata + links → MongoDB (`Category`, `Photo`, `Video` collections).
- Gallery listing is paginated server-side: 10 photos / 5 videos per page,
  no matter what the client asks for.
- Video list responses never include the playable video — only a thumbnail.
  The real video URL is resolved by a separate endpoint, called only when
  the visitor presses play.
- Videos auto-expire and get deleted (Drive file + Mongo doc) after
  `VIDEO_RETENTION_MONTHS` (default 4), via a daily cron job.

## 1. Install

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env` — see the comments in `.env.example` for what each value
means. The three services you need to set up:

### MongoDB
Any Mongo instance works (Atlas free tier is fine). Put the connection
string in `MONGO_URI`.

### Telegram bot (photo storage)
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
   into `TELEGRAM_BOT_TOKEN`.
2. Create a private Telegram channel (or group), add your bot as an admin.
3. Get the channel's numeric ID (e.g. via `@userinfobot`, or the
   `getUpdates` API after posting a message) → `TELEGRAM_CHAT_ID`.

### Google Drive (video storage, via OAuth on your own account)
This uses your regular Google account (OAuth), not a service account — videos
land in your own Drive storage/quota.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project → enable the **Drive API** (APIs & Services → Library).
2. APIs & Services → Credentials → **Create Credentials → OAuth client ID**
   → type **Web application**. Add `http://localhost:3000/oauth2callback`
   (or whatever you set `GOOGLE_REDIRECT_URI` to) under **Authorized redirect
   URIs**.
3. Copy the generated **Client ID** and **Client Secret** into
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
4. Run the one-time authorization script:
   ```bash
   npm run google-auth
   ```
   It prints a URL — open it, sign in with the Google account whose Drive
   you want videos stored in, approve access. The script catches the
   redirect and prints a `GOOGLE_REFRESH_TOKEN` — paste that into `.env`.
   (If it says no refresh token came back, you've authorized this app
   before — remove its access at
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
   and run the script again.)
5. Create a folder in your Drive for the videos, open it, copy the ID from
   its URL (`drive.google.com/drive/folders/<THIS PART>`) into
   `GOOGLE_DRIVE_FOLDER_ID`.

Note: uploaded videos are set to "anyone with the link can view" so the
gallery's embed player and download links work — they're not otherwise
discoverable/listed on your Drive.

### Admin login
```bash
npm run hash-password
```
Paste the printed `ADMIN_PASSWORD_HASH` into `.env`, and set
`ADMIN_USERNAME` to whatever username you want to log in with.

### ffmpeg (video thumbnails)
No manual install needed — `ffmpeg-static` bundles a binary via npm.

## 2. Run

```bash
npm start        # production
npm run dev       # auto-restart on changes
```

Server boots on `PORT` (default 5000). Point your frontend's
`VITE_API_BASE_URL` at this server's URL.

## 3. API summary

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | – | `{username,password}` → `{token}` |
| GET | `/api/categories` | – | list |
| POST | `/api/categories` | admin | create |
| DELETE | `/api/categories/:slug` | admin | blocked if still in use |
| GET | `/api/photos?category=&page=` | – | max 10/page |
| GET | `/api/photos/admin/all` | admin | full list, for management |
| POST | `/api/photos/upload/init` \| `/upload/chunk/:id` \| `/upload/complete/:id` \| `/upload/cancel/:id` | admin | chunked upload → Telegram |
| GET | `/api/photos/:id/file` | – | streams image bytes |
| GET | `/api/photos/:id/download` | – | streams with attachment header |
| DELETE | `/api/photos/:id` | admin | |
| GET | `/api/videos?category=&page=` | – | max 5/page, **thumbnail only** |
| GET | `/api/videos/admin/all` | admin | full list, for management |
| GET | `/api/videos/:id/play` | – | resolves `{embedUrl}` — call only on play |
| GET | `/api/videos/:id/thumbnail` | – | streams thumbnail image |
| GET | `/api/videos/:id/download` | – | streams video, proxied from Drive |
| POST | `/api/videos/upload/init` \| `/upload/chunk/:id` \| `/upload/complete/:id` \| `/upload/cancel/:id` | admin | chunked upload → Drive + thumbnail → Telegram |
| DELETE | `/api/videos/:id` | admin | |

## 4. Frontend changes already applied

Two files in this delivery were patched to actually use the pagination and
lazy-video-loading the backend provides (otherwise those backend features
would just sit unused):

- **`api.js`** — `apiFetchPhotos`/`apiFetchVideos` now accept `{ page }`;
  added `apiFetchAllPhotosAdmin` / `apiFetchAllVideosAdmin` (unpaginated,
  admin-only, used by the management tab) and `apiFetchVideoPlayback`
  (resolves the real video URL only when the user presses play).
- **`App.jsx`** — added page/`hasMore` state for photos and videos, wired
  the previously-inert "load more" button to actually fetch the next page,
  switched the admin management screens to the new unpaginated admin
  endpoints, and changed video clicks to resolve playback lazily before
  opening the lightbox instead of relying on data from the list call.

Drop these two files in over your existing `src/api.js` and `src/App.jsx`.
Nothing else in the frontend needed to change — same component tree, same
styling, same admin panel flows.

## 5. Notes / things worth knowing

- **Telegram document limit**: 50MB per photo (using `sendDocument` to avoid
  Telegram's re-compression of `sendPhoto`). If you need bigger files,
  you'd need a self-hosted Bot API server (Telegram's Local Bot API),
  which raises the limit to 2GB.
- **Chunk buffering**: uploaded chunks are appended to a temp file on disk
  (`UPLOAD_TMP_DIR`) as they arrive, then pushed to Telegram/Drive as one
  file on `complete`. This keeps memory flat regardless of file size, at
  the cost of a second upload pass (server → Telegram/Drive) after the
  browser → server transfer finishes.
- **Video downloads are proxied** through the server (`/api/videos/:id/download`)
  rather than redirecting to Drive's own download link, because Drive's
  `uc?export=download` shows an interstitial "can't scan for viruses" page
  for larger files. Proxying uses your server's bandwidth — swap this for
  a redirect if that's a concern and your videos are on the smaller side.
- **Stale upload sessions** (tab closed mid-upload) are swept from disk
  after 6 hours automatically.
