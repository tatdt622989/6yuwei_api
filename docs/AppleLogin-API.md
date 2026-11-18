# Apple Login 整合文件 (Auth API)

這份文件記錄了 6yuwei_api 專案中，處理 Apple Sign In (SSO) 以及使用者刪除帳號 (與撤銷 Apple 授權) 的 API 實作細節與環境設定要求。

## 1. 系統需求與環境變數

在開始使用之前，請確保專案已經安裝 `apple-signin-auth` 套件：
```bash
npm install apple-signin-auth
```

請在專案的 `.env` 檔案中加入以下環境變數，以支援 Apple Token 的驗證與授權撤銷 (Revoke)：

```env
# Apple 登入所需變數
# 依據客戶端 Platform 設定對應的 Client ID (Bundle ID 或 Service ID)
APPLE_CLIENT_ID=your.apple.client.id
APPLE_IOS_CLIENT_ID=your.apple.ios.client.id
APPLE_ANDROID_CLIENT_ID=your.apple.android.client.id
APPLE_WEB_CLIENT_ID=your.apple.web.client.id

# Apple 撤銷授權所需變數 (刪除帳號時使用)
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
# 請填入您 .p8 私鑰檔案的絕對/相對路徑，或是直接用字串讀取 (如需字串讀取請修改程式碼)
APPLE_PRIVATE_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
```

---

## 2. API 端點說明

### 2.1 Apple 登入 API

- **端點**: `POST /app/appleLogin/`
- **權限**: 公開 (Public)
- **描述**: 接收前端傳來的 Apple Token，驗證成功後自動尋找或建立使用者，並簽發本系統 Auth Token。

**Request Body (JSON):**
```json
{
  "identityToken": "eyJhbGciOiJSUzI1NiIsIms...",
  "authorizationCode": "cb1c4xxxxxx",
  "platform": "ios",
  "email": "user@example.com",
  "name": "John Doe"
}
```
*註解*：
- `identityToken`: (必填) 每次登入都會有。
- `authorizationCode`: (選填) 僅在第一次授權時出現，用於向 Apple 換取 `refresh_token` 以便日後撤銷。
- `name`: (選填) 僅在第一次授權時出現。
- `email`: 不再使用。伺服器只相信 `identityToken` 內由 Apple 簽署並驗證過的 email。
- 對應 `platform` 的 Client ID 沒有設定時，回傳 503，不會驗證憑證。
- `platform`: (選填) 用以判斷並載入不同的 `APPLE_CLIENT_ID`。

**Response (JSON):**
- **Success (200 OK)**
```json
{
  "msg": "Login success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5c...",
  "user": {
    "_id": "60a1b2c3d4e5f67890abcdef",
    "username": "John Doe",
    "email": "user@example.com",
    "appleId": "000XXX.xxxxxx.xxxx",
    "permissions": "general",
    ...
  }
}
```

---

### 2.2 App 刪除帳號 API

- **端點**: `POST /app/deleteUser/`
- **權限**: 需攜帶有效之 Token (但設計在 public路由中，以手動驗證 `req.body.token` 為主)
- **描述**: 刪除當前登入之使用者資料。若該使用者有綁定 Apple，將會連線至 Apple 伺服器進行 `RevokeToken`，確保帳號刪除完全符合 App Store 審查指南。

**Request Body (JSON):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5c...",
  "platform": "ios" 
}
```
*註解*：此 `token` 為系統核發之 JWT。

**Response (JSON):**
- **Success (200 OK)**
```json
{
  "msg": "User deleted successfully"
}
```
