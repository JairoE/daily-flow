export type QuestionHistorySubmissionToken = number;

export type QuestionHistoryWriteResult<T> =
  | { status: 'written'; value: T }
  | { status: 'failed'; error: unknown }
  | { status: 'stale' };

export type QuestionHistoryWriteCoordinator = {
  issueSubmissionToken: () => QuestionHistorySubmissionToken;
  isSubmissionCurrent: (token: QuestionHistorySubmissionToken) => boolean;
  enqueueWrite: <T>(
    token: QuestionHistorySubmissionToken,
    write: () => Promise<T>,
  ) => Promise<QuestionHistoryWriteResult<T>>;
  invalidateAndDrain: () => Promise<void>;
  reopen: () => void;
};

export function createQuestionHistoryWriteCoordinator(): QuestionHistoryWriteCoordinator {
  let submissionGeneration = 0;
  let closeRequests = 0;
  let writeQueue: Promise<void> = Promise.resolve();

  function isSubmissionCurrent(
    token: QuestionHistorySubmissionToken,
  ): boolean {
    return closeRequests === 0 && token === submissionGeneration;
  }

  function enqueueWrite<T>(
    token: QuestionHistorySubmissionToken,
    write: () => Promise<T>,
  ): Promise<QuestionHistoryWriteResult<T>> {
    const result = writeQueue.then(
      async (): Promise<QuestionHistoryWriteResult<T>> => {
        if (!isSubmissionCurrent(token)) {
          return { status: 'stale' };
        }

        try {
          const value = await write();

          return isSubmissionCurrent(token)
            ? { status: 'written', value }
            : { status: 'stale' };
        } catch (error) {
          return isSubmissionCurrent(token)
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
    closeRequests += 1;

    if (closeRequests === 1) {
      submissionGeneration += 1;
    }

    await writeQueue;
  }

  function reopen(): void {
    if (closeRequests === 0) {
      return;
    }

    closeRequests -= 1;

    if (closeRequests === 0) {
      submissionGeneration += 1;
    }
  }

  return {
    issueSubmissionToken: () => submissionGeneration,
    isSubmissionCurrent,
    enqueueWrite,
    invalidateAndDrain,
    reopen,
  };
}
