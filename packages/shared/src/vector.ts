/**
 * 向量数学计算与轻量级文本语义相似度算子
 */

/**
 * 计算两个数值向量的余弦相似度 (Cosine Similarity: -1.0 ~ 1.0)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

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
 * 文本标点符号与空白归一化（用于相似度去重与打分）
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\d，。？！、；：""''（）()\[\]【】<>《》\-_=+\/\\|]/g, "")
    .trim();
}

/**
 * 轻量级字符级的 N-gram 文本重合相似度 (Jaccard Similarity: 0.0 ~ 1.0)
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const normA = normalizeText(textA);
  const normB = normalizeText(textB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const setA = new Set<string>();
  for (let i = 0; i < normA.length - 1; i++) {
    setA.add(normA.substring(i, i + 2));
  }

  const setB = new Set<string>();
  for (let i = 0; i < normB.length - 1; i++) {
    setB.add(normB.substring(i, i + 2));
  }

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
