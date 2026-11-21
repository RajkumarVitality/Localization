import { readFile } from 'node:fs/promises';

const unsafeDeviceReason =
  'Observed failure reason: The app displayed "Unsafe device detected" and reported that it cannot load for security reasons. ' +
  'The reason the device was flagged is unknown; investigate with the app security team and LambdaTest.';

function hasDisplayedText(pageSource: string, id: string, text: string): boolean {
  return [...pageSource.matchAll(/<android\.widget\.TextView\b[^>]*>/g)].some(([element]) =>
    element.includes(`:id/${id}"`)
    && element.includes(`text="${text}"`)
    && element.includes('displayed="true"')
  );
}

export function detectObservedFailure(pageSource: string): string | undefined {
  if (hasDisplayedText(pageSource, 'dialog_title', 'Unsafe device detected')
    && hasDisplayedText(
      pageSource,
      'dialog_message',
      'Your device appears to be unsafe, and so for security reasons a.s.r Vitality cannot be loaded.'
    )) {
    return unsafeDeviceReason;
  }
  return undefined;
}

interface FailureReporter {
  log(message: string): void;
  captureTextArtifact(label: string, content: string): Promise<string | undefined>;
}

export async function reportObservedFailure(
  pageSourcePath: string | undefined,
  reporter: FailureReporter
): Promise<void> {
  if (!pageSourcePath) {
    reporter.log('[ObservedFailure] Failure reason unavailable: page source was not captured.');
    return;
  }
  let pageSource: string;
  try {
    pageSource = await readFile(pageSourcePath, 'utf8');
  } catch (error) {
    reporter.log(`[ObservedFailure] Unable to read captured page source: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const reason = detectObservedFailure(pageSource);
  if (!reason) return;
  reporter.log(reason);
  try {
    const artifact = await reporter.captureTextArtifact('Observed failure reason', reason);
    if (!artifact) reporter.log('[ObservedFailure] Unable to attach the observed failure reason.');
  } catch (error) {
    reporter.log(`[ObservedFailure] Unable to attach the observed failure reason: ${error instanceof Error ? error.message : String(error)}`);
  }
}
