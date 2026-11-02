const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fx', { onCfg: cb => ipcRenderer.on('fx:cfg', (_, c) => cb(c)) });
