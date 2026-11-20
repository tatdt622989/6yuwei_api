# 資源 API 的認證和授權 v2（SPEC-03）

> 身分架構 v2，已實作（`identity-v2` 分支）。認證和守衛在 `middlewares/authenticate.js`，所有路由在 `buildApp.js` 掛載；舊的登入系統已刪除。測試：`tests/identityV2.test.js`、`tests/routes.test.js`。依據 `6yuwei_auth/docs/oidc.md`、`docs/Session-API.md`、`jp.6yuwei.com/docs/BLUEPRINT.md` §6。

切換後，這個 API 不再處理密碼、不再簽發 token。它只做兩件事：辨識請求是誰（§1），以及每個路由決定誰可以用（§3）。

## 1. 辨識身分：`authenticate` 中介層

掛在 `buildApp.js` 的路由之前，所有路由都經過它。只有 `/dict/vocabulary/` 和 `/studio/updates/` 例外：這兩組掛在它和共用 CORS 之前，完全不辨識身分（Nihongo Tango 和 Nihongo Studio 呼叫時不帶 cookie 也不帶 token）。依序檢查：

1. **Bearer token**（`Authorization: Bearer <JWT>`）
   - 用身分中心的 JWKS 驗證簽章（ES256），金鑰快取 10 分鐘，遇到不認得的 `kid` 重新抓。
   - 檢查 `iss` 是 `OIDC_ISSUER`、`aud` 是 `API_RESOURCE`（`https://api.6yuwei.com`）、`typ` 是 `at+jwt`、`exp` 未過期（容許 30 秒誤差）。
   - 任何一項不符就回 401 `invalid_token`，不會退回去用 cookie。
   - 通過：`req.auth = { sub, roles, scopes, clientId, via: 'bearer' }`。
2. **session cookie**（`__Host-6y_sid`；`WEB_APPS_ENV=development` 時是 `6y_sid`）
   - 查 `web_sessions`，照 `Session-API.md` §5 處理過期和定期確認。
   - 找不到：清除 cookie，當成訪客。
   - 找到：`req.auth = { sub, roles, scopes: null, clientId: 'web', via: 'session', session }`；cookie 超過 24 小時沒重設就重設一次，延長 Max-Age。
3. 兩者都沒有：`req.auth = null`（訪客）。

`req.user`（舊的使用者文件）整個刪除。需要點數、收藏的地方改查 `user_profiles`（`services/userProfiles.js`）。

## 2. 守衛

| 守衛 | 通過條件 | 不通過 |
| --- | --- | --- |
| `requireUser()` | 有 session | 沒登入 401 `unauthenticated`；用 Bearer token 403 `insufficient_scope` |
| `requireRole('admin')` | 先通過 `requireUser`，而且 `roles` 含 `admin` | 沒登入 401 `unauthenticated`；角色不符 403 `forbidden` |
| `requireUser({ scope: 'studio' })`、`requireRole('admin', { scope: 'studio' })` | 允許 Bearer token，但 token 的 `scope` 要含 `studio`，而且不是 `idp-internal` 的 token；session 一律通過 | 403 `insufficient_scope` |
| `requireInternal('accounts.erase')` | 只接受 Bearer，`client_id` 是 `idp-internal`，`scope` 含 `accounts.erase` | 沒帶 token 401 `unauthenticated`；其他 403 `forbidden` |
| `requirePluginToken` | 沿用 `/reisui/codes/` 現有的外掛金鑰 | 不變 |

原則：Bearer token 只能用在守衛有宣告 `scope` 的路由（`requireUser({ scope })`、`requireRole(role, { scope })`）。原生 App 拿到的 token 不能拿去呼叫血壓、元件等網頁功能。

`config/publicRoutes.js` 已刪除。沒有掛守衛的路由就是公開的，所以每個新路由都要明確決定要不要掛，並在 `tests/routes.test.js` 的清單加一行（沒登入要回 401）。

全域另掛 `requireTrustedOrigin`：用 session cookie 而且會修改資料的請求，`Origin` 要在允許清單、並帶 `X-Requested-With: 6yuwei`（Session-API §4）。沒有登入的請求（例如聯絡表單）不受影響。

## 3. 路由表

符號：公開 = 不需登入；使用者 = `requireUser()`；管理員 = `requireRole('admin')`；`+studio` = 守衛加上 `{ scope: 'studio' }`，原生 App 可用。

