# 諧音星球

前台：<https://jjfishjj.github.io/phonetic-star-planet-custom/>  
管理後台：<https://jjfishjj.github.io/phonetic-star-planet-custom/admin/>

GitHub Pages 提供學習網站與管理介面，Supabase 提供管理員登入、雲端牌組與資料權限。原有 12 組、1,200 張詞卡與前台自訂牌組功能保留。

## 主題與難度篩選

先選語言牌組，再於練習區選主題、難度或兩者交集；「清除篩選」回到整副牌組。介面顯示符合筆數與篩選內學習進度，每張卡也顯示目前標籤。篩選不重編卡片、不改原本 `legacy_index`／UUID，也不清除收藏、XP 或自訂牌組。

原有 1,200 張卡已整理主題與站內難度。難度 `1`／入門、`2`／基礎、`3`／挑戰是相對於入門學習者的練習分級，**不是 CEFR 或語言檢定等級**；管理員可隨內容調整。舊本機自訂卡沒有標籤時仍正常使用，顯示「其他／未分類、入門」，編輯後可加入標籤。

主題使用穩定代碼：`greetings` 問候與禮貌、`people` 人物與關係、`home` 居家與用品、`food` 飲食、`travel` 交通與場所、`time` 時間與日期、`numbers` 數字與數量、`expressions` 基本表達、`nature` 自然、`study` 工作與學習、`shopping` 購物與金錢、`actions` 日常動作、`descriptions` 描述與感受，另有 `general` 其他／未分類。共用字典位於 `shared/card-tags.js`。

## 使用管理後台

使用已建立且已授權的管理員帳戶登入。新增 Auth 帳戶不等於取得管理員權限；本專案不開放公開註冊。

- **牌組**：新增或編輯名稱、原文名稱、旗幟／圖示、朗讀語言代碼、區域、排序及發布狀態。
- **詞卡**：新增、搜尋、編輯單字、音標、諧音、中文意思、記憶畫面、主題、難度、排序及發布狀態；可依主題與難度篩選。
- **取消發布**：從雲端公開牌組隱藏內容，保留資料及既有識別；後台不提供破壞性刪除。
- **匯出**：選定牌組後，可匯出 XLSX 備份，也可下載空白匯入範本。

儲存後，前台重新載入時會同步已發布內容，不必重新部署 GitHub Pages。

## Excel／CSV 匯入

先選擇目標牌組，再選檔案及匯入模式。支援 `.xlsx`、`.xls`、`.csv`，只讀取第一個工作表；每檔最多 5 MB、2,000 筆資料（不含標題列）。

| 英文欄位 | 中文標題 | 說明 |
| --- | --- | --- |
| `word` | 單字 | 必填，最多 300 字 |
| `hint` | 諧音 | 必填，最多 500 字 |
| `meaning` | 中文意思 | 必填，最多 500 字 |
| `roman` | 音標 | 選填，最多 300 字 |
| `cue` | 記憶畫面 | 選填，最多 2,000 字 |
| `topic` | 主題 | 選填，上列主題代碼或完整中文標籤 |
| `difficulty` | 難度 | 選填，`1`／`2`／`3` 或 `入門`／`基礎`／`挑戰` |
| `published` | 發布 | `true/false`、`1/0`、`是/否` |
| `position` | 排序 | 大於等於 0 的整數 |
| `id` | `id` | 更新既有詞卡時可使用其匯出識別 |

**追加模式**：新增資料；若同牌組單字或識別已存在，會報衝突。  
**更新模式**：有 `id` 時比對該卡；沒有 `id` 時以同牌組內完全相同的單字比對，找不到則新增。更改既有單字時建議直接在後台編輯。

省略或留白的 `published`、`position`、`topic`、`difficulty` 在更新既有卡片時保留原值；新增卡片則預設發布、排在最後、`general`／入門。若省略 `roman`、`cue`，會以空字串取代，因此批次修改建議先匯出目前牌組，再修改匯出檔並保留 `id` 等欄位。匯出檔以主題代碼與數字難度保存，便於再次匯入。

