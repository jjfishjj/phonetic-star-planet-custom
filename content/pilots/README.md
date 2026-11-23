# 英文 A1 四選一小批試行

`en-a1-distractors.csv` 是五張既有英文 A1 卡的更新匯入檔：apple、water、book、star、smile。它只提供 `word`、原有 `hint`／`meaning`、三個 `distractors` 與原卡 `id`，其他欄位省略以保留既有值。

匯入方式：選英文牌組（`en`），使用「更新既有卡」模式，不可選追加模式；預覽應顯示五筆更新、零筆新增，並核對卡片識別、單字與正解沒有改變。若匯入前匯出的原值或 ID 已不同，請停止並先以最新資料重建檔案。

此檔是後台匯入資料，不會由 GitHub Pages 工作流程自動寫入 Supabase。
