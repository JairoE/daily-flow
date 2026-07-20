import { createQuestionHistoryWriteCoordinator } from '../lib/questionHistoryWriteCoordinator';

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('question history write coordinator', () => {
  it('rejects a stale queued write before it starts', async () => {
    const coordinator = createQuestionHistoryWriteCoordinator();
    const token = coordinator.issueSubmissionToken();
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const firstWrite = coordinator.enqueueWrite(token, async () => {
      firstStarted.resolve(undefined);
      await releaseFirst.promise;
      return 'first';
    });

    await firstStarted.promise;

    const queuedWrite = jest.fn(async () => 'queued');
    const queuedResult = coordinator.enqueueWrite(token, queuedWrite);
    const invalidation = coordinator.invalidateAndDrain();

    releaseFirst.resolve(undefined);
    const [firstResult, secondResult] = await Promise.all([
      firstWrite,
      queuedResult,
      invalidation,
    ]);

    expect(firstResult).toEqual({ status: 'stale' });
    expect(secondResult).toEqual({ status: 'stale' });
    expect(queuedWrite).not.toHaveBeenCalled();
  });

  it('drains an already-started write before deletion can proceed', async () => {
    const coordinator = createQuestionHistoryWriteCoordinator();
    const token = coordinator.issueSubmissionToken();
    const writeStarted = deferred<void>();
    const releaseWrite = deferred<void>();
    const events: string[] = [];
    const write = coordinator.enqueueWrite(token, async () => {
      events.push('write:start');
      writeStarted.resolve(undefined);
      await releaseWrite.promise;
      events.push('write:end');
      return 'saved';
    });

    await writeStarted.promise;

    const deletion = (async () => {
      await coordinator.invalidateAndDrain();
      events.push('delete');
    })();

    await Promise.resolve();
    expect(events).toEqual(['write:start']);

    releaseWrite.resolve(undefined);
    await Promise.all([write, deletion]);

    expect(events).toEqual(['write:start', 'write:end', 'delete']);
  });
});
