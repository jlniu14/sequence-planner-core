import { getParts, buildInterferenceMatrix } from './parser';
import { planAssemblySequence } from './planner';

function main(): void {
  console.log('========================================');
  console.log('     装配序列规划核心算法 —— 运行结果     ');
  console.log('========================================\n');

  // 1. 获取零件列表
  const parts = getParts();
  console.log('【零件列表】');
  parts.forEach(p => console.log(`  - ${p.id}: ${p.name}`));
  console.log();

  // 2. 构建拆卸干涉矩阵
  const matrix = buildInterferenceMatrix(parts);
  console.log('【拆卸干涉矩阵已构建完毕】\n');

  // 3. 计算装配序列
  const assemblySequence = planAssemblySequence(parts, matrix);

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
