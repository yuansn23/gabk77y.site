# 表單系統（前後端分離：Cloudflare Workers API + D1）

架構：**前端（落地頁 + 後台頁面）只透過 fetch 調 API，後端邏輯 + 資料庫 + 接口全在 Worker 裡**，前後端徹底分離。

```
落地頁 (Pages)  gabk77y.site/            ──POST /api/submit──▶
後台前端 (Pages) gabk77y.site/admin/     ──POST /api/login──▶   Worker (純 API)
                                            ──GET /api/submissions──▶   │
                                                              ▼
                                                            D1 (submissions 表)
```

## 檔案說明
- `worker/index.js` — **純 API Worker**（不含任何頁面，只回 JSON）
- `admin/index.html` — **前端後台**（純靜態頁面，登入/查詢都調 API，token 存 localStorage）
- `worker/schema.sql` — D1 建表 SQL
- `worker/wrangler.toml` — 部署設定（含 D1 綁定 + `/api/*` 路由）

## 部署步驟

### 1. 建立 D1 資料庫 + 建表
```bash
cd worker
npx wrangler d1 create jianfei-submissions          # 已建過可跳過，拿到 database_id 填進 wrangler.toml
npx wrangler d1 execute jianfei-submissions --remote --file=./schema.sql
```

### 2. 部署 API Worker
```bash
npx wrangler deploy
```
`wrangler.toml` 裡已加好路由 `gabk77y.site/api/*`，部署後該路徑會自動接管（其餘路徑仍走 Pages）。

### 3. 部署前端後台 `admin/index.html`
把 `admin/index.html` 上傳到 Cloudflare Pages，放到 **`admin` 目錄**下，讓它訪問 `gabk77y.site/admin/`。兩種做法：
- 上傳到現有落地頁 Pages 專案的 `admin/` 子目錄（推薦，共用域名）；或
- 新建一個 Pages 專案，配 Custom Domain 指向 `gabk77y.site/admin`（需要額外設 `/_headers` 或 base path）。

前端後台裡的 `API_BASE` 預設為空（同域相對路徑 `/api/...`），同域部署不用改。

### 4. 落地頁已接好
`index-redesign.html` 的 `API_BASE = ''`，提交表單會相對請求 `/api/submit`，重新部署落地頁即可。

## 使用後台
- 網址：`https://gabk77y.site/admin/`
- 帳號：`da2387`　密碼：`123456`
- 登入後自動查「最近 3 天」，可用日期範圍 + 查詢按時間篩選。

## API 一覽（純後端，全 JSON）
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| POST | `/api/submit` | `{name, age, height, weight, used_product}` | `{ok:true}` |
| POST | `/api/login` | `{username, password}` | `{ok:true, token}` |
| GET | `/api/submissions?from=毫秒&to=毫秒` | Header `Authorization: Bearer <token>` | `{ok:true, count, results:[...]}` |

- `/api/submissions` 缺省 `from/to` 時預設最近 3 天。
- token 無狀態、7 天有效；前端登出即刪 localStorage 的 token。

## 安全提醒
- `worker/index.js` 的 `SECRET` 建議改成你自己的隨機長字串再部署。
- 帳號密碼為寫死的明文（`da2387/123456`），屬低強度憑證，請自行確認符合安全預期。
