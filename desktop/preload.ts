import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("gigma", {
  list: () => ipcRenderer.invoke("gigma:list"),
  load: (id: string) => ipcRenderer.invoke("gigma:load", id),
  save: (document: unknown, revision: number) =>
    ipcRenderer.invoke("gigma:save", document, revision),
  config: () => ipcRenderer.invoke("gigma:config"),
  openFolder: () => ipcRenderer.invoke("gigma:folder"),
  onBeforeClose: (callback: () => Promise<void>) => {
    const handler = async () => {
      try {
        await callback();
        ipcRenderer.send("gigma:close-ready");
      } catch {
        /* Keep the window and unsaved document open. */
      }
    };
    ipcRenderer.on("gigma:before-close", handler);
    return () => ipcRenderer.removeListener("gigma:before-close", handler);
  },
});
