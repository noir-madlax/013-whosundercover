# 谁是卧底房间版

React + Vite + TypeScript + Supabase 实时房间小游戏。第一版支持 6 位房号、匿名游客、4-10 人、房主推进、多卧底、可选白板、投票结算和 100 组内置词库。

## 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` 需要填入：

```bash
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon key
```

## Supabase 初始化

1. 在 Supabase 项目中启用 Auth 的 Anonymous Sign-Ins。
2. 打开 SQL Editor，执行 `supabase/migrations/001_initial_schema.sql`。
3. 确认 Realtime 已开启；迁移会把核心表加入 `supabase_realtime` publication。

## 部署到 013.100app.dev

```bash
pnpm build
```

上传 `dist` 目录即可。应用使用 Hash Router，所以房间链接形如：

```text
https://013.100app.dev/#/room/ABC123
```

## 测试

```bash
pnpm test
pnpm build
```
