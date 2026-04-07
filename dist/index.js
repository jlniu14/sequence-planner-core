"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_1 = require("./parser");
const planner_1 = require("./planner");
function main() {
    console.log('========================================');
    console.log('     装配序列规划核心算法 —— 运行结果     ');
    console.log('========================================\n');
    // 1. 获取零件列表
    const parts = (0, parser_1.getParts)();
    console.log('【零件列表】');
    parts.forEach(p => console.log(`  - ${p.id}: ${p.name}`));
    console.log();
    // 2. 构建拆卸干涉矩阵
    const matrix = (0, parser_1.buildInterferenceMatrix)(parts);
    console.log('【拆卸干涉矩阵已构建完毕】\n');
    // 3. 计算装配序列
    const assemblySequence = (0, planner_1.planAssemblySequence)(parts, matrix);
    // 4. 打印格式化装配步骤
    console.log('【装配步骤（由拆卸序列逆推）】');
    assemblySequence.forEach((part, index) => {
        console.log(`  步骤 ${index + 1}：安装 ${part.name}`);
    });
    console.log('\n========================================');
    console.log('           规划完成，共', assemblySequence.length, '步');
    console.log('========================================');
}
main();
//# sourceMappingURL=index.js.map