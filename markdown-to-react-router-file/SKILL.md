---
name: "markdown-to-react-router-file"
description: "根据Markdown菜单文件生成React Router路由配置和页面文件。仅在用户明确要求生成React路由文件、页面组件，并提供Markdown菜单文件时调用。如果用户未提及React、路由、页面组件等关键词，请勿调用此技能"
version: 0.0.0
author: can2014ky
tags: [ai, skill, markdown, react, react-router-dom, parser]
---

# MD 菜单转路由生成器

根据 Markdown 格式菜单文件生成 React Router 路由配置和对应的页面文件。

## 快速使用

```bash
node .trae/skills/md-to-router/scripts/generate.js <menu.md路径> <输出路由路径> <输出页面路径>
```

**示例：**
```bash
node .trae/skills/md-to-router/scripts/generate.js /path/to/menu.md src/routes/routerNav.ts src/pages
```

## 输入格式

```markdown
- ▼ **安徽省经济大脑**
  - 目 系统首页导航
  - ▼ **1-经济监测分析子系统**
    - ▼ **安徽经济总览【完-0819】**
      - 目 省情总览【完】
```

### 解析规则

| 规则 | 说明 |
|-----|------|
| **层级关系** | 由缩进决定，缩进增加→子节点，缩进减少→返回父级 |
| **节点类型** | 有子节点→文件夹+路由(component: false)；叶子节点→页面文件(component: true) |
| **忽略内容** | `▼`、单字标记（如`目`、`名`等）+ 空格、状态标记`【完】`、日期`【0819】`、前缀数字`1-` |
| **菜单名提取** | 保留中英文和数字，去除特殊标记 |

## 输出规范

### 1. 路由文件

**路径**: `src/routes/routerNav.ts`

```typescript
import { CustomRoute } from './path';

export default [
    {
        "path": "/ahsjjdn",
        "name": "安徽省经济大脑",
        "component": false,
        "fullPath": "/ahsjjdn",
        "children": [...],
        "to": "/ahsjjdn/xtsydh"
    }
] satisfies CustomRoute[]
```

**字段说明**:
- `path`: 拼音首字母，如"安徽省经济大脑" → `/ahsjjdn`
- `name`: 清理后的中文菜单名
- `component`: 叶子节点为 `true`，有子节点为 `false`
- `fullPath`: 完整路径
- `to`: 默认跳转路径（指向第一个叶子页面）

### 2. 页面文件

**路径**: `src/pages/{拼音首字母路径}/`

```
src/pages/
└── ahsjjdn/
    ├── xtsydh/
    │   ├── index.tsx
    │   └── store.ts
    └── jjjcfxzxt/
        └── ahjjzl/
            └── sqzl/
                ├── index.tsx
                └── store.ts
```

## 命名转换

| 中文菜单名 | 转换结果 | 说明 |
|-----------|---------|------|
| 安徽省经济大脑 | ahsjjdn | 每个汉字取拼音首字母 |
| GDP主要监测指标 | gdpzyjczb | 保留英文原样 |
| 1-经济监测分析子系统 | jjjcfxzxt | 忽略前缀数字和符号 |
| 省情总览【完】 | sqzl | 忽略状态标记 |

## 实现步骤

当用户要求生成路由时：

1. **读取 MD 文件** - 使用 `fs.readFileSync`
2. **解析菜单节点** - 基于相对缩进计算层级
3. **构建树形结构** - 使用栈构建父子关系
4. **生成拼音路径** - 使用 `pinyin` 库转换
5. **生成路由配置** - 输出 `routerNav.ts`
6. **生成页面文件** - 叶子节点创建 `index.tsx` 和 `store.ts`

## 脚本位置

所有脚本和依赖已内置在 skill 目录中：

```
.trae/skills/md-to-router/
├── SKILL.md
└── scripts/
    ├── generate.js              # 主生成脚本
    ├── pinyin_dict_firstletter.js  # 拼音字典
    └── pinyinUtil.js            # 拼音工具库
```

**无需安装任何依赖，直接使用即可。**

## 注意事项

1. **文件覆盖**: 路由文件会覆盖原有内容
2. **多音字**: 使用 pinyin 库默认读音
3. **层级计算**: 基于相对缩进，不依赖具体空格数
