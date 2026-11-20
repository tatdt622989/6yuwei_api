# Token Handler：網頁登入 API（SPEC-02）

> 身分架構 v2 的規格，已實作（`routes/session.js`、`services/webSessions.js`、`services/oidc/`）。舊的登入已經刪除，所以 §7 的環境變數都是必填，少一個 API 就不啟動。依據 `6yuwei_auth/docs/oidc.md`（客戶端 `web`）和 `jp.6yuwei.com/docs/BLUEPRINT.md` §5.2。

6yuwei.com 和 bp.6yuwei.com 沒有自己的登入後端，由這組 API 代為向身分中心 `auth.6yuwei.com` 登入。token 留在 API 的伺服器端，瀏覽器只拿到 HttpOnly 的 session cookie。前端照這份文件實作即可，不需要看 API 的程式。

## 1. 網站清單（`app`）

| `app` | 網站 | 前端呼叫 API 的方式 | 身分中心導回網址 | 登入後導回 |
| --- | --- | --- | --- | --- |
| `main` | `https://6yuwei.com` | 經由 Nuxt 的 `/api/**` 代理：`https://6yuwei.com/api/session/...` | `https://6yuwei.com/api/session/callback` | `https://6yuwei.com<return>` |
| `bp` | `https://bp.6yuwei.com` | 直接：`https://api.6yuwei.com/session/...` | `https://api.6yuwei.com/session/callback` | `https://bp.6yuwei.com<return>` |

程式裡也有 staging 的清單（`main` 是 `https://stg.6yuwei.com`，`bp` 是 `https://bp-stg.6yuwei.com`，API 是 `https://api-stg.6yuwei.com`），但 2026-11-20 決定不建 staging，不使用。

清單寫在 `config/webApps.js`，用環境變數 `WEB_APPS_ENV`（`production`、`staging`、`development`）選擇。`app` 不在清單裡就回 400。

## 2. cookie

| 名稱 | 用途 | 屬性 |
| --- | --- | --- |
| `__Host-6y_sid` | 登入 session | HttpOnly、Secure、SameSite=Lax、Path=/、Max-Age 30 天 |
| `__Host-6y_login` | 登入過程的 `state`（10 分鐘） | HttpOnly、Secure、SameSite=Lax、Path=/、Max-Age 600 秒 |

- cookie 落在瀏覽器看到的網域：`main` 經由代理，所以落在 `6yuwei.com`；`bp` 落在 `api.6yuwei.com`。
- 本機開發是 http，不能用 `__Host-` 前綴，改用 `6y_sid`、`6y_login`，並且不加 Secure（`WEB_APPS_ENV=development` 時）。
- session cookie 最多每 24 小時重新設定一次，延長 Max-Age。

## 3. 端點

### 3.1 `GET /session/login`

