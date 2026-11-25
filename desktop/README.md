# Vector Desktop (WPF)

This directory contains the native Windows desktop client. It is intentionally isolated from `client/` and `server/`.

## Current stage

The first foundation increment includes:

- A standalone WPF application project at `Vector.Desktop/`.
- A desktop shell with a 264 px navigation rail and a content area.
- Initial coffee-light design resources ported from `resources/design/tokens.css`.
- Placeholder navigation for the primary Web sections.

The navigation entries are scaffolding, not implemented product screens yet.

## Requirements

- Windows
- .NET 10 SDK (Windows Desktop workload/reference packs are included with the SDK)

## Run

From this directory:

```powershell
dotnet run --project .\Vector.Desktop\Vector.Desktop.csproj
```

## Porting rules

- Keep all desktop-specific code under `desktop/`.
- Do not modify the Web client or API server as part of the desktop port.
- Treat the Web implementation and shared design tokens as the behavioral and visual reference.
- Port screens incrementally and verify them against the Web client before calling them complete.
