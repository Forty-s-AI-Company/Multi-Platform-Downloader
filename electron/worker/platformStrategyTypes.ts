import type { CookiesSetDetails } from "electron";
import type { DownloadJobRequest, JobEvent } from "../../shared/types.js";

export type PlatformStrategyContext = {
  jobId: string;
  platform: string;
  request: DownloadJobRequest;
  normalizedCookies: CookiesSetDetails[];
  onEvent: (evt: JobEvent) => void;
  emitRoute: (label: string) => void;
};

export type PlatformStrategyResult = {
  actualDownloadUrl: string;
  titleOverride: string | null;
  thumbnailOverride?: string | null;
  prependArgs?: string[];
};

export type PlatformStrategy = {
  id: string;
  supports: (platform: string) => boolean;
  prepare: (context: PlatformStrategyContext) => Promise<PlatformStrategyResult>;
};
