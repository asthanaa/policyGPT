window.POLICY_GPT_CONFIG = {
  auth: {
    credentials: [
      {
        username: "asthanaa",
        passwordHash: "37b5f96fa78a2dcab297bb3ba583d1dca2d535d3d0a51ebead2f0dd44e44801f",
      },
      {
        username: "guest",
        passwordHash: "6b93ccba414ac1d0ae1e77f3fac560c748a6701ed6946735a49d463351518e16",
      },
    ],
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
