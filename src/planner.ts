import { Part, InterferenceMatrix, Direction, DIRECTIONS } from './types';

/**
 * 判断某个零件在当前干涉矩阵中是否存在至少一个可以无阻挡移出的方向。
 *
 * @param partId   被检测的零件 ID
 * @param matrix   当前干涉矩阵（仅包含尚未拆除的零件）
 * @returns        可以无阻挡移出的方向，若不存在则返回 null
 */
function findFreeDirection(
  partId: string,
  matrix: InterferenceMatrix,
): Direction | null {
  for (const dir of DIRECTIONS) {
    const interferences = matrix[partId]![dir];
    const isBlocked = Object.values(interferences).some(v => v === 1);
    if (!isBlocked) {
      return dir;
    }
  }
  return null;
}

/**
 * 从干涉矩阵中移除已拆零件，并更新其余零件的干涉值。
 *
 * 当零件 removedId 被移走后，其他零件原本被 removedId 阻挡的情况消失。
 *
 * @param removedId  已拆除的零件 ID
 * @param matrix     当前干涉矩阵（原地修改）
 */
function removePartFromMatrix(
  removedId: string,
  matrix: InterferenceMatrix,
): void {
  // 删除该零件自身的行
  delete matrix[removedId];

  // 删除其他零件对该零件的干涉列
  for (const movingId of Object.keys(matrix)) {
    for (const dir of DIRECTIONS) {
      delete matrix[movingId]![dir][removedId];
    }
  }
}

/**
 * 基于干涉矩阵的拆卸序列生成算法。
 *
 * 算法流程：
 *   1. 在剩余零件中找到存在"某方向无阻挡"的零件。
 *   2. 将该零件列入拆卸序列，并从矩阵中移除。
 *   3. 重复，直到所有零件拆完（或陷入死锁）。
 *
 * @param parts   零件列表
 * @param matrix  拆卸干涉矩阵（将被深拷贝后操作，不影响原始数据）
 * @returns       拆卸顺序的零件数组；若存在死锁则抛出错误
 */
function generateDisassemblySequence(
  parts: Part[],
  matrix: InterferenceMatrix,
): Part[] {
  // 深拷贝矩阵，避免修改原始数据
  const workingMatrix: InterferenceMatrix = JSON.parse(JSON.stringify(matrix));

  const remaining = new Map<string, Part>(parts.map(p => [p.id, p]));
  const disassemblyOrder: Part[] = [];

  while (remaining.size > 0) {
    let removed = false;

    for (const [partId, part] of remaining) {
      const freeDir = findFreeDirection(partId, workingMatrix);
      if (freeDir !== null) {
        disassemblyOrder.push(part);
        remaining.delete(partId);
        removePartFromMatrix(partId, workingMatrix);
        removed = true;
        break; // 每轮只移除一个零件，然后重新扫描
      }
    }

    if (!removed) {
      const deadlocked = Array.from(remaining.values()).map(p => p.name).join('、');
      throw new Error(`死锁：以下零件无法拆除 —— ${deadlocked}`);
    }
  }

  return disassemblyOrder;
}

/**
 * 根据干涉矩阵计算装配序列。
 *
 * 策略：先求拆卸序列，再将其逆序得到装配序列。
 *
 * @param parts   零件列表
 * @param matrix  拆卸干涉矩阵
 * @returns       装配顺序的零件数组
 */
export function planAssemblySequence(
  parts: Part[],
  matrix: InterferenceMatrix,
): Part[] {
  const disassemblyOrder = generateDisassemblySequence(parts, matrix);
  return [...disassemblyOrder].reverse();
}
