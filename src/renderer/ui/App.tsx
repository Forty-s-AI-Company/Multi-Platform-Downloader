import React, { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { shouldCollectDouyinBatch, shouldCollectTikTokBatch } from "../../../shared/platformCollection";
import type { CollectedVideoEntry, DownloadJobRequest, JobEvent } from "../../../shared/types";
import { normalizeInputUrl, tryParseUrl } from "../../../shared/url";

type PlatformTab = "universal" | "youtube" | "douyin" | "tiktok" | "instagram" | "skool";
type JobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "canceled";
type ThemeMode = "light" | "dark";
type ListFilter = "all" | JobStatus;

type JobUI = {
  id: string;
  request: DownloadJobRequest;
  url: string;
  title?: string;
  platform?: string;
  thumbnail?: string;
  route?: string;
  status: JobStatus;
  percent: number;
  speed?: string;
  eta?: string;
  total?: string;
  outputDir?: string;
  error?: string;
  logs: string[];
  queuePosition?: number;
  command?: { bin: string; args: string[] };
};

type ContextMenuState = {
  jobId: string;
  x: number;
  y: number;
};

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}$/, "時間格式必須是 HH:MM:SS，例如 00:01:10");
const themeStorageKey = "ai-yt-dlp-theme";

const tabs: Array<{ id: PlatformTab; label: string }> = [
  { id: "universal", label: "全平台" },
  { id: "youtube", label: "YouTube" },
  { id: "douyin", label: "抖音" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "skool", label: "Skool" }
];

const platformLabels: Record<string, string> = {
  youtube: "YT",
  douyin: "DY",
  tiktok: "TK",
  instagram: "IG",
  skool: "SK",
  unknown: "?"
};

