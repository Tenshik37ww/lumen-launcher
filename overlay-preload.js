const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', {
  onData: cb => ipcRenderer.on('overlay:data', (_, d) => cb(d)),
  size: (w, h) => ipcRenderer.send('overlay:size', { w, h }),
});
