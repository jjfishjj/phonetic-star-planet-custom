# 諧音星球

前台：<https://jjfishjj.github.io/phonetic-star-planet-custom/>  
管理後台：<https://jjfishjj.github.io/phonetic-star-planet-custom/admin/>

GitHub Pages 提供學習網站與管理介面，Supabase 提供管理員登入、雲端牌組與資料權限。原有 12 組、1,200 張詞卡、諧音、主題、收藏、學習紀錄與本機自訂牌組均保留；每張內建卡另有原文短例句與繁體中文翻譯。

## 依語言程度練習

先選語言牌組，再選主題、程度或兩者交集。「清除篩選」回到整副牌組；「只練不熟的卡」排除已記住的詞卡。翻開答案後可看原文例句與繁中翻譯，也可朗讀單字或例句。

| 語言 | 程度系統 | 儲存值 |
| --- | --- | --- |
| 英語、西班牙語、法語、德語、葡萄牙語、義大利語 | CEFR | `A1`、`A2`、`B1`、`B2`、`C1`、`C2` |
| 日語 | JLPT | `N5`、`N4`、`N3`、`N2`、`N1`（由淺入深） |
| 韓語 | TOPIK | 字串 `1`–`6` |
| 阿拉伯語、印尼語、泰語、越南語及其他語言 | 原有站內難度 | `difficulty`：`1` 入門、`2` 基礎、`3` 挑戰 |

程度是依字詞與用法編寫的**學習參考標註，不是官方完整詞表或檢定保證**。現有題庫原本偏入門，主要分布於 CEFR A1/A2、JLPT N5/N4、TOPIK 1/2；介面支援所有等級，但不會為填滿高階程度而錯標簡單單字。沒有卡片的前台選項顯示 0 並停用。

分級系統由牌組的 `lang` 語言前綴判斷，支援 `en-US` 或 `ja_JP` 等格式；只有語碼缺少時才回看牌組 ID。新分級放在 `proficiency_level`，不會把舊的 1–3 練習難度硬轉成檢定程度。舊卡缺少新分級時顯示「未分級」，不影響原始卡片識別或學習紀錄。

主題使用穩定代碼：`greetings` 問候與禮貌、`people` 人物與關係、`home` 居家與用品、`food` 飲食、`travel` 交通與場所、`time` 時間與日期、`numbers` 數字與數量、`expressions` 基本表達、`nature` 自然、`study` 工作與學習、`shopping` 購物與金錢、`actions` 日常動作、`descriptions` 描述與感受，以及 `general` 其他／未分類。共用字典位於 `shared/card-tags.js`。

## 使用管理後台

使用已建立且已授權的管理員帳戶登入。本專案不開放公開註冊；新增 Auth 帳戶不等於取得管理員權限。

牌組可編輯名稱、原文名稱、圖示、朗讀語言代碼、區域、排序及發布狀態。若更改語言將造成現有分級無效，資料庫會拒絕變更，避免內容被默默重新分類。

詞卡可搜尋與編輯單字、音標、諧音、中文意思、記憶畫面、主題、語言程度、原文例句、繁中翻譯、排序及發布狀態，並可按主題與程度篩選。例句與翻譯必須成對提供或成對留白；舊檔與尚未補例句的自訂資料仍相容。CEFR/JLPT/TOPIK 編輯不會改寫原本 `difficulty`；其他語言維持原有 1–3 難度。

「取消發布」只隱藏雲端公開內容，不刪除資料或識別。發布切換會保留所有程度、例句及主題資料。選定牌組後，可匯出 XLSX 或 UTF-8 CSV，也可下載符合該語言的空白 XLSX 範本。CSV 含 UTF-8 BOM，方便 Excel 正確顯示繁中。

儲存後，前台重新載入時會同步已發布內容，不必重新部署 GitHub Pages。

## Excel／CSV 匯入

先選目標牌組，再選檔案與匯入模式。支援 `.xlsx`、`.xls`、`.csv`，只讀第一個工作表；每檔最多 5 MB、2,000 筆資料（不含標題列）。

| 英文欄位 | 中文標題／別名 | 說明 |
| --- | --- | --- |
| `word` | 單字 | 必填，最多 300 字 |
| `hint` | 諧音 | 必填，最多 500 字 |
| `meaning` | 中文意思 | 必填，最多 500 字 |
| `roman` | 音標 | 選填，最多 300 字 |
| `cue` | 記憶畫面 | 選填，最多 2,000 字 |
| `topic` | 主題 | 選填，穩定代碼或完整中文標籤 |
| `difficulty` | 難度 | 原有 `1`／`2`／`3` 或 `入門`／`基礎`／`挑戰`，語義不變 |
| `proficiency_level` | 程度、檢定等級 | 符合目標牌組的 CEFR/JLPT/TOPIK 值；站內難度語言請留白並使用 `difficulty` |
| `example_sentence` | 例句、原文例句 | 原文短句，最多 500 字 |
| `example_translation` | 例句翻譯、繁中翻譯 | 上方短句的繁中翻譯，最多 500 字 |
| `published` | 發布 | `true/false`、`1/0`、`是/否` |
| `position` | 排序 | 大於等於 0 的整數 |
| `id` | `id` | 更新既有詞卡時可使用匯出識別 |

