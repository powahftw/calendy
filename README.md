# Calendy - Annual Calendar Viewer

A beautiful, minimal, and mobile-friendly year-at-a-glance view of your Google Calendar.
Built upon the idea of [calendar by neatnik](https://source.tube/neatnik/calendar).

A publicly hosted version is available at [calendy-79636.web.app](https://calendy-79636.web.app/) if you want to play with it.

<img src="./public/calendy.png" alt="Calendy app icon" width="120" />

![Calendy screenshot](./screenshot.png)

Calendy is **read-only**. It requests the `calendar.readonly` scope, so it can show your
calendar but can never create, change or delete anything in it.

## Features

- See an entire year or quarter of your Google Calendar at a glance in a high-density grid.
- Full-day events fill the day; a compact `+N` badge reveals every overlapping or timed event.
- Hover or tap any occupied day for complete titles, all-day ranges, and scheduled times.
- Restore meaningful event styles with five solid colors, stripes, dots, and transparent display.
- Pick one or several calendars from the same account to view together - they do not have to include the primary one.
- Optionally hide exact duplicate events across the calendars you are viewing.
- Four curated themes: Modern Blue, Forest (Sepia), Pastel, and Dark Mode.
- Responsive layout across desktop and mobile devices.
- Markdown export of everything in the range you are viewing.
- Pre-configured GitHub Actions for automated deployment to Firebase Hosting.

## How events are displayed

The longest all-day event is the named chip for a day. A single all-day event
needs no extra badge; any additional all-day or timed events contribute to a
universal `+N`. A day containing only scheduled events stays visually open and
shows `+1`, `+2`, and so on.

Hovering or tapping the chip or badge opens one unified detail view. All-day
rows show their complete date range, scheduled rows show their time, and long
titles wrap instead of relying on a browser tooltip. On mobile the same content
opens as a bottom sheet.

Google event colors are respected. Events without one receive a stable
automatic color. Select the color line beside an event to cycle through the
legacy solid, striped, dotted, and transparent styles; overrides are saved
locally immediately, then synced through Firestore per calendar and recurring
series so the same meaning follows you across devices.

## Data

- **Events** are fetched from the Google Calendar API and cached in `localStorage` for 30
  minutes, per calendar and per year. They are never written to a server.
- **Event style overrides** are cached locally by calendar and event/series ID, then synced
  to an owner-only Firestore document after a short debounce. They contain no titles, dates,
  times, or other event contents.
- **Settings** - theme, view range, and which calendar you picked - are also stored in
  Firestore, so they follow you across devices.

## Getting Started

1. **Install and run locally**
   ```bash
   npm install
   npm run dev
   ```
2. **Firebase configuration** (required - sign-in is required)
   - Create a project at [Firebase Console](https://console.firebase.google.com/).
   - Enable **Google Sign-in** in Authentication.
   - Create a **Firestore Database**.
   - Create a `.env.local` file based on `.env.example`.
   - Deploy the bundled `firestore.rules` before exposing the app publicly.
3. **Google Calendar access** (required - it is the only data source)
   - Enable the **Google Calendar API** in Google Cloud, create a Web OAuth client, and add
     your authorized origins/domains.
   - Set `VITE_GOOGLE_CALENDAR_CLIENT_ID`.
   - Calendy only ever requests `calendar.readonly`: it can read your calendars and events,
     and can never create, modify or delete anything. The scope is requested at sign-in, so
     tokens can then be refreshed silently.
   - `calendar.readonly` is a **sensitive** scope. Keep the OAuth consent screen in *Testing*
     and add each person who signs in as a test user; publishing would require Google's
     verification review.
4. **Quality checks**
   ```bash
   npm run lint
   npm run typecheck
   npm run test:unit
   ```

## Deploying

`firebase.json` defines two Hosting sites in the same Firebase project:

| Site | Purpose |
| --- | --- |
| `calendy-79636` | Production. Deployed by `firebase-hosting-merge.yml` on push to `master`. |
| `calendy-readonly` | Test deploy, independent of production. Deployed by `firebase-hosting-readonly-test.yml`. |

To create the test site once:

```bash
firebase hosting:sites:create calendy-readonly
```

Then add `https://calendy-readonly.web.app` to **Authentication → Settings → Authorized
domains** in Firebase, and to the **Authorised JavaScript origins** of the Google Cloud
OAuth client. Deploy manually with:

```bash
firebase deploy --only hosting:calendy-readonly
```

## Tech Stack

- **Framework**: React 19 + Vite
- **Calendar data**: Google Calendar API (read-only), cached in `localStorage`
- **Settings storage**: Firebase Firestore
- **Authentication**: Firebase Auth (Google)
- **Styling**: Vanilla CSS (Custom Variable System)
- **Deployment**: GitHub Actions + Firebase Hosting