介面會先顯示前 20 列預覽與錯誤；有錯誤時不能匯入。確認後只呼叫一次原子匯入 RPC，任一列驗證失敗就整批回滾，不會只套用一部分。第一次建議先使用 2–3 筆資料試匯入。

## 前台資料與安全

學習進度、收藏及個人自訂牌組保存在目前瀏覽器的 `localStorage`，不會送到 Supabase；換裝置、換瀏覽器或清除網站資料不會自動同步這些資料。

前台以匿名方式讀取雲端已發布資料，不讀取管理員 session。雲端同步失敗時保留原始內建資料，讓學習體驗仍可使用。原始內建詞卡是公開的備援基準，不能因雲端取消發布而視為機密或從 repo 移除。

`supabase-config.js` 只有公開 project URL 與 publishable/anon key。RLS 在資料庫執行權限檢查：一般訪客不能寫入，只有列於 `phonetic_admins` 的登入管理員可新增／修改；前端不能自行授予管理員角色，也不能更新原有進度識別欄位。

**禁止**把管理員密碼、資料庫密碼、service-role key 或管理 API token 放進程式碼、README、seed、commit 或前端設定。

## 本機開發與測試

需要 Node.js、Python 3；瀏覽器測試需要 Chromium。

```bash
npm ci
npm run dev
```

開啟 <http://127.0.0.1:4173/>；後台為 <http://127.0.0.1:4173/admin/>。本機設定仍連接正式 Supabase，實際登入後的管理操作會修改正式資料；請勿把日常開發測試當成沙盒。

```bash
# 有 /usr/bin/chromium 時直接使用；否則安裝 Playwright 的 Chromium
npx playwright install chromium
npm test

# 也可指定其他 Chromium 執行檔
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run smoke
```

`npm run unit` 執行標籤完整性、匯入解析及公開牌組傳輸測試；`npm run smoke` 執行隔離、模擬 API 的瀏覽器測試，涵蓋篩選與原始進度鍵、本機資料保留、分頁讀取、安全文字渲染、登入權限、詞卡操作、實際 XLSX 匯入／匯出及更新時不意外發布草稿或重置標籤。

`scripts/run-sql-tests.sh` 另外在本機臨時 PostgreSQL 資料庫驗證 RLS、受保護欄位、管理員權限及原子匯入；需要可用的本機 PostgreSQL，請先閱讀腳本再執行。

## Supabase 維護與部署

GitHub Pages 使用 `main` 分支根目錄；`admin/index.html` 對應 `/admin/`，`.nojekyll` 保證靜態檔案直接提供。

- `supabase/migrations/001_phonetic_admin.sql` 是初始資料表、限制、RLS 及匯入函式；`002_card_tags.sql` 以新增欄位方式升級標籤、權限及匯入 RPC；`003_backfill_card_tags.sql` 只回填仍為預設標籤、且牌組／`legacy_index`／原單字相符的原始卡片。變更前先備份、審查與測試。
- **升級既有正式資料庫**：先備份，依序套用 `002`、`003`，確認卡片數、內容、識別及發布狀態未變，再部署前端。不要為升級而重建資料表、重跑 seed 或重生卡片 UUID。`003` 是一次性分類基準，不應在人工重新分類後當作日常同步工具。
- 新環境先依序套用 migrations，再執行一份 seed。`scripts/build-seed.py`、`build-seed-json.py` 與 `build-tags-backfill.py` 從 `index.html` 的原始內建卡片產生初始化／回填資料；學習程式在 `app.js`。
- `supabase/seed.sql` 與 `seed_compact.sql` 僅供首次初始化參考。**不要在已有人工編輯的正式資料庫直接重跑 seed**，以免覆蓋內容。
- 新增管理員時，先經私人管理通道建立 Auth 使用者，再將其識別加入 `public.phonetic_admins`；不得將實際管理員 Email、密碼或 UUID 寫入公開 repo。
- `vendor/` 自管 Supabase JavaScript 2.119.0 與 SheetJS 0.20.3，附各自授權檔，避免頁面依賴浮動 CDN 版本。
