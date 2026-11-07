import type { StorageAPI, DesignDocument } from "../../shared/model";
declare global {
  interface Window {
    gigma?: StorageAPI;
  }
}
function browserAPI(): StorageAPI {
  const token = document.querySelector<HTMLMetaElement>(
    "meta[name=gigma-token]",
  )?.content;
  const call = async (path: string, body?: unknown) => {
    if (!token)
      throw new Error(
        "Откройте Gigma через программу или локальный запуск, чтобы сохранять документы на ПК.",
      );
    const response = await fetch("/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Gigma-Token": token, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ?? "Не удалось связаться с локальной программой.",
      );
    return result;
  };
  return {
    list: () => call("documents"),
    load: (id) => call("document/" + encodeURIComponent(id)),
    save: (document, revision) => call("save", { document, revision }),
    config: () => call("config"),
    openFolder: () => call("folder", {}),
  };
}
export const storage: StorageAPI = window.gigma ?? browserAPI();
