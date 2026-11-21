import { browser } from '@wdio/globals';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  artifactTimestamp,
  getArtifactsRoot,
  sanitizeFileName
} from '../config/mobileSessionInit.js';

interface ReportSink {
  addStep(message: string): Promise<void>;
  addAttachment(name: string, content: string | Buffer, type: string): Promise<void>;
  timeStep?<T>(name: string, action: () => Promise<T>): Promise<T>;
}

export class ExecutionReporter {
  private artifactDirectory?: string;
  private logPath?: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private reportSink?: ReportSink;
  private recentLines = '';

  startTest(suiteName: string, testName: string, reportSink?: ReportSink): void {
    this.recentLines = '';
    this.reportSink = reportSink;
    const runName = `${suiteName || 'suite'}-${testName || 'test'}`;
    this.artifactDirectory = path.join(
      getArtifactsRoot(),
      `${artifactTimestamp()}-${sanitizeFileName(runName)}`
    );
    this.logPath = path.join(this.artifactDirectory, 'execution.log');
    this.log(`Artifact directory: ${this.artifactDirectory}`);
  }

  log(message: string): void {
    this.recentLines = `${this.recentLines}${message}\n`.slice(-32_000);
    const line = `[${new Date().toISOString().replace('T', ' ').replace('Z', '')}] ${message}`;
    console.log(line);
    if (this.logPath) {
      const artifactDirectory = this.artifactDirectory;
      const logPath = this.logPath;
      const reportSink = this.reportSink;
      if (reportSink) {
        void reportSink.addStep(message).catch(error => {
          console.error(`Unable to record report step: ${String(error)}`);
        });
      }
      this.writeQueue = this.writeQueue
        .then(async () => {
          await mkdir(artifactDirectory!, { recursive: true });
          await appendFile(logPath!, `${line}\n`, 'utf8');
        })
        .catch(error => {
          console.error(`Unable to record execution log or report step: ${String(error)}`);
        });
    }
  }

  async timeStep<T>(name: string, action: () => Promise<T>): Promise<T> {
    if (!this.reportSink?.timeStep) return action();
    const started = performance.now();
    let status = 'PASSED';
    try {
      return await this.reportSink.timeStep(name, action);
    } catch (error) {
      status = 'FAILED';
      throw error;
    } finally {
      this.log(`Timing: ${name} | ${status} | ${(performance.now() - started).toFixed(1)} ms`);
    }
  }

  recentExecutionLog(): string {
    return this.recentLines;
  }

  async captureScreenshot(label: string): Promise<string | undefined> {
    if (!this.artifactDirectory) {
      this.log(`Screenshot skipped for "${label}" because execution context is not available.`);
      return undefined;
    }

    const screenshotPath = path.join(
      this.artifactDirectory,
      `${artifactTimestamp()}-${sanitizeFileName(label)}.png`
    );
    try {
      await mkdir(this.artifactDirectory, { recursive: true });
      await browser.saveScreenshot(screenshotPath);
      await this.reportSink?.addAttachment(label, await readFile(screenshotPath), 'image/png');
      this.log(`Saved screenshot: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      this.log(`Unable to capture screenshot for "${label}": ${String(error)}`);
      return undefined;
    }
  }

  async capturePageSource(label: string): Promise<string | undefined> {
    if (!this.artifactDirectory) {
      this.log(`Page source capture skipped for "${label}" because execution context is not available.`);
      return undefined;
    }

    const pageSourcePath = path.join(
      this.artifactDirectory,
      `${artifactTimestamp()}-${sanitizeFileName(label)}.xml`
    );
    try {
      await mkdir(this.artifactDirectory, { recursive: true });
      const pageSource = await browser.getPageSource();
      await writeFile(pageSourcePath, pageSource, 'utf8');
      await this.reportSink?.addAttachment(label, pageSource, 'application/xml');
      this.log(`Saved page source: ${pageSourcePath}`);
      return pageSourcePath;
    } catch (error) {
      this.log(`Unable to capture page source for "${label}": ${String(error)}`);
      return undefined;
    }
  }

  async captureTextArtifact(label: string, content: string): Promise<string | undefined> {
    if (!this.artifactDirectory) {
      this.log(`Text artifact skipped for "${label}" because execution context is not available.`);
      return undefined;
    }

    const textArtifactPath = path.join(
      this.artifactDirectory,
      `${artifactTimestamp()}-${sanitizeFileName(label)}.txt`
    );
    try {
      await mkdir(this.artifactDirectory, { recursive: true });
      await writeFile(textArtifactPath, content, 'utf8');
      await this.reportSink?.addAttachment(label, content, 'text/plain');
      this.log(`Saved text artifact: ${textArtifactPath}`);
      return textArtifactPath;
    } catch (error) {
      this.log(`Unable to capture text artifact for "${label}": ${String(error)}`);
      return undefined;
    }
  }

  async finishTest(status: string): Promise<void> {
    this.log(`Execution status: ${status}${this.artifactDirectory ? ` | Artifacts: ${this.artifactDirectory}` : ''}`);
    await this.writeQueue;
    if (this.logPath && this.reportSink) {
      await this.reportSink.addAttachment('execution.log', await readFile(this.logPath), 'text/plain');
    }
    this.artifactDirectory = undefined;
    this.logPath = undefined;
    this.reportSink = undefined;
    this.recentLines = '';
  }
}

export const executionReporter = new ExecutionReporter();
