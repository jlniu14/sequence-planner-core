import { Part, InterferenceMatrix } from './types';
/**
 * 根据干涉矩阵计算装配序列。
 *
 * 策略：先求拆卸序列，再将其逆序得到装配序列。
 *
 * @param parts   零件列表
 * @param matrix  拆卸干涉矩阵
 * @returns       装配顺序的零件数组
 */
export declare function planAssemblySequence(parts: Part[], matrix: InterferenceMatrix): Part[];
//# sourceMappingURL=planner.d.ts.map