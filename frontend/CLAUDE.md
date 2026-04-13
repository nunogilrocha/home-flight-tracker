# Frontend Guidelines

## Stack

- React 19 with TypeScript (strict mode)
- Vite as build tool and dev server
- Tailwind CSS 4 via `@tailwindcss/vite` plugin
- No UI component library — components are built from scratch

## File organization

```
src/
  main.tsx              # App root
  App.tsx               # Main layout + data fetching
  index.css             # Tailwind imports + custom theme + animations
  types.ts              # Shared TypeScript interfaces
  api.ts                # Typed API client (all backend calls)
  data.ts               # Airport, airline, and aircraft type databases
  utils.ts              # Pure utility functions (formatting, board logic)
  components/
    Header.tsx          # Airport info, clock, status, theme toggle
    ThemeToggle.tsx     # Light/dark mode toggle button
    FlightPanel.tsx     # Arrivals or departures panel (header + table + list)
    FlightRow.tsx       # Individual flight row with slot-based styling
    StatusBadge.tsx     # Color-coded status pill
```

## Naming conventions

- **Components:** PascalCase files and exports (`FlightRow.tsx`)
- **Utilities:** camelCase files and exports (`utils.ts`, `formatCallsign`)
- **Types:** PascalCase interfaces (`Flight`, `FlightsResponse`)

## State management

- State lives in `App.tsx` via `useState` hooks — no context or reducer needed for this single-page app
- Data is fetched via polling (`setInterval` every 30s)
- Theme state is local to `ThemeToggle` with `localStorage` persistence

## API client

- All backend calls go through `api.ts`
- Single function: `fetchFlights()` returns typed `FlightsResponse`
- Base path is `/api`, proxied to the backend in dev via `vite.config.ts`

## TypeScript

- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Shared types in `types.ts` — use `interface` for object shapes
- Prefer explicit typing on function signatures; let TypeScript infer locals

## Styling

- Use Tailwind utility classes for layout and spacing
- Custom theme colors defined in `index.css` under `@theme` (dark-first palette)
- Light theme overrides via `[data-theme="light"]` CSS variable swap
- Custom CSS classes for panel glows, flight grid columns, and scrollbars in `index.css`
- CSS keyframe animations: `fadeIn`, `pulseDot`, `spin`
- Fonts: Inter (sans) + JetBrains Mono (mono) loaded from Google Fonts

## Build and lint

- `npm run dev` — Vite dev server with HMR
- `npm run build` — TypeScript type-check + Vite production build to `dist/`
- `npm run lint` — ESLint with TypeScript and React hooks rules
