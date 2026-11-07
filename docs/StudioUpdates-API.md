# Nihongo Studio 更新檔

`GET /studio/updates/latest.json` 回傳最新版本清單，還沒有版本時回傳 204。`GET /studio/updates/files/<檔名>` 下載更新檔。兩者都不需要登入。

更新檔由 Mac App 的發布腳本上傳，放在掛載進容器的資料夾，**不放進這個倉庫**。App 用內建的公鑰驗證簽章，所以伺服器上的檔案被換掉也無法安裝。

| 環境變數 | 預設值 | 說明 |
|---|---|---|
| `STUDIO_UPDATES_DIR` | `/data/studio-updates` | 容器內的更新檔資料夾，裡面有 `latest.json` 和 `files/` |
