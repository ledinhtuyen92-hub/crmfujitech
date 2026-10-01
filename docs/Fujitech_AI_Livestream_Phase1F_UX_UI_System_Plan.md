# Fujitech AI Livestream - Phase 1F UX/UI System Plan

## 1. UX Goals
1. **Professional SaaS Feel**: Move away from scattered, generic CRUD grids toward a polished, workspace-oriented interface that feels like a premium broadcast tool.
2. **Immediate Actionability**: Ensure users can answer "What is live now?" and "Is everything working?" within 3 seconds of opening the dashboard.
3. **Complexity Abstraction**: Hide technical details (RTMP URLs, WebSockets, FFmpeg) behind semantic statuses (Online, Ready, Live, Error) while preserving the ability for advanced users to use Manual RTMP.
4. **Consistency**: Seamlessly integrate with the existing Fujitech Ant Design system without creating an isolated visual identity.

## 2. Design Principles
- **Genpio Benchmark**: Emulate Genpio's clean workspace spacing, visual hierarchy, and dedicated studio panels, but tailored to Fujitech's branding.
- **Status Visibility First**: Every live component (Devices, Platforms, Sessions) must prominently display its current health/status via distinct colors and icons.
- **Graceful Degradation**: If a platform API fails or is unlinked, the UI must gracefully allow fallback to Manual RTMP without looking like a broken state.

## 3. Proposed Information Architecture
The `Live` module will be structured as a dedicated workspace within the CRM:

```text
LIVE (Workspace)
 ├── Dashboard (/live/dashboard) - Global overview & active streams
 ├── Sessions (/live/sessions) - Scheduling & CRUD for livestream instances
 ├── Studio (/live/studio/:id) - [FUTURE] Dedicated per-session interactive workspace
 ├── Platforms (/live/platforms) - Connection management (Shopee API vs Manual RTMP)
 ├── Devices (/live/devices) - Windows Live Studio hardware monitoring
 ├── Control Room (/live/control-room) - [FUTURE] Multi-stream concurrent monitoring
 └── Reports (/live/reports) - [FUTURE] Livestream revenue & analytics
```

### Phase Mapping:
- **Phase 1F (Next)**: Redesign `Dashboard`, `Sessions`, `Platforms`, `Devices`.
- **Later Phases**: Build out the real-time `Studio`, `Control Room`, and `Reports`.

## 4. Design System Specifications (Ant Design Extrapolated)
- **Primary Color**: `#1649c9` (Fujitech Corporate Blue) - used for primary actions.
- **Platform Colors**: 
  - Shopee: `#ee4d2d`
  - TikTok: `#000000` (or `#010101`)
- **Status Colors (Crucial for Live)**:
  - `Running/Live`: `#52c41a` (Green) + Pulse animation for active streams.
  - `Ready/Online`: `#1890ff` (Blue)
  - `Draft/Offline`: `#d9d9d9` (Grey)
  - `Error/Stopped`: `#ff4d4f` (Red)
  - `Human Takeover`: `#722ed1` (Purple)
- **Cards**: `borderRadius: 8px` or `12px` for a softer SaaS look. Subtle shadows `box-shadow: 0 1px 2px 0 rgba(0,0,0,0.03)` to lift active components.
- **Typography**: Inter/Roboto (existing defaults). Use `Title level={4}` or `{5}` for panel headers rather than massive text.

## 5. Live Dashboard UX
**Goal**: Quick insights, not just a static menu.
- **Top Row**: 3-4 Metric Cards (Active Streams, Viewers (mocked for now), Connected Accounts, Online Devices).
- **Left Column (65%)**: "Currently Live" or "Upcoming Sessions" - Rich list featuring thumbnails of the product, agent avatar, and pulse indicator.
- **Right Column (35%)**: "System Health & Quick Actions" - Mini list of Devices and Platforms with green/red dot status.

## 6. Live Studio UX (Blueprint for Future Phase)
**Goal**: A professional broadcast workspace, not a web form.
- **Layout**: Full-screen takeover (hide global CRM sidebar if possible).
- **Left Panel (30%)**: Video Preview (HLS/WebRTC) + Stream Health (Bitrate, FPS).
- **Center Panel (40%)**: AI Copilot & Script flow. Shows what the AI is currently "thinking" or about to say. Includes "Human Takeover" master switch.
- **Right Panel (30%)**: Aggregated Live Chat + Pinned Products/Orders coming in real-time.

## 7. Control Room UX (Blueprint for Future Phase)
**Goal**: Agency-level monitoring.
- Grid view of 4-6 simultaneous streams.
- Mute/Unmute audio toggles.
- Global emergency stop button.
- Aggregate revenue counter across all active streams.

## 8. Connection UX (Shopee Dual Mode)
**Goal**: Make both modes feel first-class.
- **UI Treatment**: Use an Ant Design `Tabs` or Segmented control at the top of the connection/session creation flow: `[ Tự động qua API ] | [ Thủ công qua RTMP ]`.
- **API Mode**: Emphasizes ease of use. "Chỉ cần chọn tài khoản, nền tảng sẽ lo phần còn lại."
- **Manual Mode**: Emphasizes control. Displays secure, copyable fields for Server URL and Stream Key, with helper text indicating where to paste them in Shopee Live PC. Stream keys are masked (`••••••••`) by default with an "eye" icon to reveal.

## 9. Device UX (Hardware Representation)
**Goal**: Hide Windows PC complexity.
- Represent devices as "Máy chủ phát sóng" (Broadcast Servers).
- Show specs if available (e.g., "CPU: 45% | RAM: 2.1GB").
- Status indicator: `🟢 Online (Sẵn sàng)` vs `🔴 Offline (Mất kết nối)`.

## 10. Responsive Behavior
- **Dashboard / Platforms / Sessions**: Fully responsive. Stacks on mobile for managers checking status on the go.
- **Live Studio / Control Room**: Desktop-optimized only. Show a warning banner on mobile: "Vui lòng sử dụng máy tính để trải nghiệm Live Studio tốt nhất."

## 11. Reusable Component Strategy
To implement Phase 1F efficiently, create these shared components in `frontend/src/pages/live/components/`:
- `LiveStatusBadge.jsx`: Unified status coloring/text mapping.
- `StreamCard.jsx`: A visually rich card for representing a Session (used in both Dashboard and Sessions list).
- `DeviceStatusWidget.jsx`: Mini representation of a Windows device.

## 12. What NOT to Build Yet (Out of Scope for 1F)
- DO NOT build the real-time WebSocket connection to the actual video feed.
- DO NOT build the actual AI chat moderation interface.
- DO NOT rewrite backend streaming logic. Phase 1F is purely a structural UX/UI overhaul of the generic CRUD views into a rich SaaS workspace.

## 13. Acceptance Criteria for Phase 1F
1. `LiveDashboard` is redesigned into a rich metrics/status overview.
2. `LiveSessionsList` uses richer table structures or card grids instead of generic text columns.
3. `LivePlatforms` UI clearly and beautifully distinguishes API vs Manual modes using Tabs or prominent visual segmentation.
4. `LiveDevices` (if implemented) clearly shows Online/Offline status.
5. Navigation matches the new Information Architecture.
6. Design adheres strictly to the defined color and layout rules without breaking existing CRM styling.
