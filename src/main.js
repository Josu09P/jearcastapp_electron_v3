const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const url = require('url')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // 👈 oculta la barra de menú
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadURL(
    url.format({
      pathname: path.join(__dirname, 'jearcast-view', 'dist', 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  )

  // Solo abrir devtools en modo desarrollo
  if (!app.isPackaged) {
    win.webContents.openDevTools()
  }
}

// Elimina la barra de menú global (como "File, Edit...") completamente
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