追加模式遇到同牌組既有單字或識別會報衝突。更新模式有 `id` 時比對該卡；沒有 `id` 時以同牌組完全相同的單字比對，找不到才新增。更改既有單字建議直接在後台編輯。

更新時，省略或留白的 `published`、`position`、`topic`、`difficulty`、`proficiency_level` 會保留原值。沒有例句欄位也保留原例句；**同時提供兩個空白例句欄位則會清除例句與翻譯**。匯入介面要求原文與翻譯成對；RPC 也會在保留省略值後檢查最終結果。省略 `roman`、`cue` 會以空字串取代，因此批次修改前請先匯出目前牌組，並保留 `id` 等欄位。

介面先顯示前 20 列預覽與錯誤；有錯誤就不能匯入。確認後僅呼叫一次原子匯入 RPC，任一列失敗就整批回滾。第一次建議先試 2–3 筆。XLSX 以文字儲存內容；CSV 對公式樣式的儲存格加上安全前綴，避免開啟試算表時執行公式。

## 前台資料與安全

學習進度、收藏及個人自訂牌組保存在目前瀏覽器的 `localStorage`，不送到 Supabase。換裝置、換瀏覽器或清除網站資料不會自動同步。篩選不重編卡片、不改 `legacy_index`／UUID，也不清除 XP 或原有記錄。

前台匿名讀取雲端已發布資料，不讀管理員 session；同步失敗時保留內建資料。內建詞卡是公開備援，不能因雲端取消發布就視為機密。

`supabase-config.js` 只有公開 project URL 與 publishable/anon key。RLS 在資料庫檢查權限：一般訪客不能寫入，只有 `phonetic_admins` 中的登入管理員可新增／修改。原有 ID、`deck_id`、`legacy_index` 不開放管理端更新。

**禁止**把管理員密碼、資料庫密碼、service-role key 或管理 API token 放進程式碼、README、seed、commit 或前端設定。

## 本機開發與測試

需要 Node.js、Python 3；瀏覽器測試需要 Chromium。

```bash
npm ci
npm run dev
```

開啟 <http://127.0.0.1:4173/>，後台為 `/admin/`。本機設定仍連正式 Supabase，實際登入後會修改正式資料；日常測試請使用模擬 API，不要當成沙盒。

```bash
# 沒有系統 Chromium 時安裝測試瀏覽器
npx playwright install chromium
npm test

# 或指定 Chromium 執行檔
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run smoke

# PostgreSQL 臨時資料庫：權限、原子匯入與完整回填測試
bash scripts/run-sql-tests.sh
SEED_FILE=supabase/seed_compact.sql bash scripts/run-sql-tests.sh
```

單元測試涵蓋程度字典、1,200 組例句、原欄位雜湊不變、匯入解析與匿名傳輸。隔離瀏覽器測試涵蓋四種程度系統、手機版／阿拉伯文方向、安全文字渲染、原始學習鍵、舊本機資料、管理權限、XLSX/CSV 實際匯入匯出、發布切換及草稿保留。SQL 測試另驗證省略欄位保留、跨語言錯誤分級拒絕、整批回滾、原始識別不變、人工內容優先，以及回填第二次為零變更。

## Supabase 維護與部署

GitHub Pages 使用 `main` 分支根目錄；`admin/index.html` 對應 `/admin/`，`.nojekyll` 保證直接提供靜態檔案。

既有 migrations `001` 建立資料表／RLS，`002` 新增主題與舊難度，`003` 回填原有標籤。此次 `004_levels_examples.sql` 只新增程度與例句欄位、限制、欄位權限及相同簽章的匯入 RPC；`005_backfill_levels_examples.sql` 只比對原牌組、`legacy_index` 與原單字，補入空白的新 metadata。既有人工程度與非空白例句優先保留，原 ID、順序、發布狀態與其他內容不變。

**升級正式資料庫：**先備份並通過本機測試，再套用 `004`、`005`，核對資料筆數、原始欄位與新例句完整度後才部署前端。不要重建資料表、重跑 seed 或重生 UUID。備份應放在不對外開放的私人位置／schema，不可提交到公開 repo。

新環境依序套用 migrations，再執行一份 seed。`supabase/seed.sql` 與 `seed_compact.sql` 僅供首次初始化，不是正式資料同步工具。`scripts/build-seed.py` 與 `build-seed-json.py` 保持原 UUID 演算法並包含新欄位。

`content/<語言>.json` 保存逐卡的分級與雙語例句；`scripts/build-level-content.py` 檢查原單字與索引、更新內建備援資料並產生 `005`。修改內容後執行：

```bash
python3 scripts/build-level-content.py
python3 scripts/build-level-content.py --check
python3 scripts/build-seed.py
python3 scripts/build-seed-json.py
npm test
```

內容升級不會自動覆寫正式環境的人工編輯。若要修改已非空白的正式例句，請用管理台或先匯出再更新匯入。新增管理員須透過私人管理通道，不得在公開 repo 寫入實際帳戶 Email、密碼或 UUID。

`vendor/` 自管 Supabase JavaScript 2.119.0 與 SheetJS 0.20.3，附授權檔，避免依賴浮動 CDN。
