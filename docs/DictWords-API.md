# 單字庫管理 API

`dict_words` 是日文單字的唯一來源，每個拼法一份文件。這組 API 只給管理者編輯單字。

## 權限

- 登入：沿用 SSO 的 `access_token` cookie，由全域的 `verifyToken` 驗證。
- 授權：所有路由都經過 `requireAdmin`，只有 `users.permissions` 是 `admin` 的帳號能用。
- 未登入回 403，已登入但不是管理者回 401。

## 環境變數

| 名稱 | 預設值 | 說明 |
|---|---|---|
| `DICT_DB_NAME` | `japanese_learning_app` | `dict_words` 所在的資料庫 |
| `DICT_EDITOR_DB_URL` | 用 `DB_URL` | 編輯路由的連線，帳號 `dict_editor` 只能改 `dict_words` 和 `dict_words_history` |
| `DICT_READER_DB_URL` | 用 `DB_URL` | App 路由的連線，帳號 `dict_reader` 只能讀 `dict_words`，並寫入 `practice_records`、`vocabulary_stats` |

連線字串的格式是 `mongodb://帳號:密碼@主機:27017/japanese_learning_app?authSource=japanese_learning_app`。沒有設定專用連線時，`DB_URL` 的帳號要有這些權限。瀏覽器管理介面的網域要加進 `config/origins.js`。

## 路由

| 方法與路徑 | 用途 |
|---|---|
| `GET /dict/admin/words/?q=&level=&flag=&page=&limit=` | 搜尋與列表，`limit` 上限 100 |
| `GET /dict/admin/words/:id` | 讀取一份文件，`:id` 是 URL 編碼後的拼法 |
| `POST /dict/admin/words/` | 新增，內容要有 `_id` |
| `PUT /dict/admin/words/:id` | 修改，內容要有 `revision` |
| `DELETE /dict/admin/words/:id?revision=` | 刪除，內容留在紀錄裡 |
| `GET /dict/admin/words/:id/history` | 最近 50 筆紀錄，含修改者與修改前後內容 |

## 編輯規則

- 可編輯：`readings`、`romaji`、`levels`、`pos`、`verbClass`、`categories`、`meanings`、`related`、`suruVerb`、`suruNoun`、`examples`、`forms`。
- `quality.flags` 只能移除 `verb-class-conflict`、`verb-without-forms`、`form-suspect`、`kana-corrected`，不能新增。
- 其他欄位由伺服器計算或保留，送來也會被忽略：`level`、`levelRank`、`searchKeys`、`allLegacyIds`、`exampleCount`、`formCount`、`legacyIds`。
- `forms[].legacyIds` 只能用這個單字原本擁有的舊 ID。
- 改讀音但沒改羅馬字時，羅馬字會依新讀音重新產生。
- 修改時帶讀到的 `revision`。別人已先改過會回 409 和 `currentRevision`，要重新讀取再改。
- 拼法就是 `_id`，不能直接改名。要改名就新增一份，再刪除舊的。
- 資料庫的 validator 也會檢查格式，其他服務直接寫入一樣會被擋。

## App 公開路由

Nihongo Tango 沒有登入，用匿名 ID 記錄練習，所以這組路由是公開的，也不帶 cookie。每個 IP 每分鐘最多 120 次。編輯仍然只能走管理者路由。

| 方法與路徑 | 用途 |
|---|---|
| `GET /dict/vocabulary/stats` | 各等級題數。`totalWords` 是單字加變化形，不重複計算 |
| `GET /dict/vocabulary/questions?level=&questionCount=` | 隨機抽題，`questionCount` 上限 200 |
| `POST /dict/vocabulary/check` | 內容是 `wordId`、`userAnswer`，回傳對錯與讀音、例句 |
| `POST /dict/vocabulary/record` | 內容是 `userId`、`wordId`、`isCorrect`、`userAnswer`、`level`，寫入練習紀錄 |
| `GET /dict/vocabulary/user-stats/:userId?level=` | 這個匿名 ID 的練習總計 |

- `wordId` 的單字是拼法，變化形是 `拼法|寫法|假名`。
- 舊版資料的 `n5_036` 這類 ID 仍可查詢。寫入紀錄時會換成新 ID。一個舊 ID 對到多個單字時，用答案判斷是哪一個。
- 題庫包含變化形，等級判斷用單字的 `levels` 和變化形的 `level`。

## 其他專案讀取

查詢字串要先用 `services/dictWordKeys.js` 正規化：假名用 `toHiragana`，羅馬字用 `romajiKey`。

```js
db.dict_words.find({ searchKeys: 'たべます' })           // 拼法、假名、羅馬字、變化形都能查
db.dict_words.find({ searchKeys: /^たべ/ })              // 前綴搜尋
db.dict_words.find({ 'forms.written': '食べられる' })     // 從變化形反查原形
db.dict_words.find({ pos: 'verb', levelRank: 1 })        // N5 動詞，levelRank 的 N5 是 1、N1 是 5
db.dict_words.find({ allLegacyIds: 'n5_502' })           // 對應舊的練習紀錄，一個舊 ID 可能對到多份文件
```

## 文件欄位

| 欄位 | 內容 |
|---|---|
| `_id` | 拼法 |
| `readings`、`romaji` | 平假名讀音、羅馬字 |
| `level`、`levelRank`、`levels` | 最低等級、數字等級、所有等級 |
| `pos`、`posRaw`、`verbClass` | 詞性標籤、遷移前的原始標籤、動詞類別 |
| `categories`、`meanings` | 主題分類、中文意思 |
| `related` | 同條目的其他拼法，不保證同義（歩く／走る） |
| `suruVerb`、`suruNoun` | `旅行` 與 `旅行する` 互指 |
| `examples`、`exampleCount` | 例句 `{ja, zh}` |
| `forms`、`formCount` | 變化形 `{written, kana, romaji, types, zh, level, legacyIds, examples, exampleHasForm}` |
| `searchKeys`、`legacyIds`、`allLegacyIds` | 搜尋鍵、原形舊 ID、含變化形的舊 ID |
| `quality` | `flags` 是待查項目，`corrections` 是遷移時的讀音修正 |
| `order`、`revision`、`createdAt`、`updatedAt`、`updatedBy` | 排序與版本資訊 |

`forms[].types`：`masu`、`nai`、`masen`、`ta`、`mashita`、`nakatta`、`masendeshita`、`te`、`potential`、`passive`、`causative`、`volitional`、`imperative`、`ba`。

`quality.flags`：`no-examples`（沒有例句，`suruNoun` 指向的文件通常有）、`form-example-mismatch`（變化形的例句沒有該變化形）、`multi-reading`（多個讀音，多數正常）、`verb-without-forms`（原標動詞但沒有變化形）、`verb-class-conflict`（遷移前條目的動詞類別不同）、`form-suspect`（變化形可能錯誤）、`kana-corrected`（讀音在遷移時修正過）。
