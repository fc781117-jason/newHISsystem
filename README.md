# NEW HIS系統-診所營運流程整合系統 Demo V14

本版為大版整合，直接把 V12、V13、V14 的主要功能合併，方便不同組別一次測試。

## 主要新增

- 掛號與初複診
- 患者管理實作化
- 患者事件紀錄
- 居家／製衣／客服工單
- 工單與任務連動
- 營運報表
- 三大組別測試架構
- V14 patch SQL

## 必做

請先執行：

```text
supabase/v14_patch.sql
```

## 更新方式

1. 上傳覆蓋 GitHub 專案
2. Commit
3. Vercel 自動部署
4. Supabase 執行 v14_patch.sql
5. 到 Vercel 更新 VITE_APP_TITLE：

```text
NEW HIS系統-診所營運流程整合系統 Demo V14
```

## Demo 邊界

不可輸入真實病患資料。
