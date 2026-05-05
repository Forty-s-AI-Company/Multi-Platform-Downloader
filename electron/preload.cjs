/* eslint-disable @typescript-eslint/no-var-requires */
const { clipboard, contextBridge, ipcRenderer } = require("electron");

// 只暴露「必要」能力給 renderer，避免 renderer 拿到 Node 權限。
contextBridge.exposeInMainWorld("api", {
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  listFormats: (url) => ipcRenderer.invoke("ytDlp:listFormats", url),
  collectDouyinEntries: (params) => ipcRenderer.invoke("douyin:collectUrls", params),
  collectTikTokEntries: (params) => ipcRenderer.invoke("tiktok:collectUrls", params),
  startJob: (req) => ipcRenderer.invoke("jobs:start", req),
  getJobsState: () => ipcRenderer.invoke("jobs:getState"),
  getQueueState: () => ipcRenderer.invoke("jobs:getQueueState"),
  pauseQueue: () => ipcRenderer.invoke("jobs:pauseQueue"),
  resumeQueue: () => ipcRenderer.invoke("jobs:resumeQueue"),
  pauseJob: (jobId) => ipcRenderer.invoke("jobs:pauseOne", jobId),
  resumeJob: (jobId) => ipcRenderer.invoke("jobs:resumeOne", jobId),
  cancelJob: (jobId) => ipcRenderer.invoke("jobs:cancelOne", jobId),
  removeJobs: (jobIds) => ipcRenderer.invoke("jobs:removeMany", jobIds),
  clearJobs: () => ipcRenderer.invoke("jobs:clearAll"),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text) => clipboard.writeText(text),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath),
  onJobEvent: (listener) => {
    const handler = (_event, evt) => listener(evt);
    ipcRenderer.on("jobs:event", handler);
    return () => ipcRenderer.removeListener("jobs:event", handler);
  }
});
