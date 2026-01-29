"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Pause, Play, Trash2 } from "lucide-react";

interface AudioControlsProps {
  mode: "voice" | "system" | "both" | "keyboard";
  isRecording: boolean;
  isPaused: boolean;
  onPausePlayToggle?: (paused: boolean) => void;
  onDelete?: () => void;
}

export default function AudioControls({ 
  mode, 
  isRecording,
  isPaused,
  onPausePlayToggle,
  onDelete 
}: AudioControlsProps) {

  useEffect(() => {
    const { electronAPI } = window as any;
    if (electronAPI?.onCommandExecuted) {
      const handleCommand = (command: string) => {
        console.log(`AudioControls: Command executed: ${command}`);
        switch (command) {
          case 'toggle-audio-pause-resume':
            if (isRecording && mode !== "keyboard") {
              handlePausePlayToggle();
            }
            break;
          case 'delete-audio-buffer':
            if (isRecording && mode !== "keyboard") {
              handleDelete();
            }
            break;
        }
      };
      
      electronAPI.onCommandExecuted(handleCommand);
      
    }
  }, [isRecording, mode, isPaused, onPausePlayToggle, onDelete]);

  const handlePausePlayToggle = () => {
    if (!isRecording) return;

    const newPausedState = !isPaused;
    
    if (onPausePlayToggle) {
      onPausePlayToggle(newPausedState);
    }

    if (window.audioAPI) {
      if (newPausedState) {
        if (window.audioAPI.pause) {
          window.audioAPI.pause();
        }
      } else {
        if (window.audioAPI.resume) {
          window.audioAPI.resume();
        }
      }
    } else {
      console.log(`${newPausedState ? "Pause" : "Resume"} audio recording`);
    }
  };

  const handleDelete = () => {
    if (!isRecording) {
      return;
    }
    if (window.audioAPI && window.audioAPI.delete) {
      window.audioAPI.delete();
    } else {
      console.log("Clear audio recording buffer");
    }

    if (onDelete) {
      onDelete();
    }
  };

  if (mode === "keyboard") {
    return null;
  }

  return (
    <div className="flex items-center gap-1 ml-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handlePausePlayToggle}
        disabled={!isRecording}
        className={`h-7 w-7 p-0 ${isRecording ? "hover:bg-gray-100" : "opacity-50 cursor-not-allowed"}`}
      >
        {isRecording && !isPaused ? (
          <Pause className="h-4 w-4 text-blue-500" />
        ) : (
          <Play className="h-4 w-4 text-blue-500" />
        )}
      </Button>
      
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleDelete}
        disabled={!isRecording}
        className={`h-7 w-7 p-0 ${isRecording ? "hover:bg-gray-100" : "opacity-50 cursor-not-allowed"}`}
      >
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  );
}