🚀 FlowState

FlowState is a browser-native behavioral focus system that transforms your chaotic browsing into structured deep work sessions.

It combines workspace-based tab organization, behavioral friction, and analytics to help users improve focus quality — not just time spent.

---

🧠 Problem

Modern users face:

- Tab overload
- Constant context switching
- Impulse-driven browsing (YouTube, Reddit, etc.)
- Lack of structured focus environment
- No visibility into distraction behavior

Most tools either:

- Block websites ❌
- Track time ❌
- Manage tabs ❌

But none combine all three with behavioral intelligence.

---

💡 Solution

FlowState introduces:

«A workspace-driven focus system with behavioral tracking and analytics.»

- Structured workspaces
- Smart tab organization
- Focus enforcement modes
- Distraction tracking
- Deep work analytics

---

🏗 Architecture

Chrome Extension → Backend API → Database
        ↓
   React Dashboard

🔹 Chrome Extension

- Enforces focus rules
- Tracks behavior
- Shows live session data

🔹 Backend (Node + Express)

- Authentication (JWT)
- Session storage
- Analytics calculation

🔹 Database (PostgreSQL / Neon)

- Users
- Sessions
- Distraction logs

🔹 Dashboard (React)

- Visual analytics
- Streak tracking
- Productivity insights

---

⚙️ Key Features (MVP)

🧩 Workspace System

- Create named workspaces
- Save current tabs
- Define allowed / blocked domains

📂 Tab Organization

- Auto-group tabs by domain using Chrome Tab Groups API

🎯 Focus Modes

- Easy Mode → Soft reminder before distraction
- Strict Mode → Hard block with redirect

⏳ Intent Unlock

- 10–15 sec delay before opening blocked site

✅ To-Do Integration

- Task management per workspace
- Progress tracking

⏱ Focus Timer

- Starts with workspace
- Stops on exit

---

🧠 Behavioral Features (Unique)

- 🔁 Context Switch Tracking
- 🚪 Environment Exit Detection
- 📊 Session Integrity Score
- ⚡ Adaptive Friction
- 📉 Distraction Analytics

---

📊 Analytics Dashboard

Users can view:

- Focus time (daily/weekly)
- Distraction attempts
- Context switching rate
- Environment exits
- Productivity score
- Streak tracking

---

🔐 Privacy First

FlowState does NOT store:

- Full browsing history
- Exact URLs
- Page content

Only stores:

- Domain-level data
- Aggregated metrics

---

🛠 Tech Stack

Frontend

- React
- Chart.js / Recharts

Backend

- Node.js
- Express
- PostgreSQL (Neon)
- JWT Authentication

Extension

- Chrome Extension (Manifest V3)
- chrome.tabs API
- chrome.storage API

AI (Optional)

- Hugging Face API (tab categorization)

---


🔄 Workflow

1. Install extension
2. Redirect to website
3. Create workspace
4. Start focus session
5. Extension enforces rules
6. Data sent to backend
7. View analytics on dashboard

---

🎯 Future Scope

- Cross-browser support
- Desktop companion app
- AI-based behavior prediction
- Team workspaces
- Focus coaching system

---

🏆 Hackathon Value

- Real-world problem
- Clean architecture
- Behavioral psychology integration
- Scalable SaaS potential

---

📌 Final Note

FlowState is not just a productivity tool.

It is a behavioral system designed to improve how you work — not just how long you work.

---
