// desktop\index.js
const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const ioClient = require("socket.io-client");

let win;
let ffmpegProcess = null;
let socket = null;
let isAudioPaused = false;
let currentRecordingMode = null; // Track the current recording mode
let isClearingBuffer = false; // Flag to track if we're clearing buffer
let screenSharingMode = false;
let registeredShortcuts = [];

function createWindow() {
  win = new BrowserWindow({
    width: 600,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    center: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:3000");
  win.once("ready-to-show", () => win.show());

  win.webContents.on('paint', () => {
    if (screenSharingMode) {
      // In screen sharing mode, make window invisible to screen capture
      win.webContents.setWindowOpenHandler(() => ({
        action: 'deny'
      }));
    }
  });

  ipcMain.on("resize-window", (event, { width, height }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const display = screen.getDisplayMatching(window.getBounds());
    const maxHeight = display.workAreaSize.height;
    const safeHeight = Math.min(Math.round(height), maxHeight);
    const [currentW, currentH] = window.getSize();
    console.log("Resize request:", safeHeight, "Current:", currentH);

    if (safeHeight !== currentH) {
      window.setBounds(
        {
          x: window.getBounds().x,
          y: window.getBounds().y,
          width,
          height: safeHeight,
        },
        false
      );
    }
  });

  win.webContents.on('media-started-playing', () => {
    console.log('Media started playing - screen sharing might be active');
  });

  win.webContents.on('media-paused', () => {
    console.log('Media paused');
  });
}

// Function to register global shortcuts
function registerGlobalShortcuts() {
  // Import globalShortcut here to avoid issues
  const { globalShortcut } = require('electron');
  
  try {
    // Register example shortcuts (modify these as needed)
    const shortcuts = [
      {
        accelerator: 'CommandOrControl+Shift+9',
        action: 'toggle-invisibility-shortcut'
      },
      {
        accelerator: 'CommandOrControl+Shift+0',
        action: 'toggle-taskbar-shortcut'
      },
      {
        accelerator: 'CommandOrControl+Shift+1',
        action: 'toggle-voice-recording'
      },
      {
        accelerator: 'CommandOrControl+Shift+2',
        action: 'toggle-system-recording'
      },
      {
        accelerator: 'CommandOrControl+Shift+3',
        action: 'toggle-both-recording'
      },
      {
        accelerator: 'CommandOrControl+Shift+4',
        action: 'toggle-keyboard-shortcut'
      },
      {
        accelerator: 'CommandOrControl+Shift+5',
        action: 'toggle-screen-analyzer'
      },{
        accelerator: 'CommandOrControl+Shift+J',
        action: 'clear-chat-messages'
      },
      {
        accelerator: 'CommandOrControl+Shift+K',
        action: 'toggle-window-minimize'
      },
      {
        accelerator: 'CommandOrControl+Shift+6',
        action: 'toggle-audio-pause-resume'
      },
      {
        accelerator: 'CommandOrControl+Shift+7',
        action: 'delete-audio-buffer'
      }
      
    ];
    
    shortcuts.forEach(({ accelerator, action }) => {
      const isAlreadyRegistered = registeredShortcuts.some(s => s.accelerator === accelerator);
      if (!isAlreadyRegistered) {
        const ret = globalShortcut.register(accelerator, () => {
          if (win) {
            console.log(`Global shortcut triggered: ${accelerator} -> ${action}`);
            win.webContents.send('command-executed', action);
          }
        });
        
        if (ret) {
          registeredShortcuts.push({ accelerator, action });
          console.log(`Registered shortcut: ${accelerator}`);
        } else {
          console.log(`Failed to register shortcut: ${accelerator}`);
        }
      } else {
        console.log(`Shortcut already registered: ${accelerator}`);
      }
    });
    
  } catch (error) {
    console.error('Error registering global shortcuts:', error);
  }
}

// Function to unregister all global shortcuts
function unregisterGlobalShortcuts() {
  const { globalShortcut } = require('electron');
  
  try {
    if (registeredShortcuts.length > 0) {
      globalShortcut.unregisterAll();
      registeredShortcuts = [];
      console.log('All global shortcuts unregistered');
    }
  } catch (error) {
    console.error('Error unregistering global shortcuts:', error);
  }
}

// Handle toggle states from renderer
ipcMain.on('toggle-invisibility', (event, enabled) => {
  
  if (enabled) {
    console.log('Invisibility mode ENABLED');
    win.setContentProtection(true);
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    if (process.platform === 'win32') {
      win.setOpacity(0.999);
    }
    
  } else {
    console.log('Invisibility mode DISABLED');
    win.setContentProtection(false);
    win.setVisibleOnAllWorkspaces(false);
    win.setOpacity(1);
  }
});

ipcMain.on('toggle-taskbar', (event, hidden) => {
  if (hidden) {
    // Hide app from taskbar
    console.log('Hiding app from taskbar');
    win.setSkipTaskbar(true);
    
    // Also hide from alt-tab switcher on Windows
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true);
    }
    
  } else {
    // Show app in taskbar
    console.log('Showing app in taskbar');
    win.setSkipTaskbar(false);
    
    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true, 'normal');
      win.setVisibleOnAllWorkspaces(false);
    }
  }
});

