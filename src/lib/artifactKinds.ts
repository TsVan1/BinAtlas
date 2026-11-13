/**
 * 载体类别索引：**只从 `nodes.json` 的 `artifact_kind` 现算**，不读任何旁路文件。
 *
 * 上一版因为 `nodes.json` 丢了这个字段，额外生成了 `publicnodes.json（artifact_kind 字段）`；
 * 投影层补齐 `artifact_kind` 之后旁路已删除——数据变了这里立刻反映，不存在
 * 「旁路忘了重新生成」导致的静默漂移。
 */
import { sortArtifactKinds } from './enums';
import type { ArtifactKindTable, AtlasNode } from './types';

export function buildArtifactKinds(nodes: readonly AtlasNode[]): ArtifactKindTable {
  const byId = new Map<string, string>();
  const kinds = new Set<string>();
  const missing: string[] = [];

  for (const node of nodes) {
    if (node.kind !== 'artifact') continue;

    const kind = node.artifact_kind?.trim() ?? '';
    if (kind === '') {
      // 不猜类别：缺了就进 missing，由状态栏与矩阵如实暴露
      missing.push(node.id);
      continue;
    }

    byId.set(node.id, kind);
    kinds.add(kind);
  }

  return { kinds: sortArtifactKinds(kinds), byId, missing };
}
