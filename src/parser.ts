import { Part, InterferenceMatrix, DIRECTIONS } from './types';

/**
 * 返回 Mock 零件列表
 *
 * 装配体描述：
 *   - Base（底座）：位于最底部，不会被其他零件阻挡。
 *   - Peg（销子）：插入 Base 的孔中，沿 +y 方向向上拔出时被 Cap 阻挡。
 *   - Cap（帽子）：扣在 Peg 上方，沿 +y 方向向上移走时不受阻挡；
 *                  拆除后，Peg 才可以沿 +y 方向取出。
 *
 * 拆卸顺序（示例）：Cap → Peg → Base
 * 装配顺序（逆序）：Base → Peg → Cap
 */
export function getParts(): Part[] {
  return [
    { id: 'base', name: 'Base（底座）' },
    { id: 'peg',  name: 'Peg（销子）' },
    { id: 'cap',  name: 'Cap（帽子）' },
  ];
}

/**
 * 返回初始拆卸干涉矩阵
 *
 * 约定：矩阵值 1 表示"被阻挡"，0 表示"无阻挡"。
 *
 * 干涉关系设定（拆卸视角）：
 *   - Cap  沿 +y 方向移出：无阻挡（可以先取下帽子）
 *   - Peg  沿 +y 方向移出：被 Cap 阻挡（帽子未取下时销子无法拔出）
 *   - Base 沿 +y 方向移出：被 Peg 和 Cap 阻挡（其他零件都在上面）
 *   - 所有零件在其余五个方向上均受到完全阻挡（简化假设：只有 +y 方向可拆）
 */
export function buildInterferenceMatrix(parts: Part[]): InterferenceMatrix {
  const partIds = parts.map(p => p.id);

  // 初始化：所有方向全部阻挡（值为 1）
  const matrix: InterferenceMatrix = {};
  for (const movingId of partIds) {
    matrix[movingId] = {} as InterferenceMatrix[string];
    for (const dir of DIRECTIONS) {
      matrix[movingId][dir] = {};
      for (const blockingId of partIds) {
        if (blockingId !== movingId) {
          matrix[movingId][dir][blockingId] = 1;
        }
      }
    }
  }

  // 覆盖：Cap 沿 +y 方向移出时无阻挡
  matrix['cap']!['+y']!['peg']  = 0;
  matrix['cap']!['+y']!['base'] = 0;

  // 覆盖：Peg 沿 +y 方向移出时，被 Cap 阻挡，不被 Base 阻挡
  matrix['peg']!['+y']!['cap']  = 1;  // Cap 在上，阻挡 Peg
  matrix['peg']!['+y']!['base'] = 0;  // Base 在下，不阻挡 Peg

  // Base 在其他零件都存在时无法沿任何方向拆除（默认已全部阻挡，保持不变）

  return matrix;
}