ipcMain.on('toggle-commands', (event, enabled) => {
  if (enabled) {
    console.log('Terminal commands ENABLED');
    registerGlobalShortcuts();
  } else {
    console.log('Terminal commands DISABLED');
    unregisterGlobalShortcuts();
  }
});

// In desktop\index.js, add this IPC handler and track window state:
let isWindowMinimized = false;

ipcMain.on('toggle-window-minimize', () => {
  if (win) {
    if (win.isMinimized()) {
      // Restore the window if it's minimized
      win.restore();
      isWindowMinimized = false;
      console.log('Window restored');
    } else {
      // Minimize the window
      win.minimize();
      isWindowMinimized = true;
      console.log('Window minimized');
    }
  }
});

ipcMain.on('start-voice-recording', () => {
  console.log('Starting voice recording via command');
  // This will be handled by the renderer process
});

ipcMain.on('start-system-recording', () => {
  console.log('Starting system recording via command');
  // This will be handled by the renderer process
});

ipcMain.on('start-both-recording', () => {
  console.log('Starting both recording via command');
  // This will be handled by the renderer process
});

ipcMain.on('stop-recording', () => {
  console.log('Stopping recording via command');
  // This will be handled by the renderer process
});

ipcMain.on('toggle-audio-pause-resume', () => {
  console.log('Toggle audio pause/resume via command');
  
  if (ffmpegProcess) {
    if (isAudioPaused) {
      // Resume audio using existing handler
      ipcMain.emit('audio-resume');
    } else {
      // Pause audio using existing handler
      ipcMain.emit('audio-pause');
    }
  } else {
    console.log('No active audio recording to pause/resume');
  }
});

// NEW: Audio buffer clear command handler - SIMPLIFIED
ipcMain.on('delete-audio-buffer', () => {
  console.log('Clear audio buffer via command');
  // Use existing handler
  ipcMain.emit('audio-delete');
});

ipcMain.on('audio-pause', () => {
  if (ffmpegProcess && !isAudioPaused) {
    isAudioPaused = true;
    
    // Pause ffmpeg process (Unix-like systems)
    if (process.platform !== 'win32') {
      ffmpegProcess.kill('SIGSTOP');
    } else {
      console.log('Audio paused (Windows)');
    }
    
    // Send pause to backend
    if (socket && socket.connected) {
      socket.emit("pause_stream");
    }
    
    console.log('Audio recording paused');
  }
});

ipcMain.on('audio-resume', () => {
  if (ffmpegProcess && isAudioPaused) {
    isAudioPaused = false;
    
    // Resume ffmpeg process (Unix-like systems)
    if (process.platform !== 'win32') {
      ffmpegProcess.kill('SIGCONT');
    } else {
      console.log('Audio resumed (Windows)');
    }
    
    // Send resume to backend
    if (socket && socket.connected) {
      socket.emit("resume_stream");
    }
    
    console.log('Audio recording resumed');
  }
});

ipcMain.on('audio-delete', () => {
  console.log('Audio buffer clear requested');
  
  // Set clearing flag to prevent stop_stream emission
  isClearingBuffer = true;
  
  // Clear backend buffer first
  if (socket && socket.connected) {
    console.log('Emitting clear_stream to backend');
    socket.emit("clear_stream");
  }
  
  // If ffmpeg is running and we have a current mode, restart it
  if (ffmpegProcess && currentRecordingMode) {
    console.log(`Restarting ffmpeg for mode: ${currentRecordingMode}`);
    
    // Remove the close listener temporarily to prevent stop_stream emission
    ffmpegProcess.removeAllListeners('close');
    
    // Kill the current ffmpeg process
    try {
      ffmpegProcess.kill('SIGKILL'); // Force kill to ensure quick restart
    } catch (err) {
      console.error('Error killing ffmpeg:', err);
    }
    
    // Clear the process reference
    ffmpegProcess = null;
    
    // Restart ffmpeg after a short delay
    setTimeout(() => {
      console.log(`Restarting audio capture with mode: ${currentRecordingMode}`);
      const success = startAudioCapture(currentRecordingMode);
      
      if (success) {
        console.log('FFmpeg restarted successfully after clear');
      } else {
        console.error('Failed to restart ffmpeg after clear');
      }
      
      // Reset clearing flag
      isClearingBuffer = false;
    }, 100);
  } else {
    console.log('No ffmpeg process to restart or no current mode');
    // Reset clearing flag
    isClearingBuffer = false;
  }
});

