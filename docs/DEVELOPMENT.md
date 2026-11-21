# 開發與測試

## 環境與啟動

需要 Node.js、Python 3；瀏覽器煙霧測試需要 Chromium。

```bash
npm ci
npm run dev
```

開啟 <http://127.0.0.1:4173/>，管理後台位於 `/admin/`。注意：本機設定仍連正式 Supabase；若登入並操作，會修改正式資料，不是隔離沙盒。測試時請使用 repo 內測試所提供的模擬 API，不要以正式資料做實驗。

## 資料來源與建置器

- `content/<語言>.json`：12 組原有詞卡的內容來源；每組 100 張。這些既有卡的原始欄位與識別需保留。
- `content/advanced/<語言代碼>.json`：八種語言共 376 張進階卡及其四種 VARK 提示的內容來源。
- `content/advanced/csv/`：由進階來源產生，供後台匯入的八份 CSV；正式資料已有這些卡時不要再次追加。
- `index.html`：包含前台內建備援資料。建置工具會檢查與更新其生成內容；不要手動改寫生成區域。
- `supabase/seed.sql`、`supabase/seed_compact.sql`：新環境初始化用 seed，不是正式資料同步機制。

內容修改後，以建置器的 `--check` 驗證生成檔是否同步。進階來源會產生前台資料與匯入 CSV；程度建置器檢查原卡及回填內容；seed 建置器維持原 UUID 演算法並帶上新增欄位：

```bash
python3 scripts/build-advanced-content.py
python3 scripts/build-advanced-content.py --check
python3 scripts/build-level-content.py
python3 scripts/build-level-content.py --check
python3 scripts/build-seed.py
python3 scripts/build-seed-json.py
```

## 測試

```bash
# 單元測試 + Chromium 瀏覽器煙霧測試
npm test

# 如果環境沒有系統 Chromium
npx playwright install chromium

# 或明確指定 Chromium 執行檔
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run smoke

# SQL 權限、原子匯入與回填測試，需要 PostgreSQL 臨時資料庫
bash scripts/run-sql-tests.sh
SEED_FILE=supabase/seed_compact.sql bash scripts/run-sql-tests.sh
```

單元測試涵蓋 1,576 張卡、376 張進階卡逐級分布與 VARK 欄位 CSV round-trip、原有 1,200 張欄位雜湊不變、匯入解析與匿名傳輸。瀏覽器測試涵蓋四種程度系統、跨級進度比較、裝置語音與口音回退、VARK 切換及缺少提示時的回退、手機版與阿拉伯文 RTL、安全文字渲染、原始學習鍵與舊本機資料、管理權限、XLSX／CSV 實際匯入匯出、發布切換、草稿保留與原有進度保存。SQL 測試驗證 VARK 欄位權限、提示省略保留／明確清空、跨語言錯誤分級拒絕、整批回滾、原始識別不變、人工內容優先及回填第二次為零變更。

GitHub Actions 會在所有分支的 push，以及目標為 `main` 的 PR 執行 `Validate tests and generated content` 檢查，包含單元與瀏覽器測試，以及進階內容和程度內容的生成檔一致性驗證。只有推送至 `main` 且通過檢查才會部署正式網站。

## 目錄索引

```text
index.html             學習前台、內建公開備援牌組
app.js                 前台邏輯
learning-ui.css        前台主要樣式
levels-examples.css    程度與例句樣式
admin/                 管理後台與管理介面邏輯
shared/                前後台共用匯入與主題標籤邏輯
content/               語言牌組、進階內容及 CSV 來源
scripts/               資料建置、檢查、測試與受保護維護工具
supabase/migrations/   資料表、RLS、欄位及受控 RPC 遷移
supabase/tests/        SQL 權限、匯入及回填測試
vendor/                固定版本前端函式庫與授權檔
```

正式環境部署與資料庫升級請讀[正式環境維護文件](OPERATIONS.md)。
