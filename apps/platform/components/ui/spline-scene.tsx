'use client';

import { createElement, useEffect, useRef } from 'react';

/**
 * Renders a Spline 3D scene via the official `<spline-viewer>` web component,
 * loaded once from the CDN — no npm dependency or React-version peer conflicts.
 * The custom element is created with `createElement` so no JSX intrinsic-element
 * typing is required. The scene itself streams from prod.spline.design.
 *
 * The viewer injects a "Built with Spline" logo into its (open) shadow root; we
 * poll for it after load and hide it.
 */
const VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js';

export interface SplineSceneProps {
  sceneUrl: string;
  className?: string;
}

export const SplineScene = ({ sceneUrl, className = '' }: SplineSceneProps) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (document.querySelector('script[data-spline-viewer]')) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = VIEWER_SRC;
    script.dataset.splineViewer = 'true';
    document.head.appendChild(script);
  }, []);

  // Remove the "Built with Spline" logo from the viewer's shadow DOM once it appears.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const logo = el.shadowRoot?.getElementById('logo');
      if (logo) {
        logo.remove();
        window.clearInterval(id);
      } else if (++tries > 80) {
        window.clearInterval(id);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={className}>
      {createElement('spline-viewer', {
        ref,
        url: sceneUrl,
        style: { width: '100%', height: '100%' },
      })}
    </div>
  );
};

export default SplineScene;
