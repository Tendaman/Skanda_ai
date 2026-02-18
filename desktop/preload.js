//desktop\preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (width, height) =>
    ipcRenderer.send("resize-window", { width, height }),

  resizeWindow: (width, height) =>
    ipcRenderer.send("resize-window", { width, height }),

  // New methods for toggle features
  toggleInvisibility: (enabled) =>
    ipcRenderer.send("toggle-invisibility", enabled),

  toggleTaskbar: (hidden) =>
    ipcRenderer.send("toggle-taskbar", hidden),

  toggleCommands: (enabled) =>
    ipcRenderer.send("toggle-commands", enabled),

  // Screen sharing detection
  toggleCommands: (enabled) =>
    ipcRenderer.send("toggle-commands", enabled),

  // Command execution
  onCommandExecuted: (callback) =>
    ipcRenderer.on("command-executed", (event, command) => callback(command)),

  toggleWindowMinimize: () =>
    ipcRenderer.send('toggle-window-minimize'),

  onUpdateChecking: (callback) => 
    ipcRenderer.on('update-checking', () => callback()),
  
  onUpdateAvailable: (callback) => 
    ipcRenderer.on('update-available', (event, info) => callback(info)),
  
  onUpdateNotAvailable: (callback) => 
    ipcRenderer.on('update-not-available', () => callback()),
  
  onUpdateDownloading: (callback) => 
    ipcRenderer.on('update-downloading', () => callback()),
  
  onUpdateProgress: (callback) => 
    ipcRenderer.on('update-progress', (event, progress) => callback(progress)),
  
  onUpdateError: (callback) => 
    ipcRenderer.on('update-error', (event, error) => callback(error)),
  
  checkForUpdates: () => 
    ipcRenderer.send('check-for-updates'),
  
  downloadUpdate: () => 
    ipcRenderer.send('download-update'),
  
  installUpdate: () => 
    ipcRenderer.send('install-update')
});

contextBridge.exposeInMainWorld('audioAPI', {
  start: (mode) => {
    ipcRenderer.send('audio-start', mode);
  },
  stop: () => {
    ipcRenderer.send('audio-stop');
  },
  pause: () => {
    ipcRenderer.send('audio-pause');
  },
  resume: () => {
    ipcRenderer.send('audio-resume');
  },
  delete: () => {
    ipcRenderer.send('audio-delete');
  },
  onText: (callback) => {
    ipcRenderer.on('mic-text', (event, text) => callback(text));
  },
  onError: (callback) => {
    ipcRenderer.on('audio-error', (event, message) => callback(message));
  }
});


contextBridge.exposeInMainWorld('screenAPI', {
  captureBackgroundWindow: () => {
    return new Promise((resolve, reject) => {
      // Set up response listener
      const handleResponse = (event, blobData) => {
        ipcRenderer.removeListener('screenshot-captured', handleResponse);
        ipcRenderer.removeListener('screenshot-error', handleError);

        if (!blobData) {
          reject(new Error("No screenshot data received"));
          return;
        }

        // Convert the data to a Blob
        const blob = new Blob([blobData.data], { type: blobData.type });
        resolve(blob);
      };

      const handleError = (event, error) => {
        ipcRenderer.removeListener('screenshot-captured', handleResponse);
        ipcRenderer.removeListener('screenshot-error', handleError);
        reject(new Error(error || "Screenshot capture failed"));
      };

      ipcRenderer.once('screenshot-captured', handleResponse);
      ipcRenderer.once('screenshot-error', handleError);

      // Request the screenshot
      ipcRenderer.send('capture-screenshot');
    });
  }
});