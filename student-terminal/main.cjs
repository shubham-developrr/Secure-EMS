const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: true, // Forces fullscreen and disables some OS shortcuts
    alwaysOnTop: true, // Prevent other windows from coming on top
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  Menu.setApplicationMenu(null); // Removes the top menu bar

  // Prevent window from being closed normally
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(createWindow);

// IPC handler to safely quit the app when admin unlocks
ipcMain.on('admin-quit', () => {
  app.isQuitting = true;
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