開始登入。前端用整頁跳轉（`location.href = ...`），不要用 fetch。

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| `app` | 是 | `main` 或 `bp` |
| `return` | 否 | 登入後回到的路徑，預設 `/`。必須以 `/` 開頭、不能以 `//` 或 `/\` 開頭、最長 512 字元，否則改用 `/` |

伺服器的動作：

1. 產生 `state`、`nonce`、PKCE `code_verifier`（各 32 bytes 的隨機值）。`state` 的開頭加上 `app` 和一個點（例如 `bp.<隨機值>`），登入過期時才知道要導回哪個網站。
2. 存進 `web_login_states`（10 分鐘），只存 `state` 的雜湊。
3. 設定 `__Host-6y_login=<state>`。
4. 302 到身分中心的授權端點，參數：`client_id=web`、`response_type=code`、`scope=openid email profile roles offline_access`、`prompt=consent`、`redirect_uri`（依 `app`）、`state`、`nonce`、`code_challenge`、`code_challenge_method=S256`。

`app` 不在清單裡回 400 `{ "error": "invalid_request" }`。連不到身分中心時回 503 和文字「登入服務暫時無法使用，請稍後再試。」

### 3.2 `GET /session/callback`

身分中心導回這裡，前端不會直接呼叫。

1. 核對 query 的 `state` 和 `__Host-6y_login` 相同，並在 `web_login_states` 找得到；找到就刪除（只能用一次）。
2. query 有 `iss` 時，核對它是身分中心（身分中心一律會帶）。
3. 用 `code` 和 `code_verifier` 換 token。
4. 驗證 ID token：簽章、`iss`、`aud=web`、`exp`、`nonce`。
5. 更新 `user_profiles`：沒有就建立（`balance: 30`）；用 ID token 更新 `display`。
6. 建立 `web_sessions`：`sub`、`roles`、`idpSid`（ID token 的 `sid`）、加密的 refresh token、`app`。
7. 設定 `__Host-6y_sid`，清除 `__Host-6y_login`。
8. 302 到該網站的 `<return>`。

失敗（使用者取消、`state` 不符、換 token 失敗、ID token 無效、沒有拿到 refresh token）：清除 `__Host-6y_login`，302 到該網站的 `/?login_error=<代碼>`。

| 代碼 | 意思 |
| --- | --- |
| `cancelled` | 使用者在身分中心取消，或身分中心回傳 `access_denied` |
| `expired` | 登入過程超過 10 分鐘，或 `state` 找不到 |
| `failed` | 其他錯誤（伺服器有記錄） |

### 3.3 `GET /session/me`

目前登入的使用者。前端用 `fetch(..., { credentials: 'include' })`。

已登入，200：

```json
{
  "sub": "64f1c2...",
  "name": "小明",
  "email": "someone@example.com",
  "picture": "https://auth.6yuwei.com/avatars/64f1c2.../a.webp",
  "roles": ["admin"],
  "accountUrl": "https://auth.6yuwei.com/account"
}
```

未登入，401：`{ "error": "unauthenticated" }`。

### 3.4 `POST /session/logout`

登出。需要通過 §4 的防護（`Origin` 和 `X-Requested-With`）。

1. 刪除 `web_sessions` 裡這個 session。
2. 向身分中心撤銷 refresh token。
3. 清除 `__Host-6y_sid`。
4. 回 200：

```json
{ "logoutUrl": "https://auth.6yuwei.com/session/end?client_id=web&post_logout_redirect_uri=https%3A%2F%2Fbp.6yuwei.com%2F" }
```

前端收到後整頁跳到 `logoutUrl`，身分中心確認登出並通知其他網站，再導回網站首頁。

沒有登入也回 200（同樣的 `logoutUrl`），讓前端流程一致。

### 3.5 `POST /session/backchannel-logout`

身分中心呼叫，不給前端用。照 `oidc.md` §8.2 驗證 `logout_token`，刪除 `idpSid` 相符的 session（沒有 `sid` 時刪除該 `sub` 的全部 session）。成功 200，驗證失敗 400。這個端點不檢查 `Origin`。

## 4. 防止跨站請求（CSRF）

用 session cookie 認證、而且會修改資料的請求（POST、PUT、PATCH、DELETE），必須同時符合：

1. `Origin` 在允許清單：`config/origins.js`，依 `WEB_APPS_ENV` 選擇（[Auth-v2.md](Auth-v2.md) §6）。`POST /session/logout` 比較嚴格，不論有沒有登入都檢查，而且只接受 §1 的網站。
2. 帶標頭 `X-Requested-With: 6yuwei`。這個自訂標頭讓跨站請求一定要先通過 CORS 預檢。

不符合就回 403：`{ "error": "origin_not_allowed" }`。

用 Bearer token 認證的請求（原生 App）不檢查這兩項。

前端規則：所有呼叫 API 的請求都帶 `credentials: 'include'` 和 `X-Requested-With: 6yuwei`。

## 5. session 的有效性

| 情況 | 處理 |
| --- | --- |
| 最後使用超過 30 天 | MongoDB 自動刪除，視為未登入 |
| 距離上次確認超過 10 分鐘 | 處理請求前，用 refresh token 向身分中心換一次 token：成功就更新 `roles`、refresh token、`display`、`checkedAt`；回 `invalid_grant` 就刪除 session，這次請求視為未登入 |
| 身分中心連不上 | 照常放行，記錄警告，下次請求再確認 |
| 收到 back-channel logout | 刪除對應的 session |

所以帳號被停用、改密碼、在身分中心改角色時，最慢 10 分鐘內各網站就會生效；登出則是立即生效（back-channel logout）。

## 6. 前端怎麼用（範例）

```ts
const API = 'https://api.6yuwei.com';           // 6yuwei.com 用 '/api'
const headers = { 'X-Requested-With': '6yuwei' };

// 檢查登入
const res = await fetch(`${API}/session/me`, { credentials: 'include', headers });
const user = res.ok ? await res.json() : null;

// 登入
location.href = `${API}/session/login?app=bp&return=${encodeURIComponent(location.pathname)}`;

// 登出
const { logoutUrl } = await (await fetch(`${API}/session/logout`, {
  method: 'POST', credentials: 'include', headers,
})).json();
location.href = logoutUrl;
```

## 7. 環境變數

| 名稱 | 說明 |
| --- | --- |
| `OIDC_ISSUER` | `https://auth.6yuwei.com` |
| `OIDC_CLIENT_WEB_SECRET` | 客戶端 `web` 的 secret |
| `SESSION_TOKEN_KEY` | 加密 refresh token 的金鑰，32 bytes，base64 |
| `WEB_APPS_ENV` | `production` 或 `development`（程式也接受 `staging`，不使用），決定 §1 的網站清單、§4 的允許清單和 cookie 名稱 |
| `API_RESOURCE` | `https://api.6yuwei.com`，見 [Auth-v2.md](Auth-v2.md) §7 |

五個都必填。少了 `OIDC_ISSUER`，或設了 `OIDC_ISSUER` 但少了其他任何一個，API 啟動時印出 `configuration error:` 並停止。