### 3.1 新增

| 方法和路徑 | 守衛 | 說明 |
| --- | --- | --- |
| `GET /session/login` | 公開 | 見 Session-API |
| `GET /session/callback` | 公開 | 見 Session-API |
| `GET /session/me` | 公開（沒登入回 401） | 見 Session-API |
| `POST /session/logout` | 公開 + CSRF 防護 | 見 Session-API |
| `POST /session/backchannel-logout` | 公開（驗證 logout token） | 見 Session-API |
| `GET /me` | 使用者 +studio | §4.1 |
| `GET /admin/profiles/` | 管理員 | §4.2 |
| `GET /admin/profiles/:sub` | 管理員 | §4.2 |
| `POST /admin/profiles/:sub/balance` | 管理員 | §4.2 |
| `POST /internal/accounts/:sub/erase` | `requireInternal('accounts.erase')` | §4.3 |

### 3.2 保留，改守衛

| 掛載點 | 方法和路徑 | 守衛 |
| --- | --- | --- |
| `/websites/`、`/3dcgs/`、`/animations/` | `GET /`、`GET /category/`、`GET /:id/` | 公開 |
| 同上 | `POST /admin/photo/`、`DELETE /admin/photo/`、`POST /admin/`、`GET /admin/`、`PUT /admin/`、`PUT /admin/multiple/`、`POST /admin/delete/`、`DELETE /admin/:id`、`GET /admin/category/` | 管理員 |
| `/admin/` | `GET /uploads/:filename` | 公開 |
| `/contact/` | `POST /` | 公開 |
| 同上 | `GET /admin/`、`POST /admin/delete/` | 管理員 |
| `/components/` | `GET /css/:filename/`、`GET /types/cover/:filename`、`GET /types/`、`GET /`、`GET /sandbox/`、`GET /:id/` | 公開 |
| 同上 | `POST /generate/`、`POST /generate/update/`（另有 `COMPONENT_AI_ENABLED` 開關）、`GET /user/`、`POST /favorites/`、`DELETE /favorites/:id/`、`GET /favorites/`、`GET /favorites/id/`、`DELETE /:id/` | 使用者 |
| 同上 | `POST /admin/types/` | 管理員 |
| `/bp/` | `POST /sync/`、`DELETE /data/`、`GET /share/`、`POST /share/`、`DELETE /share/` | 使用者 |
| 同上 | `POST /ocr/` | 管理員 |
| `/bp/shared/` | `POST /` | 公開（分享 token 在內容裡） |
| `/studio/save/` | `GET /`、`PUT /`、`DELETE /` | 使用者 +studio |
| `/dict/admin/words/` | 全部 | 管理員 +studio |
| `/dict/vocabulary/` | 全部 | 公開（不變） |
| `/studio/updates/` | 全部 | 公開（不變） |
| `/reisui/codes/` | 全部 | 外掛金鑰（不變） |
| `/` | `GET /` | 公開 |
| `/health/` | `GET` | 公開 |
| `/test/` | `GET` | 管理員 |

### 3.3 刪除

| 路徑 | 原因 |
| --- | --- |
| `/login/`、`/logout/`、`/loginStatus/`、`/signup/`、`/signup/verify/`、`/signup/resend/` | 改到身分中心 |
| `/googleLogin/`、`/google/callback/`、`/bp/google/`、`/bp/google/callback/` | 同上 |
| `/app/login/`、`/app/googleLogin/`、`/app/appleLogin/`、`/app/logout/`、`/app/deleteUser/` | 同上 |
| `/user/`（GET、PUT）、`/user/balance/` | 個人資料改到身分中心；點數改用 `/me` |
| `/account/reset-password/`、`/account/forgot-password/` | 改到身分中心 |
| `/members/*` | 帳號管理改到身分中心；點數改用 `/admin/profiles/*` |
| `/admin/uploads/:id/:filename` | 使用者頭像改由身分中心提供 |
| `/guessai_canvas/*`（含 socket.io） | Guessai 獨立成自己的服務 |

刪除後這些路徑回 404。

## 4. 新端點

### 4.1 `GET /me`

```json
{
  "sub": "64f1c2...",
  "balance": 28,
  "favoriteCount": 3,
  "display": { "name": "小明", "email": "someone@example.com", "picture": "https://..." }
}
```