// Handle app events
app.whenReady().then(() => {
  createWindow();
  console.log('App ready, global shortcuts can now be registered');
});


function ensureSocketConnected() {
  if (socket && socket.connected) return socket;
  
  socket = ioClient.connect("http://127.0.0.1:8000", {
    transports: ["websocket"],
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.info("Connected to backend socket:", socket.id);
  });

  socket.on("transcript", (data) => {
    if (win && win.webContents) {
      win.webContents.send("mic-text", data.partial || "");
      if (data.final) {
        win.webContents.send("mic-final", data.final);
      }
    }
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connect error:", err.message || err);
  });

  socket.on("disconnect", (reason) => {
    console.info("Socket disconnected:", reason);
  });

  return socket;
}

function startAudioCapture(mode) {
  if (ffmpegProcess) {
    console.log("Stopping existing audio capture...");
    try {
      ffmpegProcess.kill("SIGINT");
    } catch (err) {
      console.error("Error stopping existing process:", err);
    }
    ffmpegProcess = null;
  }
  
  ensureSocketConnected();
  
  const micName = "Microphone (Realtek(R) Audio)";
  const speakersName = "Stereo Mix (Realtek(R) Audio)";
  
  let ffmpegArgs;
  
  switch(mode) {
    case "system":
      // Capture audio playing through speakers
      console.info("Starting SYSTEM AUDIO capture from Speakers...");
      ffmpegArgs = [
        "-f", "dshow",
        "-i", `audio=${speakersName}`,
        "-ar", "16000",
        "-ac", "1",
        "-f", "s16le",
        "-"
      ];
      break;
      
    case "voice":
      // Capture from microphone
      console.info("Starting VOICE capture from Microphone...");
      ffmpegArgs = [
        "-f", "dshow",
        "-i", `audio=${micName}`,
        "-ar", "16000",
        "-ac", "1",
        "-f", "s16le",
        "-"
      ];
      break;
      
    case "both":
      // Capture both simultaneously (mix them)
      console.info("Starting BOTH microphone and system audio...");
      ffmpegArgs = [
        "-f", "dshow",
        "-i", `audio=${micName}`,      // Microphone input
        "-f", "dshow",
        "-i", `audio=${speakersName}`, // Speakers (system audio) input
        "-filter_complex", "amix=inputs=2:duration=longest", // Mix both inputs
        "-ar", "16000",
        "-ac", "1",
        "-f", "s16le",
        "-"
      ];
      break;
      
    default:
      console.error("Unknown mode:", mode);
      return false;
  }
  
  try {
    ffmpegProcess = spawn("ffmpeg", ffmpegArgs, { windowsHide: true });
    
    ffmpegProcess.stdout.on("data", (chunk) => {
      if (socket && socket.connected) {
        socket.emit("audio_chunk", chunk);
      }
    });
    
    ffmpegProcess.stderr.on("data", () => {
      // Optional: uncomment for debugging
      // console.debug("ffmpeg stderr:", d.toString());
    });
    
    ffmpegProcess.on("error", (err) => {
      console.error("ffmpeg error:", err);
      ffmpegProcess = null;
    });
    
    ffmpegProcess.on("close", (code) => {
      console.info(`ffmpeg closed with code ${code}`);
      ffmpegProcess = null;
      
      // Only emit stop_stream if we're NOT clearing the buffer
      if (socket && socket.connected && !isClearingBuffer) {
        socket.emit("stop_stream");
      }
    });
    
    // Inform backend to start streaming session
    if (socket && socket.connected) {
      socket.emit("start_stream", { 
        sample_rate: 16000, 
        channels: 1, 
        sample_width: 2,
        mode: mode 
      });
    }
    
    return true;
    
  } catch (err) {
    console.error(`Failed to start ${mode} capture:`, err);
    
    // Try alternative approaches if direct capture fails
    if (mode === "system") {
      console.info("Trying alternative system audio capture methods...");
      
      // Method 1: Try with "Stereo Mix"
      try {
        ffmpegProcess = spawn("ffmpeg", [
          "-f", "dshow",
          "-i", "audio=Stereo Mix",
          "-ar", "16000",
          "-ac", "1",
          "-f", "s16le",
          "-"
        ], { windowsHide: true });
        
        setupFFmpegProcess();
        return true;
      } catch (err1) {
        console.error("Stereo Mix also failed:", err1);
      }
      
      // Method 2: You might need to enable Stereo Mix in Windows
      console.error(`
      ==============================================
      SYSTEM AUDIO CAPTURE FAILED
      
      To capture system audio on Windows, you need to:
      1. Right-click the speaker icon in system tray
      2. Select "Sounds"
      3. Go to "Recording" tab
      4. Right-click and enable "Show Disabled Devices"
      5. Enable "Stereo Mix" or "What U Hear"
      6. Set it as default recording device
      
      OR install a virtual audio cable:
      - VB-Cable: https://vb-audio.com/Cable/
      - Or use the loopback-capture-sample you mentioned
      ==============================================
      `);
    }
    
    return false;
  }
}

