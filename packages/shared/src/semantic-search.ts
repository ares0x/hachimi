// packages/shared/src/semantic-search.ts

/**
 * H4: 本地向量余弦相似度计算
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 将文本分词为字符/词 2-gram 特征向量
 */
export function tokenizeText(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return [];

  const tokens: string[] = [];
  // 1-gram
  for (const char of normalized) {
    if (char.trim()) tokens.push(char);
  }
  // 2-gram
  for (let i = 0; i < normalized.length - 1; i++) {
    const bi = normalized.slice(i, i + 2).trim();
    if (bi.length === 2) tokens.push(bi);
  }
  return tokens;
}

/**
 * H4.1: 向量语义相似度检索助手
 */
export function searchSemanticRank<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  topK = 5,
  minScore = 0.25
): T[] {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0 || items.length === 0) return [];

  // 构建统一词表 Vocabulary
  const vocabMap = new Map<string, number>();
  let vocabIdx = 0;

  for (const token of queryTokens) {
    if (!vocabMap.has(token)) {
      vocabMap.set(token, vocabIdx++);
    }
  }

  const itemTokensList = items.map((item) => tokenizeText(getText(item)));
  for (const tokens of itemTokensList) {
    for (const token of tokens) {
      if (!vocabMap.has(token)) {
        vocabMap.set(token, vocabIdx++);
      }
    }
  }

  const vocabSize = vocabMap.size;
  if (vocabSize === 0) return [];

  // 生成 Query 向量
  const queryVec = new Array(vocabSize).fill(0);
  for (const t of queryTokens) {
    const idx = vocabMap.get(t);
    if (idx !== undefined) queryVec[idx] += 1;
  }

  // 计算每个 Item 的相似度得分
  const scored = items.map((item, i) => {
    const tokens = itemTokensList[i];
    const itemVec = new Array(vocabSize).fill(0);
    for (const t of tokens) {
      const idx = vocabMap.get(t);
      if (idx !== undefined) itemVec[idx] += 1;
    }
    const score = calculateCosineSimilarity(queryVec, itemVec);
    return { item, score };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.item);
}
