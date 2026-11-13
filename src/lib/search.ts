/**
 * 搜索：MiniSearch 索引来自 `index.json`（name + aliases），
 * 另叠一层**子串匹配**兜底。
 *
 * 为什么要兜底：MiniSearch 的分词器按空白/标点切词，中文名整体是一个 token，
 * `prefix: true` 只能命中「从头开始」的片段；用户搜「嵌入式」（出现在名字中间）
 * 时纯 MiniSearch 会漏。57 条数据量下全量子串扫描是零成本的，先保证搜得到。
 */
import MiniSearch from 'minisearch';
import type { SearchDoc } from './types';

export interface SearchHit {
  id: string;
  name: string;
  kind: string;
  tldr: string;
}

export interface SearchIndex {
  mini: MiniSearch<SearchDoc>;
  docs: SearchDoc[];
}

export function buildSearchIndex(docs: readonly SearchDoc[]): SearchIndex {
  const mini = new MiniSearch<SearchDoc>({
    idField: 'id',
    fields: ['name', 'aliases'],
    storeFields: ['id', 'name', 'kind', 'tldr'],
    searchOptions: {
      boost: { name: 3 },
      prefix: true,
      fuzzy: 0.2,
    },
  });

  const seen = new Set<string>();
  const unique: SearchDoc[] = [];
  for (const doc of docs) {
    if (doc.id === '' || seen.has(doc.id)) continue;
    seen.add(doc.id);
    unique.push(doc);
  }
  mini.addAll(unique);

  return { mini, docs: unique };
}

function toHit(doc: SearchDoc): SearchHit {
  return { id: doc.id, name: doc.name, kind: doc.kind, tldr: doc.tldr };
}

/** 返回按相关度排好序的命中；空查询返回空数组（不做「默认列出全部」的噪音） */
export function searchNodes(index: SearchIndex, query: string, limit = 8): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const needle = trimmed.toLowerCase();
  const ranked = new Map<string, { hit: SearchHit; rank: number }>();

  for (const doc of index.docs) {
    const name = doc.name.toLowerCase();
    let rank = 0;

    if (name === needle) rank = 6;
    else if (name.startsWith(needle)) rank = 5;
    else if (name.includes(needle)) rank = 4;
    else if (doc.aliases.some((alias) => alias.toLowerCase() === needle)) rank = 5;
    else if (doc.aliases.some((alias) => alias.toLowerCase().includes(needle))) rank = 3;

    if (rank > 0) ranked.set(doc.id, { hit: toHit(doc), rank });
  }

  for (const result of index.mini.search(trimmed)) {
    const id = String(result.id);
    if (ranked.has(id)) continue;
    const doc = index.docs.find((candidate) => candidate.id === id);
    if (!doc) continue;
    ranked.set(id, { hit: toHit(doc), rank: 2 });
  }

  return [...ranked.values()]
    .sort((a, b) => b.rank - a.rank || a.hit.name.length - b.hit.name.length || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map((entry) => entry.hit);
}
