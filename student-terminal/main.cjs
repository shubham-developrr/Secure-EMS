const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require('electron');
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
      webSecurity: false,
      plugins: true,
    },
  });

  Menu.setApplicationMenu(null); // Removes the top menu bar

  // Prevent window from being closed normally
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
    }
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (app.isPackaged) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadFile(indexPath).catch(() => {
      mainWindow.loadURL('http://localhost:5173');
    });
  }

  // Log load failures if any
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load ${validatedURL}: [${errorCode}] ${errorDescription}`);
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register global shortcut for secret admin exit (Ctrl+A)
  // This fires even in kiosk mode and sends IPC to the renderer
  globalShortcut.register('CommandOrControl+A', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.webContents.focus();
      mainWindow.webContents.send('secret-exit-trigger');
    }
  });
});

// IPC handler to safely quit the app when admin unlocks
ipcMain.on('admin-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