function setupFFmpegProcess() {
  if (!ffmpegProcess) return;
  
  ffmpegProcess.stdout.on("data", (chunk) => {
    if (socket && socket.connected) {
      socket.emit("audio_chunk", chunk);
    }
  });
  
  ffmpegProcess.on("close", (code) => {
    console.info("ffmpeg closed", code);
    ffmpegProcess = null;
    
    // Only emit stop_stream if we're NOT clearing the buffer
    if (socket && socket.connected && !isClearingBuffer) {
      socket.emit("stop_stream");
    }
  });
}

ipcMain.on("audio-start", (event, mode) => {
  console.log("Starting audio capture with mode:", mode);
  currentRecordingMode = mode; // Store the current mode
  
  if (ffmpegProcess) {
    // Stop existing capture first
    try {
      ffmpegProcess.kill("SIGINT");
    } catch (err) {
      console.error("Error stopping existing ffmpeg:", err);
    }
    ffmpegProcess = null;
  }
  
  const success = startAudioCapture(mode);
  
  if (!success) {
    // Notify renderer of failure
    if (win && win.webContents) {
      win.webContents.send("audio-error", `Failed to start ${mode} capture`);
    }
  }
});

ipcMain.on("audio-stop", () => {
  if (!ffmpegProcess) return;
  
  console.log("Stopping audio capture");
  
  try {
    if (socket && socket.connected) {
      socket.emit("stop_stream");
    }
    ffmpegProcess.kill("SIGINT");
  } catch (err) {
    console.error("Error stopping ffmpeg:", err);
    try { ffmpegProcess.kill(); } catch(e) {}
  } finally {
    ffmpegProcess = null;
    currentRecordingMode = null; // Clear the mode when stopping
  }
});

// Handle audio error messages
ipcMain.on("audio-error", (event, message) => {
  if (win && win.webContents) {
    win.webContents.send("audio-error", message);
  }
});

ipcMain.on('capture-screenshot', async (event) => {
  try {
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    let wasVisible = true;
    
    // Hide the current window temporarily to capture what's behind it
    if (currentWindow && currentWindow.isVisible()) {
      wasVisible = true;
      currentWindow.hide();
      // Small delay to ensure window is hidden before capture
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Get all available displays
    const displays = screen.getAllDisplays();
    
    // Capture screens from all displays and combine them
    const allScreenshots = [];
    
    for (const display of displays) {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: display.size.width,
            height: display.size.height
          },
          screen: display.id
        });

        if (sources.length > 0) {
          // Take the first source (should be the screen)
          const screenshot = sources[0].thumbnail;
          allScreenshots.push({
            display,
            screenshot
          });
          console.log(`Captured screen ${display.id}: ${display.size.width}x${display.size.height}`);
        }
      } catch (err) {
        console.error(`Failed to capture display ${display.id}:`, err);
      }
    }

    if (allScreenshots.length === 0) {
      throw new Error("No screens could be captured");
    }

    // For now, just send the primary display screenshot
    const primaryDisplay = screen.getPrimaryDisplay();
    const primaryScreenshot = allScreenshots.find(s => s.display.id === primaryDisplay.id);
    
    if (!primaryScreenshot) {
      // Fallback to first screenshot
      const firstScreenshot = allScreenshots[0];
      const pngBuffer = firstScreenshot.screenshot.toPNG();
      
      event.sender.send('screenshot-captured', {
        type: 'image/png',
        data: pngBuffer
      });
    } else {
      const pngBuffer = primaryScreenshot.screenshot.toPNG();
      
      event.sender.send('screenshot-captured', {
        type: 'image/png',
        data: pngBuffer
      });
    }

    // Show the window again if it was visible
    if (currentWindow && wasVisible) {
      currentWindow.show();
    }

  } catch (error) {
    console.error('Screenshot capture error:', error);
    
    // Ensure window is shown even on error
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (currentWindow) {
      currentWindow.show();
    }
    
    event.sender.send('screenshot-error', error.message || 'Unknown error');
  }
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    unregisterGlobalShortcuts();
    app.quit();
  }
});

app.on("before-quit", () => {
  unregisterGlobalShortcuts();
  
  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill("SIGINT");
    } catch (err) {
      console.error("Error stopping ffmpeg on quit:", err);
    }
  }
});