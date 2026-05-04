import fs from "node:fs";
import path from "node:path";
import type { DownloadJobRequest, JobEvent } from "../../shared/types.js";

export type StoredJobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "canceled";

export type StoredJob = {
  jobId: string;
  request: DownloadJobRequest;
  status: StoredJobStatus;
  createdAt: number;
  updatedAt: number;
  title?: string;
  platform?: string;
  thumbnail?: string;
  route?: string;
  queuePosition?: number;
  progress?: { percent?: number; speed?: string; eta?: string; total?: string };
  outputDir?: string;
  error?: string;
  logs?: string[];
  command?: { bin: string; args: string[] };
};

type PersistedState = {
  version: 1;
  jobs: StoredJob[];
};

export class JobsStore {
  private readonly filePath: string;
  private state: PersistedState = { version: 1, jobs: [] };
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "queue.json");
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed?.version === 1 && Array.isArray(parsed.jobs)) {
        this.state = parsed;
      }
    } catch {
      // ignore broken cache
    }
  }

  getAll(): StoredJob[] {
    return [...this.state.jobs];
  }

  getById(jobId: string): StoredJob | undefined {
    return this.state.jobs.find((job) => job.jobId === jobId);
  }

  add(job: StoredJob) {
    this.state.jobs.unshift(job);
    this.scheduleSave();
  }

  removeMany(jobIds: string[]) {
    if (jobIds.length === 0) return;
    const idSet = new Set(jobIds);
    this.state.jobs = this.state.jobs.filter((job) => !idSet.has(job.jobId));
    this.scheduleSave();
  }

  clearAll() {
    this.state.jobs = [];
    this.scheduleSave();
  }

  update(jobId: string, patch: Partial<StoredJob>) {
    const index = this.state.jobs.findIndex((job) => job.jobId === jobId);
    if (index === -1) return;
    this.state.jobs[index] = {
      ...this.state.jobs[index],
      ...patch,
      updatedAt: Date.now()
    };
    this.scheduleSave();
  }

  applyEvent(jobId: string, event: JobEvent) {
    const current = this.getById(jobId);
    if (!current) return;

    switch (event.type) {
      case "job.queued":
        this.update(jobId, { status: "queued", queuePosition: event.data.position });
        return;
      case "job.paused":
        this.update(jobId, { status: "paused", queuePosition: undefined, error: event.data.message });
        return;
      case "job.canceled":
        this.update(jobId, {
          status: "canceled",
          queuePosition: undefined,
          error: event.data.message
        });
        return;
      case "job.route":
        this.update(jobId, { route: event.data.label });
        return;
      case "job.started":
        this.update(jobId, {
          status: "running",
          title: event.data.title ?? current.title,
          platform: event.data.platform ?? current.platform,
          thumbnail: event.data.thumbnail ?? current.thumbnail,
          error: undefined
        });
        return;
      case "job.command":
        this.update(jobId, { command: event.data });
        return;
      case "job.progress":
        this.update(jobId, { status: "running", progress: event.data });
        return;
      case "job.completed":
        this.update(jobId, {
          status: "completed",
          progress: { percent: 100 },
          outputDir: event.data.outputDir,
          queuePosition: undefined,
          error: undefined
        });
        return;
      case "job.failed":
        this.update(jobId, { status: "failed", queuePosition: undefined, error: event.data.message });
        return;
      case "job.log": {
        const logs = [...(current.logs ?? []), event.data.line].slice(-200);
        this.update(jobId, { logs });
        return;
      }
      default:
        return;
    }
  }

  requeueUnfinished() {
    const now = Date.now();
    this.state.jobs = this.state.jobs.map((job) => {
      if (job.status === "running") {
        return { ...job, status: "queued", updatedAt: now };
      }
      return job;
    });
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 250);
  }

  private saveNow() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    } catch {
      // ignore
    }
  }
}
