#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 在 Node.js 环境中模拟浏览器全局对象
const sandbox = {
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Buffer,
    process,
    require,
    module,
    exports,
    __dirname,
    __filename,
    global: undefined, // 避免循环引用
    window: undefined,
    document: undefined,
    navigator: { userAgent: 'node' },
    // 用于存储字典数据
    pinyin_dict_firstletter: undefined,
    pinyinUtil: undefined
};
sandbox.global = sandbox;
sandbox.window = sandbox;

vm.createContext(sandbox);

// 加载 pinyinjs 纯 JS 库（无需 npm install）
const dictPath = path.join(__dirname, 'pinyin_dict_firstletter.js');
const utilPath = path.join(__dirname, 'pinyinUtil.js');

// 先加载字典文件
const dictCode = fs.readFileSync(dictPath, 'utf-8');
vm.runInContext(dictCode, sandbox);

// 再加载工具文件
const utilCode = fs.readFileSync(utilPath, 'utf-8');
vm.runInContext(utilCode, sandbox);

// 获取 pinyinUtil 实例
const pinyinUtil = sandbox.pinyinUtil;

// 检查 pinyinUtil 是否正确加载
if (!pinyinUtil || typeof pinyinUtil.getFirstLetter !== 'function') {
    console.error('错误: pinyinUtil 未能正确加载');
    console.error('pinyinUtil:', pinyinUtil);
    console.error('pinyin_dict_firstletter:', sandbox.pinyin_dict_firstletter);
    process.exit(1);
}

// 提取菜单名称（保留中英文，忽略特殊标记和前缀数字）
function extractMenuName(text) {
    // 移除行首的 - 和空格
    let cleanedText = text.replace(/^\s*-\s*/, '');
    // 移除 ▼ 符号
    cleanedText = cleanedText.replace(/[▼]/g, '');
    // 移除 ** 标记
    cleanedText = cleanedText.replace(/\*\*/g, '');
    // 移除作为标记的单字中文+空格（如"目 "、"名 "等通用标记模式）
    // 匹配：行首可选空格 + 单个中文字符 + 一个或多个空格
    cleanedText = cleanedText.replace(/^\s*[\u4e00-\u9fa5]\s+/, '');
    // 移除前缀数字和横线（如 "1-"、"2-"）
    cleanedText = cleanedText.replace(/^\d+[-\s]*/, '');
    // 匹配连续的中英文（必须包含至少一个中文或英文字符，不能只匹配数字）
    const match = cleanedText.match(/[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9]*/);
    return match ? match[0] : '';
}

// 中文转拼音首字母（保留英文原样）
function getPinyinInitials(text) {
    try {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // 如果是英文字母或数字，直接保留
            if (/[a-zA-Z0-9]/.test(char)) {
                result += char.toLowerCase();
            } else if (/[\u4e00-\u9fa5]/.test(char)) {
                // 中文字符转拼音首字母（使用 pinyinjs）
                const py = pinyinUtil.getFirstLetter(char);
                if (py && py.length > 0) {
                    result += py[0].toLowerCase();
                }
            }
        }
        return result;
    } catch (e) {
        console.warn(`拼音转换失败: ${text}`, e.message);
        return '';
    }
}

// 解析MD文件
function parseMenu(content) {
    const lines = content.split('\n');
    const nodes = [];
    let baseIndent = -1;
    let prevLevel = 0;
    const levelStack = [];

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('-')) return;

        const indent = line.search(/\S/);

        if (baseIndent === -1) {
            baseIndent = indent;
        }

        let level;
        if (indent === baseIndent) {
            level = 0;
            levelStack.length = 0;
            levelStack.push(indent);
        } else if (indent > (levelStack[levelStack.length - 1] || baseIndent)) {
            level = prevLevel + 1;
            levelStack.push(indent);
        } else {
            while (levelStack.length > 0 && indent <= levelStack[levelStack.length - 1]) {
                levelStack.pop();
            }
            level = levelStack.length;
            levelStack.push(indent);
        }
        prevLevel = level;

        const name = extractMenuName(line);
        if (!name) return;

        nodes.push({ level, name, children: [] });
    });

    return nodes;
}

// 构建树形结构
function buildTree(nodes) {
    const root = { children: [] };
    const stack = [root];

    nodes.forEach(node => {
        while (stack.length > node.level + 1) {
            stack.pop();
        }
        const parent = stack[stack.length - 1];
        parent.children = parent.children || [];
        parent.children.push(node);
        stack.push(node);
    });

    return root.children;
}

// 生成路由配置
function generateRoutes(tree, parentPath = '') {
    const routes = [];

    tree.forEach(node => {
        const pathName = getPinyinInitials(node.name);
        const currentPath = parentPath ? `${parentPath}/${pathName}` : `/${pathName}`;
        const isLeaf = !node.children || node.children.length === 0;

        const route = {
            path: `/${pathName}`,
            name: node.name,
            component: isLeaf,
            fullPath: currentPath
        };

        if (!isLeaf) {
            // 非叶子节点添加 to 字段，指向第一个子节点的 fullPath
            const firstChild = node.children[0];
            const firstChildPathName = getPinyinInitials(firstChild.name);
            route.to = `${currentPath}/${firstChildPathName}`;
            route.children = generateRoutes(node.children, currentPath);
        }

        routes.push(route);
    });

    return routes;
}

// 生成页面文件
function generatePages(tree, baseDir, parentPath = '') {
    tree.forEach(node => {
        const pathName = getPinyinInitials(node.name);
        const currentPath = parentPath ? `${parentPath}/${pathName}` : pathName;
        const dirPath = path.join(baseDir, currentPath);

        // 创建目录
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 如果是叶子节点（没有子菜单），创建 index.tsx
        if (!node.children || node.children.length === 0) {
            const filePath = path.join(dirPath, 'index.tsx');
            const content = generatePageTemplate(node.name, currentPath);
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`  📄 /${currentPath}/index.tsx`);
        } else {
            // 非叶子节点继续递归
            generatePages(node.children, baseDir, currentPath);
        }
    });
}

// 生成页面模板
function generatePageTemplate(name, routePath) {
    return `import React from 'react';
import { usePageStore } from '@/stores/usePageStore';

const ${toPascalCase(name)}Page: React.FC = () => {
  const { title, setTitle } = usePageStore();

  React.useEffect(() => {
    setTitle('${name}');
  }, [setTitle]);

  return (
    <div className="page-container">
      <h1>${name}</h1>
    </div>
  );
};

export default ${toPascalCase(name)}Page;
`;
}

// 转换为 PascalCase
function toPascalCase(str) {
    return str.replace(/[\u4e00-\u9fa5]/g, '').replace(/[^a-zA-Z0-9]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

// 主函数
function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('用法: node generate.js <menu.md> <routerNav.ts路径> <pages目录>');
        process.exit(1);
    }

    const [menuFile, routerFile, pagesDir] = args;

    // 读取菜单文件
    const content = fs.readFileSync(menuFile, 'utf-8');

    // 解析菜单
    const nodes = parseMenu(content);
    const tree = buildTree(nodes);

    // 生成路由配置
    const routes = generateRoutes(tree);

    // 写入路由文件
    const routerContent = `// 自动生成的路由配置
export const routerNav = ${JSON.stringify(routes, null, 4)};
`;
    fs.writeFileSync(routerFile, routerContent, 'utf-8');
    console.log(`✅ 路由配置已生成: ${routerFile}`);

    // 生成页面文件
    console.log(`\n📁 生成页面文件:`);
    generatePages(tree, pagesDir);

    console.log('\n🎉 完成!');
}

main();
