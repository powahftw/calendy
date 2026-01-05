# Calendy - Annual Planner

A beautiful, minimal, and mobile-friendly annual planner built with React and Firebase. 
Built upon the idea of [calendar by neatnik](https://source.tube/neatnik/calendar)

## ✨ Features

- See your entire year or quarters at a glance in a high-density grid.
- Four curated themes: Modern Blue, Forest (Sepia), Pastel, and Dark Mode.
- Responsive layout across desktop and mobile devices.
- Real-time synchronization across all your tabs and devices using Firestore.
- Drag-and-drop to create multi-day events.
- Color-coded categories.
- List view for days with multiple overlapping events.
- Pre-configured GitHub Actions for automated deployment to Firebase Hosting.

## 🚀 Getting Started

1. **Setup Firebase**:
   - Create a project at [Firebase Console](https://console.firebase.google.com/).
   - Enable **Google Sign-in** in Authentication.
   - Create a **Firestore Database**.
2. **Local Configuration**:
   - Create a `.env.local` file based on `.env.example`.
   - Fill in your Firebase configuration keys.
3. **Install & Run**:
   ```bash
   npm install
   npm run dev
   ```

## 🛠️ Tech Stack

- **Framework**: React 19 + Vite
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Google)
- **Styling**: Vanilla CSS (Custom Variable System)
- **Deployment**: GitHub Actions + Firebase Hosting
