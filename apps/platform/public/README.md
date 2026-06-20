# public/ — static assets for the platform marketing site

Files here are served from the site root. Drop the brand logos in this folder
(via GitHub → Add file → Upload files, targeting `apps/platform/public/`):

- `logolight.png` — logo for the **light** theme
- `logodark.png` — logo for the **dark** theme (optional; falls back to light)

Once uploaded, they are reachable at `/logolight.png` and `/logodark.png`.
The marketing nav header will be wired to render them theme-aware.
