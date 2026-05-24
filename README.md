
# NEW HIS系統-診所營運流程整合系統 Demo V15

V15 是 V14 後的流程優化版，重點是把「院區選擇、任務篩選、請假代理、月班表、資訊必要揭露」修正到更接近現場使用。

## 必做

請到 Supabase 執行：

```text
supabase/v15_patch.sql
```

## 更新方式

1. 上傳覆蓋 GitHub 專案
2. Commit
3. Vercel 自動部署
4. Supabase 執行 v15_patch.sql
5. 到 Vercel 更新 VITE_APP_TITLE：

```text
NEW HIS系統-診所營運流程整合系統 Demo V15
```

## Demo 邊界

仍不可輸入真實病患資料。
