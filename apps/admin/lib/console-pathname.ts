// @fit/admin — how the dashboard layout learns which route it is wrapping.
//
// The App Router gives a Page its `params` and `searchParams` and gives a Layout
// neither, nor a pathname: a layout is deliberately re-used across the segments
// below it. That is fine until the layout has a job that depends on the route —
// and the per-capability route gate is exactly that job, because it is the only
// place in the request that holds both the resolved permission set and a moment
// before any page renders.
//
// So `middleware.ts` writes the requested path onto the REQUEST headers, and
// `app/(dashboard)/layout.tsx` reads it back through `headers()`. Middleware runs
// on every console route (see its matcher), so the header is always there for a
// page render.
//
// SPELLED WITH `x-` AND OVERWRITTEN, NOT MERGED. Middleware sets this
// unconditionally, so a request arriving with the header already on it does not
// get to keep its own value. Without that, a client could name any path it liked
// and have the layout gate the wrong route — which, for the route whose gate is
// the weakest, means gating nothing.
//
// Its own module rather than a constant in `middleware.ts` because both sides
// have to agree on the name, and neither is allowed to import the other: the
// layout is a Server Component and middleware is an Edge entry point.

/** Request header carrying the app-relative path middleware saw. */
export const CONSOLE_PATHNAME_HEADER = 'x-fit-console-pathname';
