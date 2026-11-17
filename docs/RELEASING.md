# 發佈新版本

## 使用受驗證的發版流程

請在 GitHub repository 的 **Actions → Validate and publish release → Run workflow** 選擇 `main`，並輸入新的版本標籤，例如 `v1.1.0`。這個流程會先驗證標籤格式，再對當次選取的 `main` commit 執行與 CI、正式網站部署相同的檢查：`npm test`（unit 與瀏覽器 smoke tests）、進階內容生成檢查，以及程度資料生成檢查。

只有所有檢查通過後，workflow 才會建立 GitHub Release；新標籤會指向剛才實際驗證的 commit。若相同標籤已存在，流程會停止，不會覆寫既有 tag 或 release。請不要用 GitHub 的 **Draft a new release** 頁面繞過這個流程。

帶有後綴的版本（例如 `v1.1.0-rc.1`）會標記為 prerelease。如果建立標籤後、建立 Release 前發生錯誤，tag 可能已存在；請檢查 Actions 日誌及 GitHub 上該 tag／release 的狀態，勿盲目重試或覆蓋既有 tag。

## 範圍與權限

這個流程是建議且受閘控的發版入口；具有 repository 寫入權限的人仍可能直接在 GitHub 網頁或其他 API 建立 release。若要在組織層級禁止繞過，repository owner 必須另外設定 tag ruleset／寫入權限，並明確授權受控的 GitHub Actions 發版身分；目前 workflow 不會改變其他人的 repository 權限。

現有 `v1.0.0` release 保持不變。新增 workflow 本身不會建立或發布任何 release。
