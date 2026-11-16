# 諧音星球

以諧音提示、記憶畫面與短例句學習單字的多語言網站。

- **公開學習網站：** <https://jjfishjj.github.io/phonetic-star-planet-custom/>
- **管理後台：** <https://jjfishjj.github.io/phonetic-star-planet-custom/admin/>
- **技術組合：** GitHub Pages 靜態網站 + Supabase 管理登入、已發布牌組與資料權限

## 目前版本

目前專案有 **12 組牌、1,576 張詞卡**。原有 1,200 張保留；英、西、法、德、葡、義、日、韓八種語言另有 376 張進階卡。公開網站目前載入的英語牌組範例顯示 148 張（100 張原有卡 + 48 張進階卡）。進階卡支援程度標註、雙語短例句，以及可切換的視覺、聽覺、讀／寫、動作／操作提示；前台亦提供程度分析、口音語音選擇及管理後台。

個人學習進度、收藏與自訂牌組存在使用者目前的瀏覽器，不會同步到 Supabase。更多使用說明、安全限制與維護流程請從下列文件進入。

## 文件導覽

- [學習網站與程度／VARK 提示說明](docs/LEARNING.md)
- [管理後台與 Excel／CSV 匯入指南](docs/ADMIN.md)
- [本機開發、資料來源與測試](docs/DEVELOPMENT.md)
- [GitHub Pages、Supabase 與正式資料維護](docs/OPERATIONS.md)
- [版本變更紀錄](CHANGELOG.md)
- [產品路線圖（候選方向，非交付承諾）](ROADMAP.md)

## 專案結構

```text
admin/                 管理後台介面
content/               12 組原始牌組、進階內容與匯入 CSV
examples/              管理匯入用虛構 CSV 範例
shared/                前後台共用程式（匯入解析、主題標籤）
scripts/               內容建置、檢查、匯入及安全維護工具
supabase/migrations/   資料庫結構與權限變更
supabase/tests/        SQL 權限、回填與匯入測試
tests/                 前端單元與瀏覽器測試
vendor/                固定版本的前端函式庫與授權
```

## 快速開始

需要 Node.js、Python 3；瀏覽器煙霧測試另需 Chromium。

```bash
npm ci
npm run dev
```

開啟 <http://127.0.0.1:4173/>；管理介面為 `/admin/`。本機設定仍會連線正式 Supabase，實際登入後可能修改正式資料，並非沙盒。

```bash
npm test
python3 scripts/build-advanced-content.py --check
python3 scripts/build-level-content.py --check
```

SQL 測試需 PostgreSQL 臨時資料庫，可執行 `bash scripts/run-sql-tests.sh`。完整環境、測試範圍及內容建置方式見[開發文件](docs/DEVELOPMENT.md)。

## 重要安全提醒

不要把管理員密碼、資料庫密碼、Supabase service-role key 或管理 API token 寫入前端、README、seed、commit 或公開設定檔。`supabase-config.js` 只能放公開 project URL 與 publishable/anon key；資料寫入權限由資料庫 RLS 限制。正式資料的備份與遷移須先依[正式環境維護文件](docs/OPERATIONS.md)操作；不得在正式環境重跑 seed 或重建資料表。
