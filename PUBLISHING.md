# 发布指南

**结论：代码侧全部就绪。剩下三步——① 建 GitHub 仓库并推送，② 加 `dsh-plugin` topic，③ 提交市场条目 PR。**

本文所有规则都**直接读自市场仓库的校验源码**（不是转述）：

| 文件 | 管什么 |
|---|---|
| `scripts/check-submission.mjs` | 仓库级闸门（4 条） |
| `scripts/lib/entries.mjs` | 条目字段格式、分类白名单 |

- 市场前端读的注册表：`https://awesome-dsh-plugin.com/plugins.json`
- 数据源仓库：`https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`
- **一次投稿 = 往那个仓库加一个文件**

文件名由 url 推导：`owner/repo` → `owner__repo`。
本插件即 `to4511543-cmd` + `dsh-opencode-go-usage` → `to4511543-cmd__dsh-opencode-go-usage.yml`。

要提交的内容已经放在本仓库里，原样复制即可：

```
submission/data/plugins/to4511543-cmd__dsh-opencode-go-usage.yml
```

---

## 一、四道自动闸门

来自 `scripts/check-submission.mjs`（逐条核对过本仓库）：

| # | 要求 | 本仓库状态 |
|---|---|---|
| 1 | 仓库里**任意** `package.json` 声明 `dsh.bundle` | ✅ 根目录 `package.json` 有 `dsh.bundle.patch` |
| 2 | 仓库创建**满 1 天**（`MIN_AGE_DAYS = 1`） | ⏳ 建仓库后需等约 24 小时 |
| 3 | 仓库存在、**未归档**（`archived`） | ✅ 待建，建成即满足 |
| 4 | **不是 DSH 本体**（`deepseek-ai/deepseek-harness` 按身份直接拒） | ✅ |

还有两条**容易被忽略但会致命**的：

### ① 只声明 `dsh.client` 会被直接拒

校验器原文：

> `declares only \`dsh.client\` — that alone is not installable`

这是**最常见的被拒原因**。所以 `package.json` 必须**同时**有 `dsh.bundle` 和 `dsh.client`——本仓库两者都有。

### ② 条目 url 指向仓库根时，**根目录**必须声明 `dsh.bundle`

校验器会实际演算安装命令：

> the entry points at the repository root, but the root `package.json` declares no `dsh.bundle` —
> `dsh plugin --profile web add github:owner/repo` would install nothing.

即使子目录里有 manifest 也不算——因为**市场生成的安装命令打的是仓库根**。本插件 manifest 就在根目录，✅。

> 附带一条冷知识：把 DSH 自己的包（`@deepseek-ai/dsh-base` 等）复制进仓库也会被识别并拒绝，
> 判定理由是"这是 harness 本身，不是给它的插件"。

### 关于闸门 2：它自己会重跑，**不要重新提交**

脚本里写得很直白：

> `repository is X days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about Xh.
> No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.`

仓库里有个 `regate.yml`，每 6 小时重跑一次这个闸门。
**今天就能开 PR**：它会红一下，然后自己变绿。重新提交、force-push 空 commit、关掉重开——全都没用，只是白折腾。

### 一个 PR 最多加 3 条

`MAX_ENTRIES_PER_PR = 3`。你这次只加 1 条，没问题。

---

## 二、为什么**不需要**发 npm

市场允许两种形态，本仓库走"能从源码装"那一种：

- 构建产物 `lib/` **已经提交进仓库**（`main` → `./lib/index.js`，`exports["./client"]` → `./lib/client.js`）
- `package.json` **没有** `prepare` / `postinstall` 之类生命周期脚本

两条合起来意味着别人执行

```sh
dsh plugin add github:to4511543-cmd/dsh-opencode-go-usage
```

时**不触发任何编译**，也就**不会撞上 pnpm 的 `allowBuilds` 构建授权**——这是从源码安装最常见的失败点。

本插件更进一步：**根本没有构建步骤**。`lib/index.js` 是普通 ESM 只 import Node 内置模块，
`lib/client.js` 是手写的 `window.__ModuleLoader__.load` 外壳（`react.createElement`，无 JSX、无 TypeScript）。
改完直接生效。

---

## 三、现在要做的

### 步骤 1 — 建仓库并推送

仓库名用 **`dsh-opencode-go-usage`**（必须和 `package.json` 的 `name` 一致，否则市场条目对不上）。

```sh
git remote add origin https://github.com/to4511543-cmd/dsh-opencode-go-usage.git
git push -u origin main
git push --follow-tags    # 打过 tag 的话
```

### 步骤 2 — 加 topic

