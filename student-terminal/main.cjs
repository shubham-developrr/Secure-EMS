const { app, BrowserWindow, ipcMain, Menu, protocol, net, globalShortcut } = require('electron');
const path = require('path');
const url = require('url');

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
    mainWindow.loadURL('app://index.html');
  } else {
    mainWindow.loadURL('app://index.html');
  }
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    let requestUrl = request.url.slice('app://'.length);
    // If it's exactly app:// or app://index.html
    if (requestUrl === '' || requestUrl === '/' || requestUrl === 'index.html') {
      return net.fetch(url.pathToFileURL(path.join(__dirname, 'dist', 'index.html')).toString());
    }
    // Remove leading slash if any
    if (requestUrl.startsWith('/')) requestUrl = requestUrl.slice(1);
    return net.fetch(url.pathToFileURL(path.join(__dirname, 'dist', requestUrl)).toString());
  });

  createWindow();

  // Register global shortcut for secret admin exit (Ctrl+A)
  // This fires even in kiosk mode and sends IPC to the renderer
  globalShortcut.register('CommandOrControl+A', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
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
