# Runnel — Frontend Application

The modern, responsive web console for **Runnel — Recovery Inbox for Asynchronous Work**.

Built with React 19 and Vite 7, providing real-time visibility into execution lifecycles, attempt timelines, failure diagnostics, and safe retry controls.

---

## 1. Features & Design Identity

- **Execution Inbox**: Searchable, filterable log of background jobs with status tags, duration metrics, and attempt counts.
- **Attempt Timeline Drawer**: Detailed inspection of individual attempts with timestamps, durations, BullMQ worker metadata, structured error codes, and stack traces.
- **Manual Retry Modal**: Safe confirmation dialogs with retry policy bounds.
- **Real-Time Live Updates**: Authenticated Socket.IO connection streams instant updates when background workers process executions.
- **Stitch Design System**:
  - Warm Ivory Canvas: `#FBF9F3`
  - Surface White: `#FFFFFF`
  - Forest Green Accent: `#1B4332`
  - Terracotta Alert: `#B63B32`
  - Charcoal Typography: `#1C1917`
- **Independent Viewport Scrolling**: Fixed sidebar navigation with independently scrolling execution logs on desktop, plus a responsive mobile drawer navigation for small viewports.

---

## 2. Technology Stack

- **Framework**: React 19 + Vite 7
- **Routing**: React Router 7
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **WebSockets**: Socket.IO Client 4

---

## 3. Development Scripts

```bash
# Install dependencies
npm ci

# Start local development server (http://localhost:5173)
npm run dev

# Run ESLint validation
npm run lint

# Compile production bundle to dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 4. Environment Configuration

Create a `.env` file in `frontend/` (see `.env.example`):

```env
# Optional: Override backend API URL (defaults to Vite dev proxy at /api/v1)
VITE_API_URL=http://localhost:5000/api/v1
```
