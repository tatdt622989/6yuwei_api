# 血壓日誌 API

`bp-diary` PWA（`https://bp.6yuwei.com`）使用的路由。全部需要登入，靠 `access_token` cookie 辨識帳號，每個帳號只能碰到自己的資料。

## 登入

沿用共用的 `POST /signup/`、`POST /login/`、`GET /loginStatus/`、`POST /logout/`。

`/signup/` 和 `/login/` 多了選用欄位 `remember: true`：簽發 30 天的 token 和持久 cookie。不帶這個欄位時行為不變（`TOKEN_EXPIRES_IN` 的 token 加 session cookie）。PWA 需要它，否則每次關閉 App 都可能要重新登入。

## `POST /bp/sync/`

上傳本機變更，同時取回伺服器上的新資料。

```json
{
  "since": 1762000000000,
  "changes": [
    { "kind": "reading", "id": "uuid", "updatedAt": 1762000000000, "deleted": false, "data": { "takenAt": 1762000000000, "systolic": 128, "diastolic": 82, "pulse": 71 } }
  ]
}
```

回應是 `{ cursor, after, more, changes, rejected }`。下一次請求把 `cursor` 當成 `since`、`after` 原樣帶回；`more` 為 `true` 時立刻再拉一次。

- `kind` 可以是 `reading`、`medication`、`intake`、`settings`，欄位白名單在 `services/bpEntries.js`。
- 每次最多 500 筆變更，每個帳號最多 100000 筆。
- 衝突以 `updatedAt` 較新者為準（last write wins），未來的時間會被壓回伺服器現在時間。
- 不合法的資料列在 `rejected`，其餘照常儲存。

## `DELETE /bp/data/`

清空帳號的日誌。內容會清除，只留下標記為已刪除的 id，讓其他裝置同步時也一起刪除。刪除帳號時整批資料會真的移除。

## `POST /bp/ocr/`

只有管理員帳號（`permissions: admin`）可以呼叫，其他帳號回 401。一般使用者是在瀏覽器用自己的 Claude 金鑰直接呼叫 Anthropic，金鑰和照片都不會經過這台伺服器。

multipart 欄位 `image`（jpeg、png、webp，最多 4 MB）。照片只存在這次請求的記憶體中，不寫入硬碟或資料庫，但會送到 Anthropic 辨識。每個帳號每小時 40 次。

```json
{
  "found": true,
  "systolic": 128,
  "diastolic": 82,
  "pulse": 71,
  "confidence": 0.96,
  "unit": "mmHg",
  "irregularHeartbeat": false,
  "isStoredOrAverage": false,
  "uncertainDigits": []
}
```

`BP_OCR_ANTHROPIC_API_KEY` 沒設定時回 503，模型呼叫失敗時回 502，PWA 這時會改用裝置端辨識。

| 環境變數 | 預設值 | 說明 |
|---|---|---|
| `BP_OCR_ANTHROPIC_API_KEY` | 無 | 管理員使用的 Claude 金鑰。沒設定時，伺服器不會送出任何照片 |
| `BP_OCR_MODEL` | `claude-sonnet-5-5` | 辨識用的 Claude 模型 |

金鑰用獨立的變數，是為了避免之後替其他功能加入金鑰時，血壓照片也開始被送出。
