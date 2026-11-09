# 帳號驗證 API

## 註冊與登入

`POST /signup/` 的欄位是 `username`、`email`、`password`。

成功時回 `{ "msg": "Verification email sent", "verificationRequired": true }`，**不會**發登入 cookie，也不回傳 `user`。信裡是 6 位數驗證碼，15 分鐘內有效。

| 情況 | 回應 |
|---|---|
| 密碼少於 8 個字元或超過 72 位元組 | 400 |
| 信箱已屬於可登入的帳號 | 400 `User already exists` |
| 信箱屬於尚未驗證的帳號 | 用新資料覆蓋並寄出新驗證碼，舊驗證碼失效 |
| 同一信箱每小時超過 5 封 | 429 |
| 信件寄不出去 | 503，可重新註冊一次 |

`POST /signup/verify/` 的欄位是 `email`、`password`、`code`，可選 `remember`。成功時回傳和登入相同的 `user`，並發登入 cookie。

| 情況 | 回應 |
|---|---|
| 信箱或密碼不對 | 400 `Incorrect email or password` |
| 驗證碼錯誤、過期、已用過，或帳號不需要驗證 | 400 `Invalid or expired code` |
| 同一信箱一天超過 20 次 | 429 |

**為什麼要同時送密碼：** 信箱主人不會知道別人搶先設定的密碼，所以主人手上的驗證碼無法啟用別人的密碼。

一組驗證碼最多試 5 次，用完要重新寄送。資料庫只保存加上伺服器密鑰的 HMAC（集合 `account_tokens`，到期後由 TTL 索引刪除）。

`POST /signup/resend/` 的欄位是 `email`。只有尚未驗證的帳號會收到信，其他情況回應相同，並與註冊共用每小時 5 封的上限。

`POST /login/` 和 `POST /app/login/`：密碼正確但尚未驗證時回 403 `Email not verified`。密碼錯誤仍回相同的錯誤訊息。

## 重設密碼頁面

這些頁面由 API 提供，所有前端共用。前端只需要連到 `GET /account/forgot-password/?app=bp`。

| 路徑 | 用途 | 連結效期 |
|---|---|---|
| `GET`、`POST /account/forgot-password/` | 申請重設連結，不透露信箱是否有帳號 | |
| `GET`、`POST /account/reset-password/` | 設定新密碼 | 1 小時 |

開啟連結不會改變任何資料，要送出新密碼才會生效。連結只能使用一次，資料庫只保存 token 的 SHA-256。

## 帳號規則

- **現有帳號不受影響。** 只有這個規則上線後的新註冊會設定 `verificationRequired`，舊帳號可繼續用密碼登入。
- **信箱不分大小寫。** 新帳號以小寫儲存；查詢時也會比對舊帳號的大寫信箱。
- **社群登入是信箱擁有權的證明。** Google 或 Apple 登入進入一個 `emailVerifiedAt` 為空的帳號時，會清除該帳號的密碼並結束其他 session，因為那組密碼可能是別人搶先註冊時設定的。已用驗證碼驗證過的帳號，密碼會保留。需要密碼時可用忘記密碼流程重新設定。
- **重設密碼** 會同時確認信箱，並結束所有 session。
- **結束 session** 靠 `sessionVersion`：token 帶有版本 `sv`，與帳號的版本不同就失效。沒有 `sv` 的舊 token 視為版本 0，上線不會登出任何人。

## 修改請求的來源

帶著登入 cookie 的修改請求，`Origin` 必須列在 `config/origins.js`，否則回 403。沒有 `Origin` 的 App 和伺服器請求不受影響。新增會用登入 cookie 修改資料的網站時，要把網址加進這份清單。

## 環境變數

| 名稱 | 必要 | 說明 |
|---|---|---|
| `RESEND_API_KEY` | 是 | 寄信用，與聯絡表單共用 |
| `ACCOUNT_MAIL_FROM` | 否 | 寄件者，未設定時使用 `CONTACT_MAIL_FROM` |
| `ACCOUNT_BASE_URL` | 否 | 重設密碼連結的網域，預設 `https://api.6yuwei.com` |
| `BP_APP_URL` | 否 | 預設 `https://bp.6yuwei.com` |
| `FRONTEND_DOMAIN` | 是 | 主站網址，結尾要有 `/` |
