-- 在 D1 資料庫執行以下 SQL 建立表
-- CLI: npx wrangler d1 execute jianfei-submissions --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age TEXT,
  height TEXT,
  weight TEXT,
  used_product TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at
  ON submissions (created_at DESC);
