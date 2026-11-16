# 正式環境維護

本文件供已熟悉 GitHub Pages、Supabase 及正式資料操作的人員使用。正式資料操作前先閱讀[管理後台與匯入指南](ADMIN.md)，並確認備份可用。

## 架構與部署

- GitHub Pages 使用 `main` 分支根目錄；`admin/index.html` 對應 `/admin/`。
- `.nojekyll` 讓 Pages 直接提供專案中的靜態檔案。
- GitHub Pages 發佈網站與靜態管理介面；Supabase 負責管理員登入、資料表、RLS 和已發布的雲端內容。
- 前台匿名讀取雲端已發布內容，不讀取管理員 session。同步失敗時保留內建資料。
- 學習進度、收藏及個人自訂牌組只存於瀏覽器 `localStorage`，不寫入 Supabase。

`supabase-config.js` 僅包含公開 project URL 與 publishable／anon key。RLS 在資料庫驗證權限：一般訪客不能寫入，只有 `phonetic_admins` 中已授權管理員可新增或修改。管理端不可更改既有卡片 ID、`deck_id`、`legacy_index`。取消發布只隱藏雲端公開內容，並非刪除或保密。

## 資料庫遷移

現有遷移依序為：

1. `001_phonetic_admin.sql`：資料表及 RLS。
2. `002_card_tags.sql`：主題及舊難度。
3. `003_backfill_card_tags.sql`：保守回填原有標籤。
4. `004_levels_examples.sql`：程度及雙語例句欄位。
5. `005_backfill_levels_examples.sql`：保守回填舊卡內容。
6. `006_vark_cues.sql`：新增四種 VARK 提示欄位及管理員 RPC 支援。

**升級正式資料庫前：**完整備份並通過本機測試，只套用尚未套用的遷移；依序升級後核對總筆數、原始欄位及新增 cue 欄位，再部署前端。不要重建資料表、重跑 seed 或重新產生正式 UUID。備份須放在 repo 外的私人位置或私人 schema，不能提交到公開 repo。

新環境應先依序套用所有遷移，再執行一份 seed。`supabase/seed.sql` 和 `supabase/seed_compact.sql` 只供首次初始化，不是正式環境同步工具。`scripts/build-seed.py` 與 `scripts/build-seed-json.py` 保持原 UUID 演算法並包含新欄位。

## 進階詞卡與內容更新

八份進階來源位於 `content/advanced/<語言代碼>.json`，共 376 張；建置器檢查來源、只追加缺少卡片，並產生前台內建資料及八份後台 CSV。原有 1,200 張在 `content/<語言>.json`。內容生成及檢查指令見[開發與測試](DEVELOPMENT.md)。

正式環境增加進階卡時，先確認目標牌組尚未匯入該批內容；使用管理台對應 CSV 的追加模式，或執行受保護的 `scripts/import-advanced-cards.py --baseline <與目前正式資料完全相符的私人完整快照> --apply`。該工具先逐欄驗證基線、管理員身分並預覽計畫，再透過既有原子 RPC 逐牌組追加；原有 248 張完全相符時只新增本次 128 張，完成後驗證總數為 1,576 並逐張核對欄位。不要將憑證寫入程式碼或提交。正式資料已有人工修改時，應透過管理台或先匯出再更新匯入；不要以 seed 覆蓋。

新增管理員須透過私人管理通道，不得在公開 repo 放入帳戶 Email、密碼或 UUID。

## VARK 提示增量升級

目前 376 張進階卡各有四種提示，共 1,504 則；其餘 1,200 張保留一般記憶畫面。切換提示時會明示專用提示尚未提供並安全回退。提示偏好不代表固定學習能力，也不修改學習進度。

正式升級需依序執行：

1. 以 `scripts/backup-vark-migration.py --output <repo 外的私人備份路徑>` 保存全部 12 個牌組與 1,576 張卡，並從私人資料庫通道備份現行匯入函式定義。
2. 套用 `006_vark_cues.sql`。
3. 用 `scripts/sync-vark-cues.py --snapshot <repo 外的新快照路徑>` 擷取含新增空白欄位的基線。
4. 用 `--baseline <同一快照路徑>` 唯讀預覽，核對無誤後再加 `--apply` 回填。

回填工具只會填既有進階卡的空白 VARK 欄位；若既有非空提示與來源不同則停止。它會逐張保護所有原欄位；正常寫入只更新該 376 張卡的 `updated_at`。再次預覽應顯示 0 筆待更新。所有備份與憑證不得提交至 repo。

## 公開函式庫

`vendor/` 自管 Supabase JavaScript 2.119.0 與 SheetJS 0.20.3，並附授權檔，避免依賴浮動 CDN。
