export type DownloadMode = "video" | "audio";

export type VideoQuality = "best" | "1080p" | "720p" | "480p";
export type AudioQuality = "best" | "normal";

export type DownloadJobRequest = {
  url: string;
  outputDir: string | null;
  mode: DownloadMode;
  videoQuality: VideoQuality;
  audioQuality: AudioQuality;
  advancedFormat: string | null;
  writeSubs: boolean;
  writeAutoSubs: boolean;
  subLangs: string;
  convertSubsToSrt: boolean;
  isPlaylist: boolean;
  sectionStart: string | null;
  sectionEnd: string | null;
  cookiesFile: string | null;
  cookiesFromBrowser: boolean;
  cookiesBrowser: "chrome" | "edge";
  cookiesBrowserProfile: string;
};

export type JobEvent =
  | { jobId: string; type: "job.queued"; data: { position: number } }
  | { jobId: string; type: "job.paused"; data: { message?: string } }
  | { jobId: string; type: "job.canceled"; data: { message?: string } }
  | { jobId: string; type: "job.route"; data: { label: string } }
  | {
      jobId: string;
      type: "job.started";
      data: {
        url: string;
        title?: string | null;
        platform?: string;
        thumbnail?: string | null;
      };
    }
  | { jobId: string; type: "job.command"; data: { bin: string; args: string[] } }
  | {
      jobId: string;
      type: "job.progress";
      data: { percent?: number; speed?: string; eta?: string; total?: string };
    }
  | { jobId: string; type: "job.log"; data: { line: string } }
  | { jobId: string; type: "job.completed"; data: { outputDir: string } }
  | { jobId: string; type: "job.failed"; data: { message: string } };
