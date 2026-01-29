//frontend\src\app\page.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ChatTypeWriter } from "@/components/ChatTypeWriter";
import { Button } from "@/components/ui/button";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Msg = {
  role: "user" | "ai";
  text: string;
  rawInput?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenContext, setScreenContext] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const updateLastAiMessage = useCallback((chunk: string) => {
    setMessages((prev) => {
      const idx = prev.length - 1;

      if (idx >= 0 && prev[idx].role === "ai") {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          text: updated[idx].text + chunk,
        };
        return updated;
      }

      return prev;
    });
  }, []);

  const pushMessage = useCallback((m: Msg) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (inputWithScreenContext?: string) => {
    const messageToSend = inputWithScreenContext || input;
    if (!messageToSend.trim()) return;

    const userText = input.trim();
    const rawInput = messageToSend.trim();

    const displayText = userText || 
    (rawInput.includes("USER QUERY:") 
      ? rawInput.split("USER QUERY:")[1]?.trim() || rawInput 
      : rawInput);

    const isFreshStart = messages.length === 0;

    pushMessage({ role: "user", text: displayText, rawInput: userText !== rawInput ? rawInput : undefined  });
    setInput("");
    setLoading(true);

    pushMessage({ role: "ai", text: "" });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      await fetchEventSource(`${BACKEND}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          messages: [
            ...(screenContext ? [{
              role: 'system',
              content: `SCREEN CONTEXT:\n${screenContext}\n\nRefer to this screen information when answering questions.`
            }] : []),
            ...(isFreshStart ? [] : messages.map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.text
            }))),
            {
              role: 'user',
              content: rawInput
            }
          ],
        }),
        signal: controller.signal,
        
        onopen: async (response) => {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('SSE connection established');
            return;
          } else if (response.status >= 400) {
            throw new Error(`Server error: ${response.status}`);
          }
        },
        
        onmessage: (event) => {
          if (event.data === '[DONE]') {
            console.log('Stream completed');
            return;
          }
          
          if (event.data && event.data !== '[ERROR]') {
            updateLastAiMessage(event.data);
          } else if (event.data?.startsWith('[ERROR]')) {
            throw new Error(event.data.replace('[ERROR] ', ''));
          }
        },
        
        onclose: () => {
          console.log('Connection closed');
          setLoading(false);
          setAbortController(null);
        },
        
        onerror: (err) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            console.log('Request was aborted');
            return; 
          }
          
          console.error('SSE error:', err);
          updateLastAiMessage(`\n**Error:** ${err.message || 'Connection failed'}`);
          throw err; 
        },
        
        openWhenHidden: true,
        fetch: async (input, init) => {
          const timeout = 30000;
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeout);
          });
          
          const fetchPromise = fetch(input, init);
          return Promise.race([fetchPromise, timeoutPromise]);
        }
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Request failed:', err);
        updateLastAiMessage(`\n**Error:** ${err?.message || 'Unknown error'}`);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
      setAbortController(null);
    }
  }, [input, pushMessage, updateLastAiMessage, messages, screenContext]);

  const cancelStream = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setLoading(false);
      setAbortController(null);
      updateLastAiMessage('AI streaming cancelled.');
    }
  }, [abortController, updateLastAiMessage]);

  const sendWithScreenContext = useCallback(async (screenContext: string, userInput: string) => {
    const combinedInput = screenContext + "\nUSER QUERY: " + userInput;
    setScreenContext(screenContext);
    await send(combinedInput);
  }, [send]);
 
  const clearChatMessages = useCallback(() => {
    setMessages([]);
    setScreenContext(null);
    setInput("");
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setLoading(false);
  }, [abortController]);

  useEffect(() => {
    (window as any).__SEND__ = send;
    (window as any).__SEND_WITH_SCREEN__ = sendWithScreenContext;
    (window as any).__SET_INPUT__ = setInput;
    (window as any).__SET_GLOBAL_INPUT__ = setInput;
    (window as any).__LOADING__ = setLoading;
    (window as any).__CANCEL_STREAM__ = cancelStream;
    (window as any).__CLEAR_CHAT_MESSAGES__ = clearChatMessages;
    (window as any).__CLEAR_SCREEN_CONTEXT__ = () => setScreenContext(null);
  }, [send, sendWithScreenContext, cancelStream]);

  return (
    <div className="container flex flex-col gap-4">
      <div
        className="chat-window flex-1 overflow-y-auto px-1"
        style={{ scrollbarGutter: "stable" }}
      >
        {messages.length === 0 && (
          <ChatTypeWriter />
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`p-2 shadow-sm max-w-md whitespace-pre-wrap my-2 ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-xl rounded-tl-xl rounded-bl-xl"
                  : "bg-gray-100 text-gray-800 rounded-tr-xl rounded-tl-xl rounded-br-xl"
              }`}
            >
              
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap">{m.text}</div>
              ) : (
                <MarkdownRenderer key={`${i}-${m.text.length}`} content={m.text} />
              )}

              {loading && i === messages.length - 1 && m.role === "ai" && (
                <div className="inline-flex items-center mt-2">
                  <Spinner className="h-4 w-4 animate-spin text-blue-300" />
                </div>
              )}
            </div>
            {loading && i === messages.length - 1 && m.role === "ai" && (
              <div className="flex items-end ml-2 mb-2">
                <Button 
                  onClick={cancelStream}
                  className="text-xs bg-red-500 text-white hover:bg-red-600 px-3 py-1.5 rounded-md shadow-sm"
                  size="sm"
                >
                  Stop
                </Button>
              </div>
            )}
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
