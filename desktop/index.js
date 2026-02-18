// desktop\index.js
const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const ioClient = require("socket.io-client");
const { autoUpdater } = require('electron-updater');
const { setupAutoUpdater } = require('./updater');

let win;
let ffmpegProcess = null;
let socket = null;
let isAudioPaused = false;
let currentRecordingMode = null;
let isClearingBuffer = false;
let registeredShortcuts = [];

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";

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

  win.loadURL(FRONTEND_URL);
  win.once("ready-to-show", () => win.show());

  setupAutoUpdater(win);

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 60 * 60 * 1000);

  ipcMain.on("resize-window", (event, { width, height }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const display = screen.getDisplayMatching(window.getBounds());
    const maxHeight = display.workAreaSize.height;
    const safeHeight = Math.min(Math.round(height), maxHeight);
    const [currentW, currentH] = window.getSize();

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

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
  setImmediate(() => autoUpdater.quitAndInstall());
});

function registerGlobalShortcuts() {
  const { globalShortcut } = require('electron');

  try {
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
      }, {
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
      },
      {
        accelerator: 'CommandOrControl+Shift+Q',
        action: 'reload-last-message'
      }
    ];

    shortcuts.forEach(({ accelerator, action }) => {
      const isAlreadyRegistered = registeredShortcuts.some(s => s.accelerator === accelerator);
      if (!isAlreadyRegistered) {
        const ret = globalShortcut.register(accelerator, () => {
          if (win) {
            win.webContents.send('command-executed', action);
          }
        });

        if (ret) {
          registeredShortcuts.push({ accelerator, action });
        } else {
          console.warn(`Failed to register shortcut: ${accelerator}`);
        }
      }
    });

  } catch (error) {
    console.error('Error registering global shortcuts:', error);
  }
}

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
    console.log('Hiding app from taskbar');
    win.setSkipTaskbar(true);

    if (process.platform === 'win32') {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true);
    }

  } else {
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

let isWindowMinimized = false;

ipcMain.on('toggle-window-minimize', () => {
  if (win) {
    if (win.isMinimized()) {
      win.restore();
      isWindowMinimized = false;
      console.log('Window restored');
    } else {
      win.minimize();
      isWindowMinimized = true;
      console.log('Window minimized');
    }
  }
});

ipcMain.on('start-voice-recording', () => {
  // no-op, handled by frontend/shortcuts potentially
});

ipcMain.on('start-system-recording', () => {
  // no-op
});

ipcMain.on('start-both-recording', () => {
  // no-op
});

ipcMain.on('stop-recording', () => {
  // no-op
});

ipcMain.on('toggle-audio-pause-resume', () => {
  console.log('Toggle audio pause/resume via command');

  if (ffmpegProcess) {
    if (isAudioPaused) {
      ipcMain.emit('audio-resume');
    } else {
      ipcMain.emit('audio-pause');
    }
  } else {
    console.log('No active audio recording to pause/resume');
  }
});

ipcMain.on('delete-audio-buffer', () => {
  console.log('Clear audio buffer via command');
  ipcMain.emit('audio-delete');
});

ipcMain.on('audio-pause', () => {
  if (ffmpegProcess && !isAudioPaused) {
    isAudioPaused = true;

    if (process.platform !== 'win32') {
      ffmpegProcess.kill('SIGSTOP');
    } else {
      console.log('Audio paused (Windows)');
    }

    if (socket && socket.connected) {
      socket.emit("pause_stream");
    }

    console.log('Audio recording paused');
  }
});

ipcMain.on('audio-resume', () => {
  if (ffmpegProcess && isAudioPaused) {
    isAudioPaused = false;

    if (process.platform !== 'win32') {
      ffmpegProcess.kill('SIGCONT');
    } else {
      console.log('Audio resumed (Windows)');
    }

    if (socket && socket.connected) {
      socket.emit("resume_stream");
    }

    console.log('Audio recording resumed');
  }
});

ipcMain.on('audio-delete', () => {
  console.log('Audio buffer clear requested');

  isClearingBuffer = true;

  if (socket && socket.connected) {
    console.log('Emitting clear_stream to backend');
    socket.emit("clear_stream");
  }

  if (ffmpegProcess && currentRecordingMode) {
    console.log(`Restarting ffmpeg for mode: ${currentRecordingMode}`);

    ffmpegProcess.removeAllListeners('close');

    try {
      ffmpegProcess.kill('SIGKILL');
    } catch (err) {
      console.error('Error killing ffmpeg:', err);
    }

    ffmpegProcess = null;

    setTimeout(() => {
      console.log(`Restarting audio capture with mode: ${currentRecordingMode}`);
      const success = startAudioCapture(currentRecordingMode);

      if (success) {
        console.log('FFmpeg restarted successfully after clear');
      } else {
        console.error('Failed to restart ffmpeg after clear');
      }

      isClearingBuffer = false;
    }, 100);
  } else {
    console.log('No ffmpeg process to restart or no current mode');
    isClearingBuffer = false;
  }
});

app.whenReady().then(() => {
  createWindow();
  console.log('App ready, global shortcuts can now be registered');
});


function ensureSocketConnected() {
  if (socket && socket.connected) {
    console.log(`Socket already connected: ${socket.id}`);
    return socket;
  }

  console.log("Creating new socket connection...");

  if (socket) {
    socket.disconnect();
  }

  socket = ioClient.connect("http://127.0.0.1:8000", {
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.info("Connected to backend socket:", socket.id);
  });

  socket.on("transcript", (data) => {
    if (win && win.webContents) {
      win.webContents.send("mic-text", data.partial || "");
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
  return new Promise((resolve) => {
    console.log(`[1] Starting audio capture for mode: ${mode}`);

    if (ffmpegProcess) {
      console.log("Stopping existing audio capture...");
      try {
        ffmpegProcess.kill("SIGINT");
      } catch (err) {
        console.error("Error stopping existing process:", err);
      }
      ffmpegProcess = null;
    }

    console.log(`[2] Ensuring socket connection...`);

    ensureSocketConnected();

    const checkConnection = () => {
      if (socket && socket.connected) {
        console.log(`[3.2] Socket connected: ${socket.id}, proceeding with capture...`);
        proceedWithCapture();
      } else {
        console.log(`[3.1] Waiting for socket connection...`);
        setTimeout(checkConnection, 100);
      }
    };

    checkConnection();

    function proceedWithCapture() {
      const micName = "Microphone (Realtek(R) Audio)";
      const speakersName = "Stereo Mix (Realtek(R) Audio)";

      let ffmpegArgs;

      switch (mode) {
        case "system":
          console.info("[4] Starting SYSTEM AUDIO capture from Speakers...");
          ffmpegArgs = [
            "-f", "dshow",
            "-i", `audio=${speakersName}`,
            "-tune", "zerolatency",
            "-ar", "16000",
            "-ac", "1",
            "-f", "s16le",
            "-"
          ];
          break;

        case "voice":
          console.info("[4] Starting VOICE capture from Microphone...");
          ffmpegArgs = [
            "-f", "dshow",
            "-i", `audio=${micName}`,
            "-tune", "zerolatency",
            "-ar", "16000",
            "-ac", "1",
            "-f", "s16le",
            "-"
          ];
          break;

        case "both":
          console.info("[4] Starting BOTH microphone and system audio...");
          ffmpegArgs = [
            "-f", "dshow",
            "-i", `audio=${micName}`,
            "-f", "dshow",
            "-i", `audio=${speakersName}`,
            "-filter_complex", "amix=inputs=2:duration=longest",
            "-tune", "zerolatency",
            "-ar", "16000",
            "-ac", "1",
            "-f", "s16le",
            "-"
          ];
          break;

        default:
          console.error("Unknown mode:", mode);
          resolve(false);
          return;
      }

      try {
        console.log(`[5] Starting ffmpeg...`);
        ffmpegProcess = spawn("ffmpeg", ffmpegArgs, { windowsHide: true });

        console.log(`[6] FFmpeg started with PID: ${ffmpegProcess.pid}`);

        setupFFmpegProcess();

        console.log(`[7] Emitting start_stream to backend`);
        socket.emit("start_stream", {
          sample_rate: 16000,
          channels: 1,
          sample_width: 2,
          mode: mode
        });

        console.log(`[8] Audio capture started successfully!`);
        resolve(true);

      } catch (err) {
        console.error(`Failed to start ${mode} capture:`, err);

        if (mode === "system") {
          console.info("[9] Trying alternative system audio capture methods...");

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

            socket.emit("start_stream", {
              sample_rate: 16000,
              channels: 1,
              sample_width: 2,
              mode: mode
            });

            console.log(`[10] Alternative capture started successfully!`);
            resolve(true);
            return;
          } catch (err1) {
            console.error("Stereo Mix also failed:", err1);
          }
        }

        resolve(false);
      }
    }
  });
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

  });
}

ipcMain.on("audio-start", (event, mode) => {
  console.log("Starting audio capture with mode:", mode);
  currentRecordingMode = mode;

  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill("SIGINT");
    } catch (err) {
      console.error("Error stopping existing ffmpeg:", err);
    }
    ffmpegProcess = null;
  }

  const success = startAudioCapture(mode);

  if (!success) {
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
    try { ffmpegProcess.kill(); } catch (e) { }
  } finally {
    ffmpegProcess = null;
    currentRecordingMode = null;
  }
});

ipcMain.on("audio-error", (event, message) => {
  if (win && win.webContents) {
    win.webContents.send("audio-error", message);
  }
});

ipcMain.on('capture-screenshot', async (event) => {
  try {
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    let wasVisible = true;

    if (currentWindow && currentWindow.isVisible()) {
      wasVisible = true;
      currentWindow.hide();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const displays = screen.getAllDisplays();

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

    const primaryDisplay = screen.getPrimaryDisplay();
    const primaryScreenshot = allScreenshots.find(s => s.display.id === primaryDisplay.id);

    if (!primaryScreenshot) {
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

    if (currentWindow && wasVisible) {
      currentWindow.show();
    }

  } catch (error) {
    console.error('Screenshot capture error:', error);

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