# Run EEMD-RL Digital Twin on Windows

## Requirements

- Windows 10 or 11
- Node.js 22.13 or newer: https://nodejs.org/
- 4 GB free RAM recommended
- A modern browser with WebGL enabled

## First run

Open PowerShell inside the extracted project folder and run:

```powershell
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 dev
```

Open the local address printed in the terminal, normally:

```text
http://localhost:5173
```

You can also double-click `Start_EEMD_RL_Dashboard.bat`.

## Later runs

```powershell
npx --yes pnpm@11.25.0 dev
```

## Production build

```powershell
npx --yes pnpm@11.25.0 build
npx --yes pnpm@11.25.0 start
```

## Main editable files

- `app/page.tsx`: complete dashboard logic, 3D twin and research views.
- `app/globals.css`: complete responsive visual design.
- `public/data/actual_building_catalog.json`: 157-space physical catalog.
- `public/data/v23_corrected_final_rl_suite.json`: corrected 120-run RL results.
- `public/data/v23_ppo_timetable_ablation.json`: RQ3 timetable ablation.
- `public/data/v23_research_rule_baselines.json`: B0/B1 rule baselines.

## Scope

This package is a complete local research-demonstration UI. Live values are a
browser-side deterministic simulation driven by the catalog, selected season,
controller, safety mode and 15-minute timeline. The Experiments and Energy
views use the finalized research results. It does not retrain policies or run
the Python RL environment in the browser.

