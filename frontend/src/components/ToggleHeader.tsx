"use client";

import { useEffect, useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { HeartIcon, EyeOffIcon, PanelTopCloseIcon, Command, Terminal, PanelBottomCloseIcon, CameraOffIcon } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface ToggleHeaderProps {
  className?: string;
}

function ToggleHeader({ className }: ToggleHeaderProps) {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const isSelected = (value: string) => selectedValues.includes(value);

  // Handle toggles
  useEffect(() => {
    // Handle Eye Off icon (invisibility for screen sharing)
    if (window.electronAPI) {
      window.electronAPI.toggleInvisibility(isSelected("eye"));
    }
  }, [isSelected("eye")]);

  useEffect(() => {
    // Handle Panel Top Close icon (hide from taskbar)
    if (window.electronAPI) {
      window.electronAPI.toggleTaskbar(isSelected("hide"));
    }
  }, [isSelected("hide")]);

  useEffect(() => {
    // Handle Terminal icon (enable commands)
    if (window.electronAPI) {
      window.electronAPI.toggleCommands(isSelected("commands"));
      
      // Listen for command executions when terminal mode is enabled
      if (isSelected("commands")) {
        window.electronAPI.onCommandExecuted((command: string) => {
          console.log('Command executed:', command);
          handleCommandExecution(command);
        });
      }
    }
  }, [isSelected("commands")]);

  const handleCommandExecution = (command: string) => {
    switch (command) {
      case 'toggle-invisibility-shortcut':
        // Toggle invisibility - use functional update to ensure correct state
        setSelectedValues(prev => {
          const isCurrentlySelected = prev.includes("eye");
          if (isCurrentlySelected) {
            // Remove "eye" from array
            return prev.filter(v => v !== "eye");
          } else {
            // Add "eye" to array
            return [...prev, "eye"];
          }
        });
        console.log(`Invisibility toggled via shortcut`);
        break;

      case 'toggle-taskbar-shortcut':
        // Toggle taskbar visibility - use functional update
        setSelectedValues(prev => {
          const isCurrentlySelected = prev.includes("hide");
          if (isCurrentlySelected) {
            // Remove "hide" from array
            return prev.filter(v => v !== "hide");
          } else {
            // Add "hide" to array
            return [...prev, "hide"];
          }
        });
        console.log(`Taskbar icon toggled via shortcut`);
        break;

      case 'toggle-voice-recording':
        // Trigger voice recording via global function
        if ((window as any).__TOGGLE_VOICE_RECORDING__) {
          (window as any).__TOGGLE_VOICE_RECORDING__();
          console.log('Voice recording toggled via shortcut');
        }
        break;

      case 'toggle-system-recording':
        // Trigger system recording via global function
        if ((window as any).__TOGGLE_SYSTEM_RECORDING__) {
          (window as any).__TOGGLE_SYSTEM_RECORDING__();
          console.log('System recording toggled via shortcut');
        }
        break;

      case 'toggle-both-recording':
        // Trigger both recording via global function
        if ((window as any).__TOGGLE_BOTH_RECORDING__) {
          (window as any).__TOGGLE_BOTH_RECORDING__();
          console.log('Both recording toggled via shortcut');
        }
        break;

      case 'toggle-keyboard-shortcut':
        // Trigger keyboard input mode via global function
        if ((window as any).__TOGGLE_KEYBOARD__) {
          (window as any).__TOGGLE_KEYBOARD__();
          console.log('Keyboard input mode toggled via shortcut');
        }
        break;

      case 'toggle-screen-analyzer':
        // Trigger screen analyzer via global function
        if ((window as any).__TOGGLE_SCREEN_ANALYZER__) {
          (window as any).__TOGGLE_SCREEN_ANALYZER__();
          console.log('Screen analyzer toggled via shortcut');
        }
        break;

      case 'clear-chat-messages':
        // Clear chat messages via global function
        if ((window as any).__CLEAR_CHAT_MESSAGES__) {
          (window as any).__CLEAR_CHAT_MESSAGES__();
          console.log('Chat messages cleared via shortcut');
        }
        break;

      case 'toggle-window-minimize':
        // Toggle window minimize/restore
        if (window.electronAPI && window.electronAPI.toggleWindowMinimize) {
          window.electronAPI.toggleWindowMinimize(isMinimized);
          console.log('Window minimize/restore toggled via shortcut');
        }
        break;

      default:
        console.log('Unknown command:', command);
    }
  };

  

  return (
    <div className={className}>
      <ToggleGroup 
        type="multiple" 
        variant="outline" 
        spacing={2} 
        size="sm"
        value={selectedValues}
        onValueChange={setSelectedValues}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="eye"
              aria-label="Toggle eye"
              className={`data-[state=on]:bg-transparent ${
                isSelected("eye")
                  ? "*:[svg]:text-blue-500 *:[svg]:stroke-blue-500" 
                  : "*:[svg]:text-gray-500 *:[svg]:stroke-gray-500"
              }`}
            >
              <CameraOffIcon />
              {isScreenSharing && isSelected("eye") && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isSelected("eye") ? "Disable invisibility" : "Enable invisibility"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="hide"
              aria-label="Toggle hide"
              className={`data-[state=on]:bg-transparent ${
                isSelected("hide")
                  ? "*:[svg]:text-yellow-500 *:[svg]:stroke-yellow-500" 
                  : "*:[svg]:text-gray-500 *:[svg]:stroke-gray-500"
              }`}
            >
              <EyeOffIcon />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isSelected("hide") ? "Show app icon" : "Hide app icon"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="commands"
              aria-label="Toggle use commands"
              className={`data-[state=on]:bg-transparent ${
                isSelected("commands")
                  ? "*:[svg]:text-red-500 *:[svg]:stroke-red-500" 
                  : "*:[svg]:text-gray-500 *:[svg]:stroke-gray-500"
              }`}
            >
              <Terminal/>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isSelected("commands") ? "Disable key commands" : "Enable key commands"}</p>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </div>
  );
}

export default ToggleHeader;