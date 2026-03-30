window.POLICY_GPT_CONFIG = {
  auth: {
    username: "policygpt",
    passwordHash: "b67890fed8802810767d2c4001de6d03337602444fcb1e77beb797a8ec07cd6b",
  },
  openai: {
    model: "gpt-4.1-mini",
    maxOutputTokens: 600,
  },
  retrieval: {
    defaultTopK: 5,
    minTopK: 3,
    maxTopK: 8,
    chunkSizeWords: 180,
    chunkOverlapWords: 40,
    minChunkWords: 40,
  },
};
