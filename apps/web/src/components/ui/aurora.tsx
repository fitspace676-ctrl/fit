/**
 * The portal's ambient backdrop — soft, blurred brand/iris/accent blobs behind
 * the content. Tuned down in the light theme and richer in the dark theme. Fixed
 * and non-interactive so it sits behind every member screen.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-20 -top-40 h-[640px] w-[640px] rounded-full bg-iris-500/10 blur-[140px] dark:bg-iris-600/25" />
      <div className="absolute -top-24 right-0 h-[560px] w-[560px] rounded-full bg-brand-500/[0.08] blur-[150px] dark:bg-brand-500/20" />
      <div className="absolute -left-32 top-[45%] h-[520px] w-[520px] rounded-full bg-accent-500/[0.07] blur-[150px] dark:bg-accent-600/20" />
      <div className="absolute right-10 top-[72%] h-[480px] w-[480px] rounded-full bg-iris-400/[0.06] blur-[150px] dark:bg-iris-500/15" />
    </div>
  );
}
