// ui/src/app/useElectronWindowResize.tsx
"use client"
import { useEffect, useRef } from 'react';

const FIXED_WIDTH = 600;

export const useElectronWindowResize = () => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current || !window.electronAPI) return;

    const el = contentRef.current;

    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      const height = Math.ceil(rect.height);
      console.log("DOM height:", height);

      window.electronAPI!.resizeWindow(FIXED_WIDTH, height);
    });

    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, []);

  return contentRef;
};