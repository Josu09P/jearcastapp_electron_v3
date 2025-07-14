const { app, BrowserWindow } = require('electron')
const path = require('path')
const express = require('express')

let mainWindow

function createWindow() {
  const expressApp = express()
  const distPath = path.join(__dirname, 'jearcast-view', 'dist')

  expressApp.use(express.static(distPath))

  const server = expressApp.listen(3000, () => {
    console.log('Servidor interno corriendo en http://localhost:3000')

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, './preload.js'),
      },
    })

    mainWindow.loadURL('http://localhost:3000')

  /*
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools()
    }
  */
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
