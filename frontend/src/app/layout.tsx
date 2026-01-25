// frontend\src\app\layout.tsx
"use client";

import "./globals.css";
import { MoveIcon } from "lucide-react";
import { useElectronWindowResize } from "./useElectronWindowResize";
import InputText from "@/components/InputText";
import { useCallback, useEffect, useState } from "react";
import ToggleHeader from "@/components/ToggleHeader";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const contentRef = useElectronWindowResize();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (window as any).__SET_GLOBAL_LOADING__ = setLoading;
    (window as any).__CLEAR_CHAT__ = clearChat;
  }, []);

  const clearChat = useCallback(() => {
    // Clear messages in the main chat component
    if ((window as any).__CLEAR_CHAT_MESSAGES__) {
      (window as any).__CLEAR_CHAT_MESSAGES__();
    }
    
    // Clear screen context if any
    if ((window as any).__CLEAR_SCREEN_CONTEXT__) {
      (window as any).__CLEAR_SCREEN_CONTEXT__();
    }
    
    // Clear input
    setInput("");
    (window as any).__SET_INPUT__?.("");
  }, []);

  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {/* MAIN CONTAINER */}
        <div
          ref={contentRef}
          style={{
            height: "auto",   // ⬅️ Critical
            width: "100%",
          }}
          className="shrink-0 rounded-2xl bg-white/70 dark:bg-white/10 shadow-xl antialiased overflow-hidden"
        >

          {/* FIXED HEADER */}
          <header className="shrink-0 px-4 pt-4 pb-2">
            <div className="flex justify-between items-center">
              
              <span className="ml-1 text-2xl font-bold text-blue-300">Skanda AI</span>
              
              {/* MoveIcon centered */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                <MoveIcon className="drag-area w-8 h-8 p-1 bg-gray-300 rounded-2xl" />
              </div>
              
              {/* ToggleHeader aligned to right */}
              <ToggleHeader />
            </div>
            <button 
              onClick={clearChat}
              className="text-sm text-red-500 rounded-sm p-1 hover:text-gray-500 transition-opacity"
            >
              Clear
            </button>
          </header>

          {/* SCROLLABLE CHAT AREA */}
          <main className="shrink-0 max-h-125 overflow-y-auto px-4">
            {children}
          </main>

          {/* FIXED FOOTER */}
          <footer className="shrink-0 px-4 py-3">
            <InputText
              input={input}
              setInput={(v) => {
                setInput(v);
                (window as any).__SET_INPUT__?.(v);
              }}
              send={() => (window as any).__SEND__?.()}
              loading={loading}
            />
          </footer>
        </div>
      </body>
    </html>
  );
}
