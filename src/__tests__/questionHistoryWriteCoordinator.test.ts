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

  it('stays closed through deletion and reopens with a fresh generation', async () => {
    const coordinator = createQuestionHistoryWriteCoordinator();
    const oldToken = coordinator.issueSubmissionToken();
    const oldWriteStarted = deferred<void>();
    const releaseOldWrite = deferred<void>();
    const events: string[] = [];
    const oldWrite = coordinator.enqueueWrite(oldToken, async () => {
      events.push('old-write:start');
      oldWriteStarted.resolve(undefined);
      await releaseOldWrite.promise;
      events.push('old-write:end');
      return 'old';
    });

    await oldWriteStarted.promise;

    const drain = coordinator.invalidateAndDrain().then(() => {
      events.push('drain:end');
    });
    const duringDrainToken = coordinator.issueSubmissionToken();
    const duringDrainWasCurrent =
      coordinator.isSubmissionCurrent(duringDrainToken);
    const duringDrainWrite = jest.fn(async () => {
      events.push('during-drain:start');
      return 'during-drain';
    });
    const duringDrainResult = coordinator.enqueueWrite(
      duringDrainToken,
      duringDrainWrite,
    );

    releaseOldWrite.resolve(undefined);
    await drain;
    events.push('delete:start');
    await Promise.resolve();
    events.push('delete:end');
    coordinator.reopen();

    const closedTokenWasCurrentAfterReopen =
      coordinator.isSubmissionCurrent(duringDrainToken);
    const replayedClosedTokenWrite = jest.fn(async () => {
      events.push('closed-token-after-reopen:start');
      return 'closed-token-after-reopen';
    });
    const replayedClosedTokenResult = coordinator.enqueueWrite(
      duringDrainToken,
      replayedClosedTokenWrite,
    );
    const freshToken = coordinator.issueSubmissionToken();
    const freshWrite = coordinator.enqueueWrite(freshToken, async () => {
      events.push('fresh-write:start');
      return 'fresh';
    });

    const [
      oldResult,
      closedResult,
      closedAfterReopenResult,
      freshResult,
    ] = await Promise.all([
      oldWrite,
      duringDrainResult,
      replayedClosedTokenResult,
      freshWrite,
    ]);

    expect(duringDrainWasCurrent).toBe(false);
    expect(closedTokenWasCurrentAfterReopen).toBe(false);
    expect(oldResult).toEqual({ status: 'stale' });
    expect(closedResult).toEqual({ status: 'stale' });
    expect(closedAfterReopenResult).toEqual({ status: 'stale' });
    expect(freshResult).toEqual({ status: 'written', value: 'fresh' });
    expect(duringDrainWrite).not.toHaveBeenCalled();
    expect(replayedClosedTokenWrite).not.toHaveBeenCalled();
    expect(events).toEqual([
      'old-write:start',
      'old-write:end',
      'drain:end',
      'delete:start',
      'delete:end',
      'fresh-write:start',
    ]);
  });
});
