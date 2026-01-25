//desktop\preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (width, height) =>
    ipcRenderer.send("resize-window", { width, height }),
  
  setWindowVisibility: (visible) => 
    ipcRenderer.send("set-window-visibility", visible),
  
  getWindowState: () => 
    ipcRenderer.invoke("get-window-state"),
  
  onVisibilityChange: (callback) => 
    ipcRenderer.on("window-visibility-changed", (event, isVisible) => callback(isVisible)),
  
  // New methods for toggle features
  toggleInvisibility: (enabled) =>
    ipcRenderer.send("toggle-invisibility", enabled),
  
  toggleTaskbar: (hidden) =>
    ipcRenderer.send("toggle-taskbar", hidden),
  
  toggleCommands: (enabled) =>
    ipcRenderer.send("toggle-commands", enabled),
  
  // Screen sharing detection
  reportScreenSharing: (isSharing) =>
    ipcRenderer.send("report-screen-sharing", isSharing),
  
  // Command execution
  onCommandExecuted: (callback) =>
    ipcRenderer.on("command-executed", (event, command) => callback(command)),

  toggleWindowMinimize: () =>
    ipcRenderer.send('toggle-window-minimize'),
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