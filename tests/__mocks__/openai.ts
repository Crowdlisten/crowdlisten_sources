/**
 * Global OpenAI mock for tests.
 * Mocks embeddings.create and chat.completions.create.
 */

const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [
    { embedding: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { embedding: [0.5, 0.4, 0.3, 0.2, 0.1] },
    { embedding: [0.3, 0.3, 0.3, 0.3, 0.3] },
  ],
});

const mockChatCompletionsCreate = jest.fn().mockResolvedValue({
  choices: [
    {
      message: {
        content: 'Cluster analysis: Theme 1 is about positive sentiment. Theme 2 is about criticism.',
      },
    },
  ],
});

export class OpenAI {
  embeddings = {
    create: mockEmbeddingsCreate,
  };

  chat = {
    completions: {
      create: mockChatCompletionsCreate,
    },
  };

  constructor(_config?: any) {}
}

export { mockEmbeddingsCreate, mockChatCompletionsCreate };