沒有 `user_profiles` 時自動建立（`balance: 30`）。名稱和頭像以身分中心為準，這裡的 `display` 只是副本。

### 4.2 點數管理

`GET /admin/profiles/?q=&page=1&limit=20`

- `q`：比對 `display.name`、`display.email`（不分大小寫，部分符合），或完全等於 `sub`。
- `limit` 上限 100。

```json
{
  "items": [{ "sub": "64f1...", "balance": 28, "display": { "name": "小明", "email": "..." }, "updatedAt": "..." }],
  "page": 1, "limit": 20, "total": 1
}
```

`GET /admin/profiles/:sub`：單一帳號，加上最近 50 筆 `UserTransition`（欄位 `transitions`）。`sub` 格式不對或找不到帳號回 404 `not_found`。

`POST /admin/profiles/:sub/balance`

```json
{ "delta": 10, "reason": "活動贈點" }
```

- `delta` 是非 0 的整數，絕對值不超過 10000，否則 400 `invalid_request`。
- 調整後不能小於 0，否則 400 `invalid_balance`。找不到帳號回 404 `not_found`。
- `reason` 最多 200 字。
- 用一次 `findOneAndUpdate` 加減，寫一筆 `UserTransition`（`type: 'admin_adjust'`、`amount: delta`、`reason`、`actor: 管理員的 sub`、`ip`）。
- 回傳 `{ "sub": "...", "balance": 38 }`。

### 4.3 `POST /internal/accounts/:sub/erase`

身分中心刪除帳號時呼叫。可以重複呼叫，結果相同。`sub` 格式不對回 400 `invalid_request`。

刪除該 `sub` 的：`bp_entries`、`bp_shares`、`studio_saves`、`components`（他建立的）、`usertransitions`、`user_profiles`、`web_sessions`。

```json
{ "sub": "64f1...", "erased": { "bp_entries": 120, "bp_shares": 1, "studio_saves": 1, "components": 4, "usertransitions": 9, "user_profiles": 1, "web_sessions": 2 } }
```

## 5. 錯誤格式

認證和授權的錯誤一律回 JSON：

| 狀態 | `error` | 時機 |
| --- | --- | --- |
| 401 | `unauthenticated` | 需要登入但沒有 session 或 token |
| 401 | `invalid_token` | Bearer token 無效、過期、`aud` 不符；同時帶 `WWW-Authenticate: Bearer error="invalid_token"` |
| 403 | `forbidden` | 角色不符 |
| 403 | `insufficient_scope` | token 沒有需要的 scope，或 Bearer 用在不允許的路由 |
| 403 | `origin_not_allowed` | CSRF 防護沒通過 |

其他業務錯誤維持各路由現有的格式，前端不用改。

## 6. CORS

| 項目 | 設定 |
| --- | --- |
| 允許的來源 | 依 `WEB_APPS_ENV`（`config/origins.js`）：正式是 `https://6yuwei.com`、`https://www.6yuwei.com`、`https://ai.6yuwei.com`、`https://api.6yuwei.com`、`https://bp.6yuwei.com`；開發環境另一份（程式也有 staging 的清單，不使用） |
| `credentials` | true |
| 允許的標頭 | `Content-Type`、`Authorization`、`X-Requested-With` |
| 已刪除 | Guessai 的網域和 CSP 設定、`app.6yuwei.com`（只為 Guessai 而設） |

`/dict/vocabulary/` 維持現在的開放 CORS（不帶 cookie）。

## 7. 環境變數

| 名稱 | 說明 |
| --- | --- |
| `OIDC_ISSUER` | `https://auth.6yuwei.com` |
| `API_RESOURCE` | `https://api.6yuwei.com`，access token 的 `aud` |
| `OIDC_CLIENT_WEB_SECRET`、`SESSION_TOKEN_KEY`、`WEB_APPS_ENV` | Token Handler 用，見 Session-API |

全部必填。少了 `OIDC_ISSUER`，或設了 `OIDC_ISSUER` 但少了其他任何一個，API 啟動時印出 `configuration error:` 並停止（`app.js`、`services/oidc/setup.js`）。

刪除的環境變數見 `jp.6yuwei.com/docs/BLUEPRINT.md` §9.1。
