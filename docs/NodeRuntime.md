# Node.js 執行環境與升級紀錄

## 版本設定

本專案的 Node.js 目標版本為 **24.22.1 LTS**，由原本的 Node 18 升級。

- `.nvmrc`：`v24.22.1`。
- `package.json` 與 lockfile 的根套件 `engines.node`：`>=24.22.1 <25`。
- Dockerfile 的依賴安裝與執行階段：`node:24.22.1-bookworm-slim`。
- `@google/genai@1.48.0` 要求 Node.js 20 以上；原本 Node 18 設定不符合此要求。
- 相依套件版本與套件完整性鎖定維持原樣。

新版 npm 需要明確允許相依套件的安裝腳本。`allowScripts` 只允許已檢查的 `bcrypt@5.1.0` 與 `protobufjs@7.5.4`；版本變更後需重新檢查此設定。bcrypt 安裝步驟負責取得或編譯原生密碼模組，不能省略。

使用 nvm 開發時：

```sh
nvm install
nvm use
npm ci
```

此變更沒有調整電腦的全域預設 Node 版本。

## 2026-10-21 本機驗證

以官方 macOS arm64 Node.js 24.22.1 執行；下載檔已比對官方 SHA-256。於不含正式環境設定的隔離副本執行以下檢查：

- `npm ci --omit=dev --no-audit --no-fund` 乾淨安裝通過，啟用嚴格 Node engines 檢查，並實際執行上述兩個套件的安裝步驟。
- 34 個專案 JavaScript 檔案語法檢查通過。
- 27 個正式相依套件載入通過。
- bcrypt 原生密碼雜湊、正確與錯誤密碼比較，以及 User model 的 JWT 簽發與驗證通過。
- 公開健康檢查路由、匿名存取拒絕、管理員權限檢查通過。
- JSDOM 與 DOMPurify 的 HTML 清理檢查通過。
- 應用程式、路由與 Socket.IO 初始化通過；驗證時封鎖網路連線與監聽，不建立真實資料庫連線、不啟動服務。

專案現有 `npm test` 仍是未設定的預設佔位指令。上述為本次相容性檢查，並不代表正式登入、外部 AI/OAuth、資料庫與 Socket.IO 連線流程均已實測。

## Linux 建置與正式部署

2026-10-21 主機上的 Linux/amd64 隔離建置與六類相容性檢查已通過；實測 Node 24.22.1，執行使用者 UID 為 1000。

使用 Docker Official Image `node:24.22.1-bookworm-slim`。2026-10-21 22:44（台灣時間）已確認官方索引提供 Linux/amd64 映像：

- 索引 digest：`sha256:1681862882da07ee5476fee047bcf34138833f1df42633bb25bcb0f438d5bf3d`。
- Linux/amd64 manifest：`sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`。

同日 22:38 查核時，新標籤的索引仍是空的；後續官方已完成發布。滾動標籤與指定版本標籤需分別核對，不能只憑標籤名稱認定實際版本。

正式部署使用 Coolify 的 `dockerfile` build pack，對應 `main` 分支與根目錄 `/Dockerfile`。正式健康檢查為 `GET /health/`；成功條件包含 HTTP 200 與資料庫已連線。

部署前需完成 Linux/amd64 映像建置，並以非 root 使用者驗證套件、bcrypt 原生模組與程式載入。相容性驗證容器應封鎖網路，不讀取正式環境設定、不連真實資料庫、不開啟監聽埠。

本次 Node 升級不修改資料庫 schema。正式部署須保留 Coolify 原有環境變數與 `/app/uploads` 持久卷，先備妥舊映像與部署設定，再透過 Coolify 更新。完成後確認實際 Node 版本、容器健康、`/health/`、未登入存取的權限限制與 Socket.IO 握手。

真實 Google／Apple 登入與外部 AI 呼叫需另有測試條件，不能由模組載入通過推定功能已完整驗證。

官方來源：

- [Node.js 支援版本與 LTS 狀態](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.22.1 安全更新](https://github.com/nodejs/node/releases/tag/v24.22.1)
- [Node.js 官方發行索引](https://nodejs.org/dist/index.json)
- [Node 官方 Docker 標籤](https://hub.docker.com/v2/repositories/library/node/tags/24.22.1-bookworm-slim)
- [Docker Registry 的指定標籤](https://registry-1.docker.io/v2/library/node/manifests/24.22.1-bookworm-slim)
