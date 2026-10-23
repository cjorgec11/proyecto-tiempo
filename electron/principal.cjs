// Punto de entrada de Electron: crea una ventana que carga index.html.
// No usa el servidor Node — los archivos se sirven directamente desde disco.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: "#f6f8f3",
    title: "RideCast",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ventana.setMenuBarVisibility(false);
  ventana.loadFile(path.join(__dirname, "..", "index.html"));

  // Los enlaces externos se abren en el navegador del sistema y la ventana nunca
  // abandona la aplicación (sin menú no habría forma de volver).
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    abrirFuera(url);
    return { action: "deny" };
  });
  ventana.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    abrirFuera(url);
  });
}

function abrirFuera(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

app.whenReady().then(crearVentana);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) crearVentana();
});
