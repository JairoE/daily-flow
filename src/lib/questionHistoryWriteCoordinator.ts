export type QuestionHistorySubmissionToken = number;

export type QuestionHistoryWriteResult<T> =
  | { status: 'written'; value: T }
  | { status: 'failed'; error: unknown }
  | { status: 'stale' };

export type QuestionHistoryWriteCoordinator = {
  issueSubmissionToken: () => QuestionHistorySubmissionToken;
  enqueueWrite: <T>(
    token: QuestionHistorySubmissionToken,
    write: () => Promise<T>,
  ) => Promise<QuestionHistoryWriteResult<T>>;
  invalidateAndDrain: () => Promise<void>;
};

export function createQuestionHistoryWriteCoordinator(): QuestionHistoryWriteCoordinator {
  let submissionGeneration = 0;
  let writeQueue: Promise<void> = Promise.resolve();

  function enqueueWrite<T>(
    token: QuestionHistorySubmissionToken,
    write: () => Promise<T>,
  ): Promise<QuestionHistoryWriteResult<T>> {
    const result = writeQueue.then(
      async (): Promise<QuestionHistoryWriteResult<T>> => {
        if (token !== submissionGeneration) {
          return { status: 'stale' };
        }

        try {
          const value = await write();

          return token === submissionGeneration
            ? { status: 'written', value }
            : { status: 'stale' };
        } catch (error) {
          return token === submissionGeneration
            ? { status: 'failed', error }
            : { status: 'stale' };
        }
      },
    );

    writeQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  async function invalidateAndDrain(): Promise<void> {
    submissionGeneration += 1;
    await writeQueue;
  }

  return {
    issueSubmissionToken: () => submissionGeneration,
    enqueueWrite,
    invalidateAndDrain,
  };
}
