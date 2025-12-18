// frontend\src\components\InputText.tsx
"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { IconPlus } from "@tabler/icons-react";
import { ArrowUpIcon, ChevronDown, Play, Square, Mic, Volume2, MicVocal, AlertCircle, Eye } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import AudioControls from "./AudioControls";

interface ScreenAnalysis {
  ocr_text?: string;
  ui_elements?: Array<{
    type: string;
    text: string;
    confidence: number;
    bounding_box: [number, number, number, number];
  }>;
  errors?: Array<{
    text: string;
    severity: "info" | "warning" | "error";
  }>;
  code_snippets?: Array<{
    language: string;
    code: string;
  }>;
  summary?: string;
  likely_intent?: string;
  suggested_actions?: string[];
  _error?: string;
  _raw?: string;
}

export default function InputText({
  input,
  setInput,
  send,
  loading,
}: {
  input: string;
  setInput: (v: string | ((prev: string) => string)) => void; 
  send: (message?: string) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<"keyboard" | "voice" | "system" | "both">("keyboard");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [pendingVoiceMessage, setPendingVoiceMessage] = useState<string>("");
 
  const committedRef = useRef<string>("");
  // Setup electron audio listener
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const { audioAPI } = window;
    if (!audioAPI || !audioAPI.onText) {
      console.warn("audioAPI not found (are you running inside Electron with preload.js?)");
      return;
    }

    // Listen for transcription text
    audioAPI.onText((text: string) => {
      if (typeof text !== "string") return;
      setInput(text);
      committedRef.current = text;
      setPendingVoiceMessage(text);
    });

    // Listen for final transcription
    audioAPI.onFinal((text: string) => {
      if (typeof text !== "string") return;
      setInput((prev) => (prev ? prev + " " + text : text));
      committedRef.current = (committedRef.current ? committedRef.current + " " : "") + text;
      setPendingVoiceMessage(committedRef.current);
    });

    // Listen for errors
    audioAPI.onError((message: string) => {
      setError(message);
      setIsRecording(false);
      toast.error("Audio Capture Error", {
        description: message,
        icon: <AlertCircle className="h-4 w-4" />,
      });
    });

    return () => {
      // Cleanup if needed
    };
  }, [setInput]);

  
  useEffect(() => {
    if (!isRecording && pendingVoiceMessage.trim() && mode !== "keyboard") {
      console.log("Processing pending voice message:", pendingVoiceMessage);
      if (screenReaderEnabled) {
        handleSendWithScreenAnalysis(pendingVoiceMessage);
      } else {
        send(pendingVoiceMessage);
      }
      setTimeout(() => {
        setPendingVoiceMessage("");
        setInput("");
        committedRef.current = "";
      }, 100);
    }
  }, [isRecording, pendingVoiceMessage, screenReaderEnabled, mode, send]);


  useEffect(() => {
    (window as any).__TOGGLE_VOICE_RECORDING__ = () => {
      if (mode !== "voice") {
        handleModeChange("voice");
        setTimeout(() => {
          toggleRecording();
        }, 100);
      } else {
        toggleRecording();
      }
    };

    (window as any).__TOGGLE_SYSTEM_RECORDING__ = () => {
      if (mode !== "system") {
        handleModeChange("system");
        setTimeout(() => {
          toggleRecording();
        }, 100);
      } else {
        toggleRecording();
      }
    };

    (window as any).__TOGGLE_BOTH_RECORDING__ = () => {
      if (mode !== "both") {
        handleModeChange("both");
        setTimeout(() => {
          toggleRecording();
        }, 100);
      } else {
        toggleRecording();
      }
    };

    (window as any).__TOGGLE_KEYBOARD__ = () => {
      if (mode !== "keyboard") {
        if (isRecording) {
          const { audioAPI } = window as any;
          if (audioAPI && audioAPI.stop) {
            audioAPI.stop();
            setIsRecording(false);
            setIsPaused(false);
          }
        }
        handleModeChange("keyboard");
      } else {
        toast.info("Already in Keyboard mode", {
          duration: 1500,
        });
      }
    };

    (window as any).__TOGGLE_SCREEN_ANALYZER__ = () => {
      setScreenReaderEnabled(prev => {
        const newState = !prev;
        toast.info(newState ? "Screen Reader Enabled" : "Screen Reader Disabled", {
          description: newState ? "Screen will be analyzed when sending messages" : "Screen analysis disabled",
          duration: 2000,
        });
        return newState;
      });
    };

    return () => {
      delete (window as any).__TOGGLE_VOICE_RECORDING__;
      delete (window as any).__TOGGLE_SYSTEM_RECORDING__;
      delete (window as any).__TOGGLE_BOTH_RECORDING__;
      delete (window as any).__TOGGLE_KEYBOARD__;
      delete (window as any).__TOGGLE_SCREEN_ANALYZER__;
    };
  }, [mode, isRecording, isPaused]);

  const toggleRecording = () => {
    if (mode === "keyboard") {
      console.log("Add something...");
      return;
    }

    const { audioAPI } = window as any;
    if (!audioAPI || !audioAPI.start) {
      alert("Native audio API not available. Run inside Electron with preload.js.");
      return;
    }

    if (!isRecording) {
      audioAPI.start(mode);
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      setPendingVoiceMessage("");
      committedRef.current = "";
    } else {
      // Stop recording
      audioAPI.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const handleModeChange = (newMode: "keyboard" | "voice" | "system" | "both") => {
    // If currently recording, stop first
    if (isRecording) {
      const { audioAPI } = window as any;
      if (audioAPI && audioAPI.stop) {
        audioAPI.stop();
      }
      setIsRecording(false);
      setIsPaused(false);
    }
    
    setMode(newMode);
    setError(null);
    setPendingVoiceMessage("");
    committedRef.current = "";
  };

  const handlePausePlayToggle = (paused: boolean) => {
    setIsPaused(paused);
    // AudioControls will handle the actual API calls
  };


  const handleDeleteAudio = () => {
  // Clear the input and pending voice message
    setInput("");
    setPendingVoiceMessage("");
    committedRef.current = "";
  };

  const captureAndAnalyzeScreen = async (): Promise<ScreenAnalysis | null> => {
    try {
      setIsAnalyzingScreen(true);
      
      if (!window.screenAPI?.captureBackgroundWindow) {
        throw new Error("Screen capture API not available. Make sure you're running in Electron.");
      }

      const screenAPI = window.screenAPI;
      
      const screenshotBlob = await screenAPI.captureBackgroundWindow();
      
      if (!screenshotBlob) {
        throw new Error("Failed to capture screenshot. The screenshot blob was empty.");
      }

      const screenshotFile = new File([screenshotBlob], "screenshot.png", { type: "image/png" });
      
      const formData = new FormData();
      formData.append("image", screenshotFile);

      console.log("Sending screenshot for analysis...");
      const response = await fetch("http://localhost:8000/screen/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const analysis: ScreenAnalysis = await response.json();
      console.log("Screen analysis received:", analysis);
      
      if (analysis._error) {
        console.error("Screen analysis error:", analysis._error, analysis._raw);
        toast.warning("Partial analysis", {
          description: "Screen was analyzed but couldn't parse full response",
        });
      }

      return analysis;
      
    } catch (error) {
      console.error("Screen capture/analysis error:", error);
      toast.error("Screen Analysis Failed", {
        description: error instanceof Error ? error.message : "Unknown error",
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return null;
    } finally {
      setIsAnalyzingScreen(false);
    }
  };

  const handleSendWithScreenAnalysis = async (voiceTranscription?: string) => {
    const messageToUse = voiceTranscription || input;
    if (!messageToUse.trim() && !screenReaderEnabled) {
      // Normal send without screen analysis
      send();
      setInput("");
      committedRef.current = "";
      return;
    }

    try {
      let screenContext = "";
      
      if (screenReaderEnabled) {
        toast.info("Analyzing screen...", {
          icon: <Eye className="h-4 w-4" />,
          duration: 3000,
        });

        const analysis = await captureAndAnalyzeScreen();
        
        if (analysis) {
          // Format the screen analysis for the AI
          screenContext = `
  SCREEN ANALYSIS CONTEXT:
  ${analysis.summary ? `Summary: ${analysis.summary}` : ''}
  ${analysis.ocr_text ? `Visible Text: ${analysis.ocr_text.substring(0, 500)}...` : ''}
  ${analysis.likely_intent ? `User likely wants to: ${analysis.likely_intent}` : ''}
  ${analysis.suggested_actions && analysis.suggested_actions.length > 0 
    ? `Suggested actions: ${analysis.suggested_actions.slice(0, 3).join(', ')}` 
    : ''}
  ${analysis.ui_elements && analysis.ui_elements.length > 0 
    ? `UI Elements detected: ${analysis.ui_elements.slice(0, 5).map(el => el.type).join(', ')}` 
    : ''}
  `;

          // Clear input after capturing screen
          setInput("");
          committedRef.current = "";
          
          // Use the page's send function with screen context
          const sendWithScreen = (window as any).__SEND_WITH_SCREEN__;
          if (sendWithScreen) {
            sendWithScreen(screenContext, messageToUse.trim());
          } else {
            // Fallback to regular send
            const combinedInput = messageToUse.trim() 
              ? screenContext + "\nUSER QUERY: " + messageToUse
              : screenContext + "\nWhat do you see on my screen? Please describe it and suggest actions based on what you see.";
            
            send(combinedInput);
          }
          return;
        } else {
          // If analysis failed but screen reader is enabled, still send with note
          screenContext = "NOTE: Screen analysis failed.\n\n";
          toast.warning("Screen analysis failed, sending without visual context");

          // Send with failure note
          const combinedInput = screenContext + (messageToUse.trim() ? "\nUSER QUERY: " + messageToUse: "");
          send(combinedInput);
          setInput("");
          committedRef.current = "";
          return;
        }
      }

      // Regular send without screen context
      send(messageToUse);
      
      // Clear input after sending
      setInput("");
      committedRef.current = "";
      
    } catch (error) {
      console.error("Error in send with screen analysis:", error);
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "An error occurred while processing your request",
        icon: <AlertCircle className="h-4 w-4" />,
      });
       
    }
  };

  const getModeIcon = () => {
    if (mode === "keyboard") return <IconPlus size={14} />;
    if (mode === "voice") return <Mic size={14} />;
    if (mode === "system") return <Volume2 size={14} />;
    return <MicVocal size={14} />; // both mode
  };

  const getButtonVariant = () => {
    if (mode === "keyboard") return "outline";
    if (isRecording) return "default";
    return "outline";
  };

  const getButtonClass = () => {
    if (mode !== "keyboard" && isRecording) {
      return "bg-red-500 text-white hover:bg-red-600";
    }
    return "";
  };

  const getPlaceholder = () => {
    if (error) return error;
    
    switch(mode) {
      case "keyboard":
        return "Ask, Search or Chat...";
      case "voice":
        return isRecording ? "🎤 Recording microphone... (click stop when done)" : "Click to record voice";
      case "system":
        return isRecording ? "🔊 Capturing system audio from speakers... (click stop when done)" : "Click to capture system audio";
      case "both":
        return isRecording ? "🎤🔊 Recording both microphone and system audio... (click stop when done)" : "Click to record both microphone and system audio";
    }
  };
  
  const isTextareaDisabled = mode !== "keyboard" || isAnalyzingScreen;
  const textareaCursorClass = isTextareaDisabled ? "cursor-default" : "cursor-text";

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          <AlertCircle className="inline mr-2 h-4 w-4" />
          {error}
        </div>
      )}
      <InputGroup>
        <InputGroupTextarea
          placeholder={getPlaceholder()}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isTextareaDisabled} 
          className={`${error ? "border-red-300" : ""} ${textareaCursorClass}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendWithScreenAnalysis();
            }
          }}
          style={{
            cursor: isTextareaDisabled ? 'default' : 'text'
          }}
        />

        <InputGroupAddon align="block-end" className="cursor-default">
          <InputGroupButton
            variant={getButtonVariant()}
            className={`rounded-full transition-colors  ${getButtonClass()}`}
            size="icon-xs"
            onClick={toggleRecording}
            disabled={!!error && mode !== "keyboard" || isAnalyzingScreen}
          >
            {isRecording ? <Square size={14} /> : getModeIcon()}
          </InputGroupButton>
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton variant="ghost" disabled={isRecording || isAnalyzingScreen}>
                  {mode === "keyboard" && "Keyboard"}
                  {mode === "voice" && "Voice Record"}
                  {mode === "system" && "System Audio"}
                  {mode === "both" && "System Audio & Voice Record"}
                  <ChevronDown size={14} />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem 
                  className={mode === "keyboard" ? "bg-accent text-accent-foreground" : ""}
                  onClick={() => handleModeChange("keyboard")}
                >
                  <span>Keyboard</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={mode === "voice" ? "bg-accent text-accent-foreground" : ""}
                  onClick={() => handleModeChange("voice")}
                >
                  <span>Voice Record</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={mode === "system" ? "bg-accent text-accent-foreground" : ""}
                  onClick={() => handleModeChange("system")}
                >
                  <span>System Audio (Speakers)</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={mode === "both" ? "bg-accent text-accent-foreground" : ""}
                  onClick={() => handleModeChange("both")}
                >
                  <span>System Audio & Voice Record</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Audio controls appear here, next to dropdown */}
            <AudioControls 
              mode={mode}
              isRecording={isRecording}
              isPaused={isPaused}
              onPausePlayToggle={handlePausePlayToggle}
              onDelete={handleDeleteAudio}
            />
          </div>

          <div className="ml-auto flex gap-2 items-center px-3">
            <Eye className={`h-4 w-4 cursor-default ${screenReaderEnabled ? "text-blue-500" : "text-gray-400"}`} />
            <Label htmlFor="screen-reader" className="text-sm whitespace-nowrap">
              Screen Reader
            </Label>
            <Switch
              id="screen-reader"
              checked={screenReaderEnabled}
              onCheckedChange={setScreenReaderEnabled}
              disabled={isAnalyzingScreen}
            />
          </div>
          <Separator orientation="vertical" className="h-4!" />

          <InputGroupButton
            variant="default"
            className={`rounded-full ${isAnalyzingScreen ? "opacity-70 animate-pulse" : ""}`}
            size="icon-xs"
            onClick={() => handleSendWithScreenAnalysis()}
            disabled={loading || (!input.trim() && !screenReaderEnabled) || isAnalyzingScreen}
          >
            {isAnalyzingScreen ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <ArrowUpIcon />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}