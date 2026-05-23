# V8 不需要額外 SQL

V8 只使用既有資料表與欄位：

- profiles.role
- profiles.group_name
- profiles.default_clinic
- tasks.group_name
- tasks.priority
- tasks.status

因此不需要新增資料表。若你已經執行過 V7 的 `v7_patch.sql`，即可直接更新前端程式碼並重新部署。
