/**
 * A slow, living brand-blue backdrop for a dark panel, like sky or open water:
 * soft light pools drifting across the panel and two waves rolling along the
 * bottom edge. Each pool is a radial gradient that already fades out, so no
 * blur filter is needed, and everything moves by `transform` only (the
 * compositor handles it without repainting). Still under reduced motion.
 * Drop it as the first child of a `relative isolate overflow-hidden` panel.
 */
export function FlowBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* light pools */}
      <span className="absolute -left-[20%] -top-[40%] h-[120%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(61,149,224,0.55),transparent)] motion-safe:animate-[flow-a_22s_ease-in-out_infinite_alternate]" />
      <span className="absolute -right-[15%] -top-[30%] h-[110%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(124,196,255,0.32),transparent)] motion-safe:animate-[flow-b_28s_ease-in-out_infinite_alternate]" />
      <span className="absolute left-[25%] top-[35%] h-[90%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgba(34,184,230,0.30),transparent)] motion-safe:animate-[flow-c_34s_ease-in-out_infinite_alternate]" />
      <span className="absolute -bottom-[45%] -left-[10%] h-[100%] w-[65%] rounded-full bg-[radial-gradient(closest-side,rgba(37,87,235,0.40),transparent)] motion-safe:animate-[flow-b_26s_ease-in-out_infinite_alternate-reverse]" />

      {/* waves: each strip is two identical periods wide and slides by one, so the loop is seamless */}
      <svg
        className="absolute bottom-0 left-0 h-[38%] w-[200%] motion-safe:animate-[flow-wave_18s_linear_infinite]"
        viewBox="0 0 2400 200"
        preserveAspectRatio="none"
      >
        <path
          d="M0 120 C200 70 400 70 600 120 S1000 170 1200 120 S1600 70 1800 120 S2200 170 2400 120 V200 H0Z"
          fill="rgba(124,196,255,0.10)"
        />
      </svg>
      <svg
        className="absolute bottom-0 left-0 h-[30%] w-[200%] motion-safe:animate-[flow-wave_26s_linear_infinite_reverse]"
        viewBox="0 0 2400 200"
        preserveAspectRatio="none"
      >
        <path
          d="M0 140 C300 100 300 100 600 140 S900 180 1200 140 S1500 100 1800 140 S2100 180 2400 140 V200 H0Z"
          fill="rgba(34,184,230,0.10)"
        />
      </svg>
    </div>
  );
}
