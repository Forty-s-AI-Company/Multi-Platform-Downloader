import type { CollectedVideoEntry, DownloadJobRequest, JobEvent } from "../../shared/types";

declare global {
  interface Window {
    api: {
      pickFolder: () => Promise<string | null>;
      listFormats: (url: string) => Promise<string>;
      collectDouyinEntries: (params: {
        url: string;
        cookiesFile: string | null;
      }) => Promise<CollectedVideoEntry[]>;
      collectTikTokEntries: (params: {
        url: string;
        cookiesFile: string | null;
      }) => Promise<CollectedVideoEntry[]>;
      startJob: (req: DownloadJobRequest) => Promise<{ jobId: string }>;
      getJobsState: () => Promise<
        Array<{
          jobId: string;
          request: DownloadJobRequest;
          status: "queued" | "running" | "paused" | "completed" | "failed" | "canceled";
          title?: string;
          platform?: string;
          thumbnail?: string;
          route?: string;
          progress?: { percent?: number; speed?: string; eta?: string; total?: string };
          outputDir?: string;
          error?: string;
          logs?: string[];
          queuePosition?: number;
          command?: { bin: string; args: string[] };
        }>
      >;
      getQueueState: () => Promise<{ paused: boolean; runningJobId: string | null }>;
      pauseQueue: () => Promise<{ paused: boolean; runningJobId: string | null }>;
      resumeQueue: () => Promise<{ paused: boolean; runningJobId: string | null }>;
      pauseJob: (jobId: string) => Promise<{ ok: boolean }>;
      resumeJob: (jobId: string) => Promise<{ ok: boolean }>;
      cancelJob: (jobId: string) => Promise<{ ok: boolean }>;
      removeJobs: (jobIds: string[]) => Promise<{ ok: true }>;
      clearJobs: () => Promise<{ ok: true }>;
      readClipboardText: () => string;
      writeClipboardText: (text: string) => void;
      openPath: (targetPath: string) => Promise<{ ok: true }>;
      onJobEvent: (listener: (evt: JobEvent) => void) => () => void;
    };
  }
}

export {};
