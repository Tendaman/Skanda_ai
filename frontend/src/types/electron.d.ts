// frontend\src\types\electron.d.ts
export {};

declare global {
  interface Window {
    electronAPI?: {
      resizeWindow: (width: number, height: number) => void;
      setWindowVisibility: (visible: boolean) => void;
      getWindowState: () => Promise<any>;
      onVisibilityChange: (callback: (isVisible: boolean) => void) => void;
      toggleInvisibility: (enabled: boolean) => void;
      toggleTaskbar: (hidden: boolean) => void;
      toggleCommands: (enabled: boolean) => void;
      reportScreenSharing: (isSharing: boolean) => void;
      onCommandExecuted: (callback: (command: string) => void) => void;
      toggleWindowMinimize: (isMinimized: boolean) => void;
    };
    audioAPI?: {
      start: (mode: 'voice' | 'system' | 'both') => void;
      stop: () => void;
      pause?: () => void; 
      resume?: () => void;
      delete?: () => void;
      onText: (callback: (text: string) => void) => void;
      onError: (callback: (message: string) => void) => void; 
    };
    screenAPI?: {
      captureBackgroundWindow: () => Promise<string>;
    };
    
    __AUDIO_PAUSE_RESUME_COMMAND__?: () => void;
    __AUDIO_DELETE_COMMAND__?: () => void;
    __TOGGLE_VOICE_RECORDING__?: () => void;
    __TOGGLE_SYSTEM_RECORDING__?: () => void;
    __TOGGLE_BOTH_RECORDING__?: () => void;
    __TOGGLE_KEYBOARD__?: () => void;
    __TOGGLE_SCREEN_ANALYZER__?: () => void;
  }
}