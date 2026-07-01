// Ambient module declarations for global stylesheet side-effect imports
// (e.g. `import './globals.css'`), which bare `tsc --noEmit` can't resolve
// without Next's build step generating them.
declare module '*.css';
