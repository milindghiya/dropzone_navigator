const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('awsApi', {
  listObjects: (params) => ipcRenderer.invoke('list-objects', params),
  uploadFiles: (params) => ipcRenderer.invoke('upload-files', params),
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', callback),
  removeUploadProgressListener: (callback) => ipcRenderer.removeListener('upload-progress', callback)
});