GitHub → 仓库 → 右上 **⚙️ Settings** 旁边的 **About** → **Topics** 填 **`dsh-plugin`**。

不是硬性要求，但方便维护者和其他人按 topic 发现。

### 步骤 3 — 提交市场条目

**方式 A — 网页，约 1 分钟，不需要命令行**

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/fork> → **Create fork**
2. 在你那份 fork 里：**Add file** → **Create new file**
3. 文件名填：`data/plugins/to4511543-cmd__dsh-opencode-go-usage.yml`
4. 内容粘贴 `submission/` 里那份（完全一致）
5. **Commit changes** → 回 fork 首页 → **Contribute** → **Open pull request**
6. 标题随意，例如 `Add to4511543-cmd/dsh-opencode-go-usage`

> ⚠️ 只交这一个 `.yml`。**不要手工改 `README.md` / `README.zh.md`** ——
> 它们由 `data/plugins/*.yml` 生成，合并后会在 `main` 上自动重新生成。
> 只交 yml 也是最不容易和别人冲突的路径。

**方式 B — 用 git**

```sh
git clone https://github.com/to4511543-cmd/awesome-dsh-plugin.git
cd awesome-dsh-plugin
cp <本项目>/submission/data/plugins/to4511543-cmd__dsh-opencode-go-usage.yml data/plugins/
git add data/plugins/to4511543-cmd__dsh-opencode-go-usage.yml
git commit -m "Add to4511543-cmd/dsh-opencode-go-usage"
git push
```

然后在 GitHub 上点 Compare & pull request。

### 步骤 4 — 等它转绿

PR 上的年龄闸门现在会红。**满 24 小时后它自己重跑、自己变绿**，维护者合并后市场就会收录
（市场每次打开都实时拉注册表，通常一天内生效）。

---

## 四、条目字段规则（校验器 `validateEntries()` 逐条抄的）

- **只允许 6 个键**：`url` / `name` / `category` / `description` / `tarball` / `file`（`file` 由脚本加）。
  **多一个键就判不合格。** 特别是 `npm:` 是**明确禁止**的——校验器的原话是
  "Nothing reads anything else, so it would sit in the file looking meaningful without being so."
- `url` 必须是 `https://github.com/owner/repo` 形式。
- 文件名必须**恰好等于** `owner__repo`，且位于 `data/plugins/`、**恰好一层**
  （写成 `data/<owner>__<repo>.yml` 会**被静默忽略**：不报错、README 也不生成、合并了却什么都没发生）。
- `name` 若写成 `owner/repo` 形式，**必须与 url 指向同一个仓库**（校验器会逐字符比对，大小写不敏感）。
- `description.en` **必填**、必须**单行**、非空。
- `description.zh` **可选**——缺了维护者会补，不作为打回理由。
- **只认 `en` 和 `zh` 两种语言**，多写 `ja` 之类会被要求删掉。
- 描述里出现 `: `（英文冒号+空格）**必须加引号**，否则 YAML 会把它当成嵌套键。
  校验器专门为这个坑写了一整段更友好的报错——它是"手写条目最常见的坏法"。
- `category` 只能取白名单 **23 个**之一。

### 分类选了 `usage` 的依据

白名单里有两档看着都能放，查了实际语义：

```
CAT_IDS = ['agi','ui','usage','theme','model','identity','session','memory','tools','wsl',
           'browser','vision','voice','docs','skill','workflow','git','notify','dev',
           'security','remote','market','fun']
```

- `ui` 🎨 是界面外观类（启动动画、主题、splash 都在这里）
- **`usage` 💰 就是用量/额度/计费类**——本插件显示的正是订阅用量，归 `usage` 才准确

---

## 五、发布后自测（很重要）

**换一个干净的 profile**，按文档那样装一次：

```sh
dsh --profile smoketest --from-default-profile web
dsh plugin --profile smoketest add github:to4511543-cmd/dsh-opencode-go-usage
```

启动后**硬刷新（Ctrl+Shift+R）**，确认会话标题栏右侧出现用量徽章。

这一步验证的正是本地测不到的东西：**bundle patch 是否真的把插件挂进了层栈**。
本地一直是用 `link:` 挂的，走的是另一条路。

---

## 六、版本迭代

改完**客户端 bundle** 请**同时升版本号**：

```sh
npm version patch   # 或 minor / major
git push --follow-tags
```

用户升级后需要**重启 DSH + 硬刷新**才能看到新版：

- 客户端 bundle 的 URL 带 `rev`（内容哈希），而客户端加载器对它做了 `immutable` 缓存
- **host 半边不会热重载**（`plugin add` 能热挂载，但改文件不行），必须重启

本项目的 `CHANGELOG.md` 记得同步更新。