const filterOptions: Array<{ value: ListFilter; label: string }> = [
  { value: "all", label: "全部狀態" },
  { value: "queued", label: "等待中" },
  { value: "running", label: "下載中" },
  { value: "paused", label: "已暫停" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失敗" },
  { value: "canceled", label: "已取消" }
];

export function App() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activeTab, setActiveTab] = useState<PlatformTab>("universal");
  const [apiMissing, setApiMissing] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const [urlsText, setUrlsText] = useState("");
  const [outputDir, setOutputDir] = useState<string | null>("F:\\Downloads\\影片\\yt-dlp-downloads");
  const [mode, setMode] = useState<DownloadJobRequest["mode"]>("video");
  const [videoQuality, setVideoQuality] = useState<DownloadJobRequest["videoQuality"]>("best");
  const [audioQuality, setAudioQuality] = useState<DownloadJobRequest["audioQuality"]>("best");
  const [advancedFormat, setAdvancedFormat] = useState("");
  const [writeSubs, setWriteSubs] = useState(true);
  const [writeAutoSubs, setWriteAutoSubs] = useState(true);
  const [subLangs, setSubLangs] = useState("zh-Hant,en");
  const [convertSubsToSrt, setConvertSubsToSrt] = useState(true);
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionStart, setSectionStart] = useState("00:00:00");
  const [sectionEnd, setSectionEnd] = useState("00:00:00");
  const [cookiesFromBrowser, setCookiesFromBrowser] = useState(false);
  const [cookiesBrowser, setCookiesBrowser] = useState<DownloadJobRequest["cookiesBrowser"]>("chrome");
  const [cookiesBrowserProfile, setCookiesBrowserProfile] = useState("Default");
  const [cookiesFile, setCookiesFile] = useState("");
  const [formatsText, setFormatsText] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [jobs, setJobs] = useState<JobUI[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [collectorBusy, setCollectorBusy] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListFilter>("all");
  const [isDraggingUrls, setIsDraggingUrls] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!window.api) {
      setApiMissing(true);
      return;
    }

    window.api
      .getJobsState()
      .then((stored) => {
        setJobs(
          stored.map((job) => ({
            id: job.jobId,
            request: job.request,
            url: job.request.url,
            title: job.title,
            platform: job.platform,
            thumbnail: job.thumbnail,
            route: job.route,
            status: job.status,
            percent: job.progress?.percent ?? 0,
            speed: job.progress?.speed,
            eta: job.progress?.eta,
            total: job.progress?.total,
            outputDir: job.outputDir,
            error: job.error,
            logs: job.logs ?? [],
            queuePosition: job.queuePosition,
            command: job.command
          }))
        );
      })
      .catch(() => {
        setApiMissing(true);
      });

    window.api
      .getQueueState()
      .then((state) => {
        setQueuePaused(state.paused);
      })
      .catch(() => {
        setQueuePaused(false);
      });

    const off = window.api.onJobEvent((event) => {
      setJobs((previous) => applyJobEvent(previous, event));
    });

    return off;
  }, []);

  useEffect(() => {
    setSelectedJobIds((previous) => previous.filter((id) => jobs.some((job) => job.id === id)));
  }, [jobs]);

  useEffect(() => {
    if (!contextMenu) return;

    function closeMenu() {
      setContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const requestBase: DownloadJobRequest = useMemo(
    () => ({
      url: "",
      outputDir,
      mode,
      videoQuality,
      audioQuality,
      advancedFormat: advancedFormat.trim() ? advancedFormat.trim() : null,
      writeSubs,
      writeAutoSubs,
      subLangs,
      convertSubsToSrt,
      isPlaylist,
      sectionStart: sectionEnabled ? sectionStart : null,
      sectionEnd: sectionEnabled ? sectionEnd : null,
      cookiesFile: cookiesFile.trim() ? cookiesFile.trim() : null,
      cookiesFromBrowser,
      cookiesBrowser,
      cookiesBrowserProfile
    }),
    [
      outputDir,
      mode,
      videoQuality,
      audioQuality,
      advancedFormat,
      writeSubs,
      writeAutoSubs,
      subLangs,
      convertSubsToSrt,
      isPlaylist,
      sectionEnabled,
      sectionStart,
      sectionEnd,
      cookiesFile,
      cookiesFromBrowser,
      cookiesBrowser,
      cookiesBrowserProfile
    ]
  );

  const waitingCount = jobs.filter((job) => job.status === "queued").length;
  const downloadingCount = jobs.filter((job) => job.status === "running").length;
  const pausedCount = jobs.filter((job) => job.status === "paused").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const completedIds = jobs.filter((job) => job.status === "completed").map((job) => job.id);
  const failedJobs = jobs.filter((job) => job.status === "failed");

  const filteredJobs = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return jobs.filter((job) => {
      const statusMatched = statusFilter === "all" ? true : job.status === statusFilter;
      if (!statusMatched) return false;

      if (!keyword) return true;
      const title = (job.title ?? "").toLowerCase();
      const url = job.url.toLowerCase();
      const route = (job.route ?? "").toLowerCase();
      return title.includes(keyword) || url.includes(keyword) || route.includes(keyword);
    });
  }, [jobs, searchKeyword, statusFilter]);

  const orderedJobs = useMemo(() => sortJobsForDisplay(filteredJobs, jobs), [filteredJobs, jobs]);

  const removableVisibleJobs = orderedJobs.filter((job) => job.status !== "running");
  const allSelectableIds = removableVisibleJobs.map((job) => job.id);
  const allSelected =
    allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedJobIds.includes(id));
  const contextMenuJob = contextMenu ? jobs.find((job) => job.id === contextMenu.jobId) : null;

  async function pickFolder() {
    if (!window.api) return;
    const picked = await window.api.pickFolder();
    if (picked) setOutputDir(picked);
  }

  async function handleListFormats() {
    if (!window.api) return;

    const urls = parseUrls(urlsText);
    if (urls.length !== 1) {
      window.alert("查看格式一次只能查 1 個網址。");
      return;
    }

    setFormatsText("正在取得格式資訊...");
    try {
      const text = await window.api.listFormats(urls[0]);
      setFormatsText(text);
    } catch (error) {
      setFormatsText(`取得格式失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function handlePasteFromClipboard() {
    if (!window.api) return;

    const rawText = window.api.readClipboardText();
    const merged = mergeUrlText(urlsText, rawText);
    if (merged === urlsText) {
      window.alert("剪貼簿裡沒有新的網址。");
      return;
    }
    setUrlsText(merged);
  }

  async function start() {
    if (!window.api) return;

    const validationError = validateBaseRequest(requestBase, {
      sectionEnabled,
      sectionStart,
      sectionEnd
    });
    if (validationError) {
      window.alert(validationError);
      return;
    }

    let urls = uniqueUrls(parseUrls(urlsText));
    if (urls.length === 0) {
      window.alert("請先貼上至少 1 個網址。");
      return;
    }

    let collectedEntries: CollectedVideoEntry[] | null = null;

    if (activeTab === "douyin" && urls.length === 1 && shouldCollectDouyinBatch(urls[0])) {
      setCollectorBusy(true);
      try {
        const collected = await window.api.collectDouyinEntries({
          url: urls[0],
          cookiesFile: requestBase.cookiesFile
        });
        const uniqueCollectedUrls = uniqueUrls(collected.map((entry) => entry.url));
        if (uniqueCollectedUrls.length === 0) {
          window.alert("目前沒有收集到作品網址。請在抖音視窗往下滑到想要的數量，再按右下角的完成按鈕。");
          return;
        }
        collectedEntries = dedupeCollectedEntries(collected);
        urls = uniqueCollectedUrls;
        setUrlsText(uniqueCollectedUrls.join("\n"));
      } catch (error) {
        window.alert(`抖音批次收集失敗：${error instanceof Error ? error.message : String(error)}`);
        return;
      } finally {
        setCollectorBusy(false);
      }
    }

    if (activeTab === "tiktok" && urls.length === 1 && shouldCollectTikTokBatch(urls[0])) {
      setCollectorBusy(true);
      try {
        const collected = await window.api.collectTikTokEntries({
          url: urls[0],
          cookiesFile: requestBase.cookiesFile
        });
        const uniqueCollectedUrls = uniqueUrls(collected.map((entry) => entry.url));
        if (uniqueCollectedUrls.length === 0) {
          window.alert("TikTok 批次頁目前沒有收集到作品網址，請先往下滑到作品真的出現，再按完成收集。");
          return;
        }
        collectedEntries = dedupeCollectedEntries(collected);
        urls = uniqueCollectedUrls;
        setUrlsText(uniqueCollectedUrls.join("\n"));
      } catch (error) {
        window.alert(`TikTok 批次收集失敗：${error instanceof Error ? error.message : String(error)}`);
        return;
      } finally {
        setCollectorBusy(false);
      }
    }

    const entrySeedMap = new Map(
      (collectedEntries ?? []).map((entry) => [normalizeInputUrl(entry.url), entry] as const)
    );

    for (const url of urls) {
      const normalizedUrl = normalizeInputUrl(url);
      const request: DownloadJobRequest = { ...requestBase, url: normalizedUrl };
      const { jobId } = await window.api.startJob(request);
      const seed = entrySeedMap.get(normalizedUrl);
      setJobs((previous) => [
        {
          id: jobId,
          request,
          url: normalizedUrl,
          title: seed?.title ?? simplifyUrl(normalizedUrl),
          platform: detectPlatformFromUrl(normalizedUrl),
          thumbnail: seed?.thumbnail ?? undefined,
          status: "queued",
          percent: 0,
          logs: []
        },
        ...previous
      ]);
    }
  }

  async function retryJob(job: JobUI) {
    if (!window.api || job.status === "running") return;
    const { jobId } = await window.api.startJob(job.request);
    setJobs((previous) => [
      {
        id: jobId,
        request: job.request,
        url: job.request.url,
        title: job.title ?? simplifyUrl(job.request.url),
        platform: job.platform ?? detectPlatformFromUrl(job.request.url),
        thumbnail: job.thumbnail,
        status: "queued",
        percent: 0,
        logs: []
      },
      ...previous
      ]);
  }

  async function retryFailedJobs() {
    if (!window.api || failedJobs.length === 0) return;

    for (const job of failedJobs) {
      const { jobId } = await window.api.startJob(job.request);
      setJobs((previous) => [
        {
          id: jobId,
          request: job.request,
          url: job.request.url,
          title: job.title ?? simplifyUrl(job.request.url),
          platform: job.platform ?? detectPlatformFromUrl(job.request.url),
          thumbnail: job.thumbnail,
          status: "queued",
          percent: 0,
          logs: []
        },
        ...previous
      ]);
    }
  }

  async function openJobFolder(job: JobUI) {
    if (!window.api) return;
    const targetPath = job.outputDir ?? job.request.outputDir;
    if (!targetPath) {
      window.alert("這筆任務還沒有可開啟的輸出資料夾。");
      return;
    }

    try {
      await window.api.openPath(targetPath);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function copyJobUrl(job: JobUI) {
    if (!window.api) return;
    window.api.writeClipboardText(job.url);
  }

  async function pauseJob(job: JobUI) {
    if (!window.api) return;
    try {
      await window.api.pauseJob(job.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function resumeJob(job: JobUI) {
    if (!window.api) return;
    try {
      await window.api.resumeJob(job.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function cancelJob(job: JobUI) {
    if (!window.api) return;
    try {
      await window.api.cancelJob(job.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeSelectedJobs() {
    if (!window.api || selectedJobIds.length === 0) return;

    try {
      await window.api.removeJobs(selectedJobIds);
      setJobs((previous) => previous.filter((job) => !selectedJobIds.includes(job.id)));
      setSelectedJobIds([]);
      setExpandedJobs((previous) => {
        const next = { ...previous };
        for (const id of selectedJobIds) delete next[id];
        return next;
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearCompletedJobs() {
    if (!window.api || completedIds.length === 0) return;

    try {
      await window.api.removeJobs(completedIds);
      setJobs((previous) => previous.filter((job) => job.status !== "completed"));
      setSelectedJobIds((previous) => previous.filter((id) => !completedIds.includes(id)));
      setExpandedJobs((previous) => {
        const next = { ...previous };
        for (const id of completedIds) delete next[id];
        return next;
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearAllJobs() {
    if (!window.api || jobs.length === 0) return;

    try {
      await window.api.clearJobs();
      setJobs([]);
      setSelectedJobIds([]);
      setExpandedJobs({});
      setContextMenu(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleToggleQueuePause() {
    if (!window.api) return;

    try {
      const state = queuePaused ? await window.api.resumeQueue() : await window.api.pauseQueue();
      setQueuePaused(state.paused);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleTheme() {
    setTheme((previous) => (previous === "light" ? "dark" : "light"));
  }

  function toggleDetails(jobId: string) {
    setExpandedJobs((previous) => ({
      ...previous,
      [jobId]: !previous[jobId]
    }));
  }

  function toggleSelect(jobId: string) {
    setSelectedJobIds((previous) =>
      previous.includes(jobId) ? previous.filter((id) => id !== jobId) : [...previous, jobId]
    );
  }

  function toggleSelectAll() {
    setSelectedJobIds(allSelected ? [] : allSelectableIds);
  }

  function openJobMenu(jobId: string, clientX: number, clientY: number) {
    const width = 220;
    const height = 250;
    const x = Math.min(clientX, window.innerWidth - width - 16);
    const y = Math.min(clientY, window.innerHeight - height - 16);
    setContextMenu({ jobId, x: Math.max(16, x), y: Math.max(16, y) });
  }

  function handleUrlsPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    const merged = mergeUrlText(urlsText, pastedText);
    if (merged === urlsText) return;
    event.preventDefault();
    setUrlsText(merged);
  }

  function handleUrlsDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingUrls(true);
  }

  function handleUrlsDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingUrls(false);
  }

  function handleUrlsDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingUrls(false);

    const droppedText =
      event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const merged = mergeUrlText(urlsText, droppedText);
    if (merged !== urlsText) {
      setUrlsText(merged);
    }
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerGlow" />

        <div className="headerTitleGroup">
          <h1 className="headerTitle">Multi-platform Downloader</h1>
          <p className="headerSubtitle">多平台影片、音訊、字幕下載與轉檔工具</p>
        </div>

        <div className="headerActions">
          <button
            className="iconButton"
            onClick={toggleTheme}
            title={theme === "light" ? "切換深色模式" : "切換淺色模式"}
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
          <button className="secondaryButton" onClick={handleListFormats}>
            查看格式
          </button>
          <button className="primaryButton" onClick={start} disabled={collectorBusy}>
            {collectorBusy ? "收集中..." : "加入下載"}
          </button>
        </div>
      </header>

      <nav className="platformTabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? "platformTab isActive" : "platformTab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="appBody">
        <section className="settingsPanel">
          {apiMissing ? (
            <div className="noticeCard">
              `window.api` 尚未掛載，請確認目前是用 Electron 啟動，而不是直接在瀏覽器打開頁面。
            </div>
          ) : null}

          {activeTab === "douyin" ? (
            <div className="noticeCard">
              抖音作者頁、搜尋頁、列表頁可以直接貼。程式會打開抖音視窗讓你往下滑，滑到你要的數量後，按右下角的完成按鈕就會開始排隊下載。
            </div>
          ) : null}

          <div className="panelCard">
            <div className="sectionHeading">基本設定</div>

            <div className="field">
              <div className="fieldTitleRow">
                <label>網址</label>
                <button className="textButton" onClick={handlePasteFromClipboard}>
                  貼上剪貼簿網址
                </button>
              </div>

              <div
                className={isDraggingUrls ? "urlDropZone isDragging" : "urlDropZone"}
                onDragOver={handleUrlsDragOver}
                onDragLeave={handleUrlsDragLeave}
                onDrop={handleUrlsDrop}
              >
                <textarea
                  value={urlsText}
                  onChange={(event) => setUrlsText(event.target.value)}
                  onPaste={handleUrlsPaste}
                  placeholder={getUrlsPlaceholder(activeTab)}
                  className="urlsTextarea"
                />
                <div className="dropHint">支援每行一筆網址，也支援直接貼上一整段文字自動抽出網址。</div>
              </div>
            </div>

            <div className="field">
              <label>輸出資料夾</label>
              <div className="inlineInput">
                <input value={outputDir ?? ""} readOnly placeholder="請選擇輸出資料夾" />
                <button className="outlineButton" onClick={pickFolder}>
                  選擇
                </button>
              </div>
            </div>
          </div>

          <div className="panelCard">
            <button
              className="toggleButton"
              onClick={() => setShowAdvancedSettings((previous) => !previous)}
            >
              <span>進階設定</span>
              <span>{showAdvancedSettings ? "收起" : "展開"}</span>
            </button>

            {showAdvancedSettings ? (
              <div className="advancedFields">
                <div className="gridFields">
                  <div className="field">
                    <label>下載模式</label>
                    <select
                      value={mode}
                      onChange={(event) =>
                        setMode(event.target.value as DownloadJobRequest["mode"])
                      }
                    >
                      <option value="video">影片</option>
                      <option value="audio">音訊</option>
                    </select>
                  </div>

                  {mode === "video" ? (
                    <div className="field">
                      <label>清晰度</label>
                      <select
                        value={videoQuality}
                        onChange={(event) =>
                          setVideoQuality(event.target.value as DownloadJobRequest["videoQuality"])
                        }
                      >
                        <option value="best">最佳</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                    </div>
                  ) : (
                    <div className="field">
                      <label>音質</label>
                      <select
                        value={audioQuality}
                        onChange={(event) =>
                          setAudioQuality(event.target.value as DownloadJobRequest["audioQuality"])
                        }
                      >
                        <option value="best">最佳</option>
                        <option value="normal">一般</option>
                      </select>
                    </div>
                  )}

                  <div className="field fieldWide">
                    <label>進階格式參數</label>
                    <input
                      value={advancedFormat}
                      onChange={(event) => setAdvancedFormat(event.target.value)}
                      placeholder='例如 "399+140"，留空就走預設模式'
                    />
                  </div>
                </div>

                <div className="gridFields">
                  <div className="field">
                    <label>字幕</label>
                    <div className="checkGroup">
                      <label className="checkboxLine">
                        <input
                          type="checkbox"
                          checked={writeSubs}
                          onChange={(event) => setWriteSubs(event.target.checked)}
                        />
                        <span>下載字幕</span>
                      </label>
                      <label className="checkboxLine">
                        <input
                          type="checkbox"
                          checked={writeAutoSubs}
                          onChange={(event) => setWriteAutoSubs(event.target.checked)}
                        />
                        <span>下載自動字幕</span>
                      </label>
                      <label className="checkboxLine">
                        <input
                          type="checkbox"
                          checked={convertSubsToSrt}
                          onChange={(event) => setConvertSubsToSrt(event.target.checked)}
                        />
                        <span>轉成 SRT</span>
                      </label>
                    </div>
                  </div>

                  <div className="field">
                    <label>字幕語言</label>
                    <input value={subLangs} onChange={(event) => setSubLangs(event.target.value)} />
                  </div>

                  <div className="field">
                    <label>播放清單 / 區間</label>
                    <div className="checkGroup">
                      <label className="checkboxLine">
                        <input
                          type="checkbox"
                          checked={isPlaylist}
                          onChange={(event) => setIsPlaylist(event.target.checked)}
                        />
                        <span>下載播放清單</span>
                      </label>
                      <label className="checkboxLine">
                        <input
                          type="checkbox"
                          checked={sectionEnabled}
                          onChange={(event) => setSectionEnabled(event.target.checked)}
                        />
                        <span>下載指定區間</span>
                      </label>
                    </div>
                  </div>
                </div>

                {sectionEnabled ? (
                  <div className="gridFields">
                    <div className="field">
                      <label>開始時間</label>
                      <input
                        value={sectionStart}
                        onChange={(event) => setSectionStart(event.target.value)}
                        placeholder="00:01:10"
                      />
                    </div>
                    <div className="field">
                      <label>結束時間</label>
                      <input
                        value={sectionEnd}
                        onChange={(event) => setSectionEnd(event.target.value)}
                        placeholder="00:03:40"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="field">
                  <label>Cookies</label>
                  <div className="cookiesGrid">
                    <label className="checkboxLine">
                      <input
                        type="checkbox"
                        checked={cookiesFromBrowser}
                        onChange={(event) => setCookiesFromBrowser(event.target.checked)}
                      />
                      <span>從瀏覽器讀取</span>
                    </label>
                    <select
                      value={cookiesBrowser}
                      disabled={!cookiesFromBrowser}
                      onChange={(event) =>
                        setCookiesBrowser(event.target.value as DownloadJobRequest["cookiesBrowser"])
                      }
                    >
                      <option value="chrome">Chrome</option>
                      <option value="edge">Edge</option>
                    </select>
                    <input
                      value={cookiesBrowserProfile}
                      disabled={!cookiesFromBrowser}
                      onChange={(event) => setCookiesBrowserProfile(event.target.value)}
                      placeholder="Profile，例如 Default"
                    />
                    <input
                      value={cookiesFile}
                      onChange={(event) => setCookiesFile(event.target.value)}
                      placeholder="或填入 cookies.txt 路徑"
                    />
                  </div>
                </div>

                {formatsText ? (
                  <div className="field">
                    <label>格式資訊</label>
                    <textarea value={formatsText} readOnly className="formatsTextarea" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="downloadPanel">
          <div className="listToolbar">
            <div className="toolbarTopRow">
              <div className="statusSummary">
                <span className="summaryPill waitingPill">等待中 {waitingCount}</span>
                <span className="summaryPill downloadingPill">下載中 {downloadingCount}</span>
                <span className="summaryPill pausedPill">已暫停 {pausedCount}</span>
                <span className="summaryPill completedPill">已完成 {completedCount}</span>
                <span className="summaryPill failedPill">失敗 {failedCount}</span>
              </div>

              <div className="filterControls">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜尋標題、網址、下載路線"
                  className="searchInput"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as ListFilter)}
                  className="filterSelect"
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="listToolbarActions">
              <button className="outlineButton" onClick={handleToggleQueuePause}>
                {queuePaused ? "繼續下載" : "暫停下載"}
              </button>
              <label className="checkboxLine compactLine">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={allSelectableIds.length === 0}
                />
                <span>全選可刪除項目</span>
              </label>
              <button
                className="outlineButton"
                onClick={removeSelectedJobs}
                disabled={selectedJobIds.length === 0}
              >
                刪除選取
              </button>
              <button
                className="outlineButton"
                onClick={clearCompletedJobs}
                disabled={completedIds.length === 0}
              >
                清除已完成
              </button>
              <button
                className="outlineButton"
                onClick={retryFailedJobs}
                disabled={failedJobs.length === 0}
              >
                重跑失敗項目
              </button>
              <button className="dangerButton" onClick={clearAllJobs} disabled={jobs.length === 0}>
                清空列表
              </button>
            </div>
          </div>

          <div className="jobList">
            {orderedJobs.length === 0 ? (
              <div className="emptyState">
                {jobs.length === 0 ? "目前還沒有下載任務，貼上網址後就可以開始。" : "目前沒有符合篩選條件的任務。"}
              </div>
            ) : null}

            {orderedJobs.map((job) => {
              const isExpanded = expandedJobs[job.id] ?? false;
              const isSelected = selectedJobIds.includes(job.id);
              const isRunning = job.status === "running";
              const title = job.title?.trim() || simplifyUrl(job.url);
              const platform = job.platform ?? detectPlatformFromUrl(job.url);

              return (
                <article
                  key={job.id}
                  className={isSelected ? "jobCard isSelected" : "jobCard"}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openJobMenu(job.id, event.clientX, event.clientY);
                  }}
                >
                  <label className="jobSelect">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isRunning}
                      onChange={() => toggleSelect(job.id)}
                    />
                  </label>

                  <div className="jobThumbWrap">
                    {job.thumbnail ? (
                      <img
                        src={job.thumbnail}
                        alt={title}
                        className="jobThumbImage"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.nextElementSibling as HTMLDivElement | null;
                          if (fallback) fallback.style.display = "grid";
                        }}
                      />
                    ) : null}
                    <div
                      className="jobThumbFallback"
                      style={{ display: job.thumbnail ? "none" : "grid" }}
                    >
                      {platformLabels[platform] ?? "?"}
                    </div>
                  </div>

                  <div className="jobMain">
                    <div className="jobCardTop">
                      <div className="jobIdentity">
                        <div className="jobTitleText" title={title}>
                          {title}
                        </div>
                        <div className="jobUrlText" title={job.url}>
                          {job.url}
                        </div>
                      </div>

                      <div className="jobTopActions">
                        <div className={`statusTag status-${job.status}`}>{getStatusLabel(job)}</div>
                        <button
                          className="jobMenuButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            openJobMenu(job.id, event.clientX, event.clientY);
                          }}
                          title="更多操作"
                        >
                          ⋯
                        </button>
                      </div>
                    </div>

                    <div className="jobMeta">
                      <span>{job.total ?? "--"}</span>
                      <span>{job.speed ?? "--"}</span>
                      <span>{job.eta ? `ETA ${job.eta}` : "--"}</span>
                      <span>
                        {job.status === "queued"
                          ? `佇列 ${job.queuePosition ?? "?"}`
                          : `${job.percent.toFixed(1)}%`}
                      </span>
                      {job.route ? <span className="routeTag">路線：{job.route}</span> : null}
                    </div>

                    <div className="progressTrack">
                      <div
                        className="progressFill"
                        style={{ width: `${Math.max(0, Math.min(100, job.percent))}%` }}
                      />
                    </div>

                    {job.status === "failed" && job.error ? (
                      <div className="errorText">{job.error}</div>
                    ) : null}
                    {job.status === "paused" && job.error ? (
                      <div className="pausedText">{job.error}</div>
                    ) : null}
                    {job.status === "canceled" && job.error ? (
                      <div className="canceledText">{job.error}</div>
                    ) : null}
                    {job.status === "completed" && job.outputDir ? (
                      <div className="doneText">{job.outputDir}</div>
                    ) : null}

                    <div className="jobActions">
                      <div className="jobActionButtons">
                        {job.status === "running" || job.status === "queued" ? (
                          <button className="outlineButton" onClick={() => pauseJob(job)}>
                            暫停
                          </button>
                        ) : null}
                        {job.status === "paused" ? (
                          <button className="outlineButton" onClick={() => resumeJob(job)}>
                            繼續
                          </button>
                        ) : null}
                        {job.status === "running" ||
                        job.status === "queued" ||
                        job.status === "paused" ? (
                          <button className="dangerButton" onClick={() => cancelJob(job)}>
                            取消
                          </button>
                        ) : null}
                        {(job.status === "failed" ||
                          job.status === "completed" ||
                          job.status === "canceled") && (
                          <button className="outlineButton" onClick={() => retryJob(job)}>
                            重新下載
                          </button>
                        )}
                        <button className="textButton" onClick={() => toggleDetails(job.id)}>
                          詳情
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="detailsPanel">
                        {job.command ? (
                          <pre className="detailsBlock">
                            {job.command.bin} {job.command.args.join(" ")}
                          </pre>
                        ) : null}
                        {job.logs.length > 0 ? (
                          <pre className="detailsBlock">{job.logs.slice(-60).join("\n")}</pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {contextMenu && contextMenuJob ? (
        <div
          className="contextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenuJob.status === "running" || contextMenuJob.status === "queued" ? (
            <button
              className="contextMenuItem"
              onClick={async () => {
                setContextMenu(null);
                await pauseJob(contextMenuJob);
              }}
            >
              暫停下載
            </button>
          ) : null}
          {contextMenuJob.status === "paused" ? (
            <button
              className="contextMenuItem"
              onClick={async () => {
                setContextMenu(null);
                await resumeJob(contextMenuJob);
              }}
            >
              繼續下載
            </button>
          ) : null}
          {contextMenuJob.status === "running" ||
          contextMenuJob.status === "queued" ||
          contextMenuJob.status === "paused" ? (
            <button
              className="contextMenuItem"
              onClick={async () => {
                setContextMenu(null);
                await cancelJob(contextMenuJob);
              }}
            >
              取消任務
            </button>
          ) : null}
          <button
            className="contextMenuItem"
            onClick={async () => {
              setContextMenu(null);
              await retryJob(contextMenuJob);
            }}
            disabled={contextMenuJob.status === "running"}
          >
            重新下載
          </button>
          <button
            className="contextMenuItem"
            onClick={async () => {
              setContextMenu(null);
              await openJobFolder(contextMenuJob);
            }}
          >
            開啟資料夾
          </button>
          <button
            className="contextMenuItem"
            onClick={() => {
              setContextMenu(null);
              copyJobUrl(contextMenuJob);
            }}
          >
            複製網址
          </button>
        </div>
      ) : null}
    </div>
  );
}

function validateBaseRequest(
  request: DownloadJobRequest,
  extras: { sectionEnabled: boolean; sectionStart: string; sectionEnd: string }
): string | null {
  if (!request.outputDir) return "請先選擇輸出資料夾。";

  if (extras.sectionEnabled) {
    const start = timeSchema.safeParse(extras.sectionStart);
    if (!start.success) return start.error.issues[0]?.message ?? "開始時間格式不正確。";

    const end = timeSchema.safeParse(extras.sectionEnd);
    if (!end.success) return end.error.issues[0]?.message ?? "結束時間格式不正確。";
  }

  return null;
}

function applyJobEvent(previous: JobUI[], event: JobEvent): JobUI[] {
  const index = previous.findIndex((job) => job.id === event.jobId);

  if (index === -1) {
    if (event.type === "job.started") {
      return [
        {
          id: event.jobId,
          request: createFallbackRequest(event.data.url),
          url: event.data.url,
          title: event.data.title ?? simplifyUrl(event.data.url),
          platform: event.data.platform,
          thumbnail: event.data.thumbnail ?? undefined,
          status: "running",
          percent: 0,
          logs: []
        },
        ...previous
      ];
    }
    return previous;
  }

  const next = [...previous];
  const current = next[index];

  switch (event.type) {
    case "job.queued":
      next[index] = {
        ...current,
        status: "queued",
        queuePosition: event.data.position
      };
      return next;
    case "job.paused":
      next[index] = {
        ...current,
        status: "paused",
        queuePosition: undefined,
        error: event.data.message ?? current.error
      };
      return next;
    case "job.canceled":
      next[index] = {
        ...current,
        status: "canceled",
        queuePosition: undefined,
        error: event.data.message ?? current.error
      };
      return next;
    case "job.route":
      next[index] = {
        ...current,
        route: event.data.label
      };
      return next;
    case "job.started":
      next[index] = {
        ...current,
        status: "running",
        url: event.data.url,
        title: event.data.title ?? current.title,
        platform: event.data.platform ?? current.platform,
        thumbnail: event.data.thumbnail ?? current.thumbnail,
        error: undefined
      };
      return next;
    case "job.command":
      next[index] = { ...current, command: event.data };
      return next;
    case "job.progress":
      next[index] = {
        ...current,
        status: "running",
        percent: event.data.percent ?? current.percent,
        speed: event.data.speed ?? current.speed,
        eta: event.data.eta ?? current.eta,
        total: event.data.total ?? current.total
      };
      return next;
    case "job.completed":
      next[index] = {
        ...current,
        status: "completed",
        percent: 100,
        outputDir: event.data.outputDir,
        queuePosition: undefined,
        error: undefined
      };
      return next;
    case "job.failed":
      next[index] = {
        ...current,
        status: "failed",
        queuePosition: undefined,
        error: event.data.message
      };
      return next;
    case "job.log":
      next[index] = { ...current, logs: [...current.logs, event.data.line].slice(-400) };
      return next;
    default:
      return next;
  }
}

function createFallbackRequest(url: string): DownloadJobRequest {
  return {
    url,
    outputDir: null,
    mode: "video",
    videoQuality: "best",
    audioQuality: "best",
    advancedFormat: null,
    writeSubs: true,
    writeAutoSubs: true,
    subLangs: "zh-Hant,en",
    convertSubsToSrt: true,
    isPlaylist: false,
    sectionStart: null,
    sectionEnd: null,
    cookiesFile: null,
    cookiesFromBrowser: false,
    cookiesBrowser: "chrome",
    cookiesBrowserProfile: "Default"
  };
}

function parseUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((item) => normalizeInputUrl(item))
    .filter(Boolean);
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s"'<>]+/g);
  return matches?.map((item) => normalizeInputUrl(item.trim())) ?? [];
}

function mergeUrlText(currentText: string, incomingText: string): string {
  const currentUrls = parseUrls(currentText);
  const incomingUrls = extractUrlsFromText(incomingText);
  if (incomingUrls.length === 0) return currentText;

  return uniqueUrls([...currentUrls, ...incomingUrls]).join("\n");
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.map((item) => normalizeInputUrl(item)).filter(Boolean))];
}

function dedupeCollectedEntries(entries: CollectedVideoEntry[]): CollectedVideoEntry[] {
  const uniqueEntries = new Map<string, CollectedVideoEntry>();

  for (const entry of entries) {
    const normalizedUrl = normalizeInputUrl(entry.url);
    if (!normalizedUrl) continue;

    const previous = uniqueEntries.get(normalizedUrl);
    uniqueEntries.set(normalizedUrl, {
      url: normalizedUrl,
      title: entry.title ?? previous?.title ?? null,
      thumbnail: entry.thumbnail ?? previous?.thumbnail ?? null
    });
  }

  return [...uniqueEntries.values()];
}

function getUrlsPlaceholder(tab: PlatformTab): string {
  switch (tab) {
    case "douyin":
      return [
        "貼上抖音單支作品、作者頁、搜尋頁或列表頁。",
        "如果是作者頁或列表頁，加入下載後會打開抖音視窗，你往下滑到想收集的數量，再按右下角完成按鈕。"
      ].join("\n");
    case "youtube":
      return "貼上 YouTube、Shorts 或播放清單網址，每行一筆。";
    case "tiktok":
      return "貼上 TikTok 網址，每行一筆。";
    case "instagram":
      return "貼上 Instagram Reels 或貼文影片網址，每行一筆。";
    case "skool":
      return "貼上 Skool 課程影片網址，每行一筆。";
    default:
      return "貼上網址，每行一筆，也可以直接貼一整段文字，程式會自動抽出網址。";
  }
}

function getStatusLabel(job: JobUI): string {
  switch (job.status) {
    case "queued":
      return "等待中";
    case "running":
      return "下載中";
    case "paused":
      return "已暫停";
    case "completed":
      return "已完成";
    case "failed":
      return "失敗";
    case "canceled":
      return "已取消";
    default:
      return job.status;
  }
}

function sortJobsForDisplay(visibleJobs: JobUI[], allJobs: JobUI[]): JobUI[] {
  const indexMap = new Map(allJobs.map((job, index) => [job.id, index]));

  return [...visibleJobs].sort((left, right) => {
    const leftPriority = getJobSortPriority(left);
    const rightPriority = getJobSortPriority(right);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.status === "running" && right.status === "running") {
      return right.percent - left.percent;
    }

    if (left.status === "queued" && right.status === "queued") {
      return (left.queuePosition ?? Number.MAX_SAFE_INTEGER) - (right.queuePosition ?? Number.MAX_SAFE_INTEGER);
    }

    return (indexMap.get(left.id) ?? 0) - (indexMap.get(right.id) ?? 0);
  });
}

function getJobSortPriority(job: JobUI): number {
  switch (job.status) {
    case "running":
      return 0;
    case "paused":
      return 1;
    case "queued":
      return 2;
    case "failed":
      return 3;
    case "completed":
      return 4;
    case "canceled":
      return 5;
    default:
      return 99;
  }
}

function detectPlatformFromUrl(url: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return "unknown";

  const host = parsed.hostname.toLowerCase();

  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("douyin.com")) return "douyin";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("skool.com")) return "skool";
  return "unknown";
}

function simplifyUrl(url: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return url;
  return `${parsed.hostname}${parsed.pathname}`;
}
