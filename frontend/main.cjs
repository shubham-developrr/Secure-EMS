const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: "Secure EMS"
  });

  // Check if we are in development mode (by seeing if app is packaged)
  const isDev = !app.isPackaged;

  if (isDev) {
    // In dev, assuming Vite is running on localhost:5173
    // But for this setup, we can also just load the dist folder if it's built
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(() => {
        mainWindow.loadURL('http://localhost:5173');
    });
  } else {
    // In production, load the built React app from the dist folder
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    console.log("Starting python backend from source...");
    pythonProcess = spawn('python', ['server.py'], {
      cwd: __dirname
    });
  } else {
    console.log("Starting packaged python backend...");
    // Assuming PyInstaller builds the executable in dist/server/server.exe
    const executablePath = path.join(__dirname, 'dist-backend', 'server.exe'); 
    pythonProcess = spawn(executablePath, [], {
      cwd: __dirname
    });
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Backend stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Backend stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

app.on('ready', () => {
  startPythonBackend();
  
  // Wait a moment for the backend to start up
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Kill the python process when the app quits
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
