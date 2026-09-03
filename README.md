# Classic Messenger - Real-Time Chat, WebRTC Voice & Video Calls

A real-time messaging, presence, **WebRTC voice calling**, and **WebRTC video calling** application built with **React (Vite)**, **Supabase (Auth, Database, Realtime, RLS)**, and **Node.js Socket.IO (Signaling)**.

---

## 🌟 Features

- **Authentication & Profiles**:
  - Registration with lowercase usernames (no spaces), email, and password.
  - Immediate sign-in without waiting for email confirmation.
  - Sign in with username or email.
- **Persistent Real-Time Chat**:
  - Persistent message history saved in Supabase database.
  - Instant zero-latency messaging powered by Socket.IO & Supabase Realtime.
  - Search any registered user by username to initiate new chats.
  - Chat list displays users with whom chats have previously taken place.
- **WebRTC Voice & Video Calling**:
  - One-to-one peer-to-peer HD audio & video calls.
  - Picture-in-Picture (PiP) local video preview & remote video stream.
  - In-call microphone mute/unmute and camera toggle controls.
  - Call duration timer and automatic in-chat call log summaries.
- **Mobile Responsive Design**:
  - Seamless responsiveness across mobile viewports (360×640, 390×844, 412×915).
  - Navigation between contact list and conversation with `← Back` button.
  - Classic retro desktop messenger styling.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Root & client & server
npm install
cd client && npm install
cd ../server && npm install
```

### 2. Configure Environment Variables

Create `client/.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Create `server/.env`:
```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

### 3. Setup Database

Run the complete SQL script in `supabase/schema.sql` inside your **Supabase Dashboard -> SQL Editor**.

### 4. Run the Application

In separate terminals:

```bash
# Terminal 1: Backend Server (Port 5000)
cd server
node server.js

# Terminal 2: Frontend Client (Port 5173)
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.
