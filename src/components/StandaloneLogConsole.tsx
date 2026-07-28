import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry } from '../services/logger';
import { 
  Terminal, X, Trash2, Copy, AlertCircle, CheckCircle2, Info, 
  HelpCircle, Search, RefreshCw, Layers, ExternalLink, Download, 
  ArrowLeft, Activity, Cpu, Check, FileText, BookOpen, Image as ImageIcon, Sparkles, RotateCcw
} from 'lucide-react';
import { 
  StoryEngine, GeminiStorySubModel, HfStorySubModel,
  getActiveStoryEngine, setActiveStoryEngine,
  getActiveGeminiStorySubModel, setActiveGeminiStorySubModel,
  getActiveHfStorySubModel, setActiveHfStorySubModel,
  ImageEngine, GeminiImageSubModel, HuggingFaceSubModel, PollinationsSubModel,
  getActiveImageEngine, setActiveImageEngine,
  getActiveGeminiSubModel, setActiveGeminiSubModel,
  getActiveHfSubModel, setActiveHfSubModel,
  getActivePollinationsSubModel, setActivePollinationsSubModel,
  getAutoFallbackEnabled, setAutoFallbackEnabled
} from '../services/gemini';
import { FLiteTextureModelCard } from './FLiteTextureModelCard';

export const StandaloneLogConsole: React.FC = () => {
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
  const [modelSummary, setModelSummary] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'console' | 'model-report' | 'troubleshooting'>('console');
  const [copied, setCopied] = useState<boolean>(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Model Engine States
  const [storyEngine, setStoryEngineState] = useState<StoryEngine>(() => getActiveStoryEngine());
  const [geminiStorySubModel, setGeminiStorySubModelState] = useState<GeminiStorySubModel>(() => getActiveGeminiStorySubModel());
  const [hfStorySubModel, setHfStorySubModelState] = useState<HfStorySubModel>(() => getActiveHfStorySubModel());

  const [imageEngine, setImageEngineState] = useState<ImageEngine>(() => getActiveImageEngine());
  const [geminiSubModel, setGeminiSubModelState] = useState<GeminiImageSubModel>(() => getActiveGeminiSubModel());
  const [hfSubModel, setHfSubModelState] = useState<HuggingFaceSubModel>(() => getActiveHfSubModel());
  const [pollinationsSubModel, setPollinationsSubModelState] = useState<PollinationsSubModel>(() => getActivePollinationsSubModel());

  const [autoFallback, setAutoFallbackState] = useState<boolean>(() => getAutoFallbackEnabled());
  const [showFLiteTextureModal, setShowFLiteTextureModal] = useState<boolean>(false);

  const handleSetStoryEngine = (engine: StoryEngine) => {
    setStoryEngineState(engine);
    setActiveStoryEngine(engine);
  };
  const handleSetGeminiStorySubModel = (model: GeminiStorySubModel) => {
    setGeminiStorySubModelState(model);
    setActiveGeminiStorySubModel(model);
  };
  const handleSetHfStorySubModel = (model: HfStorySubModel) => {
    setHfStorySubModelState(model);
    setActiveHfStorySubModel(model);
  };

  const handleSetImageEngine = (engine: ImageEngine) => {
    setImageEngineState(engine);
    setActiveImageEngine(engine);
  };
  const handleSetGeminiSubModel = (model: GeminiImageSubModel) => {
    setGeminiSubModelState(model);
    setActiveGeminiSubModel(model);
  };
  const handleSetHfSubModel = (model: HuggingFaceSubModel) => {
    setHfSubModelState(model);
    setActiveHfSubModel(model);
  };
  const handleSetPollinationsSubModel = (model: PollinationsSubModel) => {
    setPollinationsSubModelState(model);
    setActivePollinationsSubModel(model);
  };

  const handleSetAutoFallback = (enabled: boolean) => {
    setAutoFallbackState(enabled);
    setAutoFallbackEnabled(enabled);
  };

  const fetchServerData = async () => {
    setIsFetching(true);
    try {
      const [logsRes, summaryRes] = await Promise.allSettled([
        fetch('/api/server-logs').then(r => r.json()),
        fetch('/api/model-usage-summary').then(r => r.json())
      ]);

      if (logsRes.status === 'fulfilled' && logsRes.value?.logs) {
        setServerLogs(logsRes.value.logs);
      }
      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        setModelSummary(summaryRes.value);
      }
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('Failed to fetch server logs/summary', err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    setClientLogs(logger.getLogs());
    const unsubscribe = logger.subscribe(() => {
      setClientLogs(logger.getLogs());
    });

    fetchServerData();

    const interval = setInterval(() => {
      if (isAutoRefresh) {
        fetchServerData();
      }
    }, 1500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [isAutoRefresh]);

  // Combine and deduplicate client & server logs
  const combinedLogs: LogEntry[] = React.useMemo(() => {
    const map = new Map<string, LogEntry>();
    [...clientLogs, ...serverLogs].forEach(l => {
      map.set(l.id, l);
    });
    return Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id));
  }, [clientLogs, serverLogs]);

  const filteredLogs = combinedLogs.filter(log => {
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = log.title.toLowerCase().includes(q);
      const matchDetails = (log.details || '').toLowerCase().includes(q);
      const matchModel = (log.model || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDetails && !matchModel) return false;
    }
    return true;
  });

  const handleClearAll = async () => {
    logger.clearLogs();
    try {
      await fetch('/api/server-logs', { method: 'DELETE' });
    } catch (e) {}
    fetchServerData();
  };

  const handleCopy = () => {
    const text = filteredLogs
      .map(
        l =>
          `[${l.timestamp}] [${l.category}] [${l.level.toUpperCase()}] ${l.title} ${
            l.model ? `(Model: ${l.model})` : ''
          } ${l.durationMs ? `(${l.durationMs}ms)` : ''}\n${l.details || ''}`
      )
      .join('\n----------------------------------------\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const text = filteredLogs
      .map(
        l =>
          `[${l.timestamp}] [${l.category}] [${l.level.toUpperCase()}] ${l.title} ${
            l.model ? `(Model: ${l.model})` : ''
          }\n${l.details || ''}`
      )
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comicskido_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPopout = () => {
    window.open(
      window.location.origin + window.location.pathname + '?view=logs',
      'ComicskidoLogConsole',
      'width=1200,height=800,scrollbars=yes,resizable=yes'
    );
  };

  const errorLogs = combinedLogs.filter(l => l.level === 'error' || l.title.toLowerCase().includes('failed') || l.title.toLowerCase().includes('error'));

  return (
    <div className="min-h-screen bg-[#0a0d14] text-gray-100 font-mono flex flex-col overflow-hidden" dir="ltr">
      {/* Top Header Bar */}
      <header className="bg-[#111827] border-b-2 border-black px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/20 border border-accent/40 rounded-xl text-accent shadow-inner">
            <Terminal size={22} />
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 text-white">
              <span>COMICSKIDO AI LIVE SYSTEM CONSOLE</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-sans flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE MONITORED
              </span>
            </h1>
            <p className="text-[11px] text-gray-400 font-sans">
              Standalone real-time API inspector, model request stream, and server diagnostic hub
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap font-sans">
          <button
            type="button"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isAutoRefresh
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-emerald-400' : ''} />
            <span>{isAutoRefresh ? 'Auto Sync: ON (1.5s)' : 'Auto Sync: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={fetchServerData}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
            title="Refresh logs & reports now"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={openPopout}
            className="px-3 py-1.5 bg-accent text-black hover:bg-amber-300 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all shadow-sm"
            title="Open in a standalone separate window"
          >
            <ExternalLink size={13} />
            <span>Popout Window ↗</span>
          </button>

          <a
            href={window.location.origin + window.location.pathname}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <ArrowLeft size={13} />
            <span>Back to App</span>
          </a>
        </div>
      </header>

      {/* AI Model Controls Bar (Story Decomposition + Image Creation) */}
      <div className="bg-[#131b29] border-b border-zinc-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-sans shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* PATH 1: 📖 Story Decomposition Models Selector */}
          <div className="flex items-center gap-2 bg-[#0a0d14] px-3 py-1.5 rounded-xl border border-zinc-700/60 shadow-inner">
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-400 tracking-wider">
              <BookOpen size={12} className="text-amber-400 shrink-0" />
              <span>Story Decomposition:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const nextEngine: StoryEngine = storyEngine === 'gemini' ? 'huggingface' : 'gemini';
                  handleSetStoryEngine(nextEngine);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase transition-all cursor-pointer shadow-sm ${
                  storyEngine === 'gemini'
                    ? 'bg-purple-900 text-purple-200 border-purple-700 hover:bg-purple-800'
                    : 'bg-amber-400 text-black border-amber-500 hover:bg-amber-300'
                }`}
                title="Click to toggle Story AI engine (Gemini AI vs Hugging Face Open LLM)"
              >
                <Sparkles size={10} />
                <span>{storyEngine === 'gemini' ? 'Gemini AI' : 'Hugging Face'}</span>
              </button>

              {storyEngine === 'gemini' ? (
                <select
                  value={geminiStorySubModel}
                  onChange={(e) => handleSetGeminiStorySubModel(e.target.value as GeminiStorySubModel)}
                  className="bg-purple-950 text-purple-100 border border-purple-800 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none transition-all"
                  title="Select Gemini model for story decomposition"
                >
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              ) : (
                <select
                  value={hfStorySubModel}
                  onChange={(e) => handleSetHfStorySubModel(e.target.value as HfStorySubModel)}
                  className="bg-zinc-900 text-amber-300 border border-zinc-700 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none transition-all"
                  title="Select Hugging Face Open LLM"
                >
                  <option value="google/gemma-3-4b-it">Google Gemma 3 (4B)</option>
                  <option value="meta-llama/Llama-3.2-3B-Instruct">Meta Llama 3.2 (3B)</option>
                  <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 (7B)</option>
                </select>
              )}
            </div>
          </div>

          {/* PATH 2: 🎨 Image Creation Models Selector */}
          <div className="flex items-center gap-2 bg-[#0a0d14] px-3 py-1.5 rounded-xl border border-zinc-700/60 shadow-inner">
            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-purple-300 tracking-wider">
              <ImageIcon size={12} className="text-purple-400 shrink-0" />
              <span>Image Creation:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const nextEngine: ImageEngine =
                    imageEngine === 'gemini' ? 'huggingface' :
                    imageEngine === 'huggingface' ? 'pollinations' : 'gemini';
                  handleSetImageEngine(nextEngine);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase transition-all cursor-pointer shadow-sm ${
                  imageEngine === 'gemini'
                    ? 'bg-purple-900 text-purple-200 border-purple-700 hover:bg-purple-800'
                    : imageEngine === 'huggingface'
                    ? 'bg-amber-400 text-black border-amber-500 hover:bg-amber-300'
                    : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                }`}
                title="Click to toggle Image Generation AI Engine"
              >
                <ImageIcon size={10} />
                <span>{imageEngine === 'gemini' ? 'Gemini 3.1' : imageEngine === 'huggingface' ? 'Hugging Face' : 'Pollinations AI'}</span>
              </button>

              {imageEngine === 'huggingface' ? (
                <select
                  value={hfSubModel}
                  onChange={(e) => handleSetHfSubModel(e.target.value as HuggingFaceSubModel)}
                  className="bg-zinc-900 text-amber-300 border border-zinc-700 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none transition-all"
                  title="Select Hugging Face sub-model"
                >
                  <option value="black-forest-labs/FLUX.1-schnell">FLUX.1 Schnell</option>
                  <option value="black-forest-labs/FLUX.1-dev">FLUX.1 Dev</option>
                  <option value="Freepik/F-Lite-Texture">Freepik / F-Lite-Texture (10B)</option>
                  <option value="ByteDance/SDXL-Lightning">SDXL Lightning</option>
                  <option value="nerijs/pixel-art-xl">Pixel Art XL</option>
                  <option value="stabilityai/stable-diffusion-3.5-large">SD 3.5 Large</option>
                  <option value="microsoft/Mage-Flow-Turbo">Mage-Flow-Turbo</option>
                  <option value="krea/Krea-2-Turbo">Krea-2-Turbo</option>
                  <option value="prompthero/openjourney-v4">OpenJourney v4</option>
                </select>
              ) : imageEngine === 'gemini' ? (
                <select
                  value={geminiSubModel}
                  onChange={(e) => handleSetGeminiSubModel(e.target.value as GeminiImageSubModel)}
                  className="bg-purple-950 text-purple-200 border border-purple-800 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none transition-all"
                  title="Select Google Gemini Image Model"
                >
                  <option value="gemini-3.1-flash-image">Gemini 3.1 Flash Image</option>
                  <option value="gemini-3.1-flash-lite-image">Nano Banana 2 Lite</option>
                  <option value="gemini-3-pro-image">Nano Banana Pro</option>
                  <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                </select>
              ) : (
                <select
                  value={pollinationsSubModel}
                  onChange={(e) => handleSetPollinationsSubModel(e.target.value as PollinationsSubModel)}
                  className="bg-blue-950 text-blue-100 border border-blue-800 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold cursor-pointer hover:bg-blue-900 focus:outline-none transition-all"
                  title="Select Pollinations AI Sub-model"
                >
                  <optgroup label="Core & Open-Source">
                    <option value="flux">Flux / Flux Schnell</option>
                    <option value="flux-realism">Flux Realism</option>
                    <option value="flux-anime">Flux Anime</option>
                    <option value="flux-3d">Flux 3D</option>
                    <option value="turbo">Turbo (Instant)</option>
                    <option value="stable-diffusion">Stable Diffusion</option>
                  </optgroup>
                  <optgroup label="Specialized & Custom">
                    <option value="z-image">Z-Image (Artistic)</option>
                    <option value="nano-banana">Nano Banana</option>
                    <option value="nano-banana-pro">Nano Banana Pro</option>
                    <option value="seedream">Seedream</option>
                    <option value="seedream-4.5">Seedream 4.5</option>
                    <option value="grok-imagine">Grok Imagine</option>
                    <option value="nova-canvas">Nova Canvas</option>
                  </optgroup>
                  <optgroup label="Premium Tier">
                    <option value="gpt-image">GPT Image</option>
                    <option value="gpt-image-1.5">GPT Image 1.5</option>
                    <option value="kontext">Kontext</option>
                    <option value="klein">Klein</option>
                  </optgroup>
                </select>
              )}

              {/* Automatic Fallback Toggle */}
              <button
                type="button"
                onClick={() => handleSetAutoFallback(!autoFallback)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                  autoFallback
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                    : 'bg-rose-950 text-rose-300 border-rose-800 hover:bg-rose-900'
                }`}
                title={autoFallback ? "Auto Fallback ON" : "Auto Fallback OFF"}
              >
                <RotateCcw size={9} className={`shrink-0 ${autoFallback ? 'animate-spin-slow' : ''}`} />
                <span>Fallback: {autoFallback ? 'ON' : 'OFF'}</span>
              </button>

              {/* F-Lite Card Button */}
              <button
                type="button"
                onClick={() => setShowFLiteTextureModal(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500 bg-amber-400 text-black text-[9px] font-mono font-bold hover:bg-amber-300 transition-all cursor-pointer shadow-sm"
                title="Open F-Lite Texture Model Card"
              >
                <Sparkles size={9} className="shrink-0 text-black" />
                <span>F-Lite</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Navigation & Sub-Header */}
      <div className="bg-[#161f2e] border-b border-zinc-800 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-sans shrink-0">
        <div className="flex items-center gap-2">
          {/* View Tabs */}
          <div className="flex bg-black/60 p-1 rounded-xl border border-zinc-800 font-sans text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('console')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'console'
                  ? 'bg-accent text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Terminal size={14} />
              <span>Live Console Stream ({filteredLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('model-report')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'model-report'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Activity size={14} />
              <span>Model Report Summary</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('troubleshooting')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'troubleshooting'
                  ? 'bg-rose-500 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <HelpCircle size={14} />
              <span>Error Diagnostics ({errorLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Quick Utilities */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1.5 bg-black/40 hover:bg-black/70 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTxt}
            className="px-2.5 py-1.5 bg-black/40 hover:bg-black/70 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Download size={13} />
            <span>Export .txt</span>
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <Trash2 size={13} />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-hidden p-4 flex flex-col">
        {activeTab === 'console' && (
          <div className="flex-1 bg-[#0d121d] border-2 border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-inner">
            {/* Filter Toolbar */}
            <div className="bg-[#131a27] px-4 py-2.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter logs by keyword..."
                    className="bg-black/60 border border-zinc-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent w-60"
                  />
                </div>

                {/* Filter Category */}
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400 text-[11px]">Category:</span>
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="bg-black/60 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="STORY">STORY (Decomposition)</option>
                    <option value="PANEL_GEN">PANEL_GEN (Comic Art)</option>
                    <option value="AVATAR_GEN">AVATAR_GEN (Portraits)</option>
                    <option value="PHOTO_LIKENESS">PHOTO_LIKENESS</option>
                    <option value="SERVER">SERVER</option>
                    <option value="SYSTEM">SYSTEM</option>
                  </select>
                </div>

                {/* Filter Level */}
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400 text-[11px]">Level:</span>
                  <select
                    value={filterLevel}
                    onChange={e => setFilterLevel(e.target.value)}
                    className="bg-black/60 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
                  >
                    <option value="ALL">All Levels</option>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warn">Warnings</option>
                    <option value="error">Errors</option>
                  </select>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 font-sans flex items-center gap-3">
                <span>Showing <strong>{filteredLogs.length}</strong> of {combinedLogs.length} entries</span>
                {lastRefreshedAt && <span className="opacity-60">Last synced: {lastRefreshedAt}</span>}
              </div>
            </div>

            {/* Log Stream Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs select-text">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 font-sans space-y-2 py-12">
                  <Info size={32} className="opacity-40" />
                  <p className="text-sm font-semibold">No log entries found matching filters.</p>
                </div>
              ) : (
                filteredLogs.map(log => {
                  const isError = log.level === 'error' || log.title.toLowerCase().includes('failed');
                  const isSuccess = log.level === 'success' || log.title.toLowerCase().includes('rendered') || log.title.toLowerCase().includes('succeeded');
                  const isWarn = log.level === 'warn';

                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isError
                          ? 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                          : isSuccess
                          ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                          : isWarn
                          ? 'bg-amber-950/20 border-amber-800/60 text-amber-200'
                          : 'bg-black/40 border-zinc-800/80 text-zinc-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-[10px] bg-black/60 px-2 py-0.5 rounded border border-zinc-800">
                            {log.timestamp}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-sans border ${
                              log.category === 'STORY'
                                ? 'bg-purple-900/60 text-purple-300 border-purple-700/60'
                                : log.category === 'PANEL_GEN'
                                ? 'bg-blue-900/60 text-blue-300 border-blue-700/60'
                                : log.category === 'AVATAR_GEN'
                                ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60'
                                : log.category === 'SERVER'
                                ? 'bg-amber-900/60 text-amber-300 border-amber-700/60'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}
                          >
                            {log.category}
                          </span>
                          <span className="font-bold text-sm tracking-tight">{log.title}</span>
                        </div>

                        {log.model && (
                          <span className="text-[10px] font-sans bg-black/70 px-2 py-0.5 rounded text-amber-300 border border-zinc-700">
                            Model: {log.model}
                          </span>
                        )}
                      </div>

                      {log.details && (
                        <div className="mt-1.5 p-2 bg-black/60 rounded-lg text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono border border-zinc-800/80">
                          {log.details}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'model-report' && (
          <div className="flex-1 bg-[#0d121d] border-2 border-zinc-800 rounded-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                  <Activity size={20} />
                  <span>AI SERVER MODEL USAGE REPORT & STATISTICS</span>
                </h2>
                <p className="text-xs text-zinc-400 font-sans">
                  Real-time breakdown of API model requests, character avatars, and comic panels
                </p>
              </div>

              <div className="text-right">
                <div className="text-2xl font-black text-white">
                  {modelSummary?.summaryReport?.totalGenerations || 0}
                </div>
                <div className="text-[10px] text-zinc-400 uppercase font-sans">Total Generations Recorded</div>
              </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar Summary */}
              <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                    <span>👤 Character Avatars</span>
                  </h3>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-bold font-sans">
                    {modelSummary?.summaryReport?.avatarSummary?.totalAvatarsGenerated || 0} Total
                  </span>
                </div>

                <div className="space-y-2 text-xs font-sans">
                  <div className="text-zinc-400 font-semibold text-[11px] uppercase">Models Used Breakdown:</div>
                  {Object.entries(modelSummary?.summaryReport?.avatarSummary?.modelsUsedBreakdown || {}).length === 0 ? (
                    <div className="text-zinc-500 italic py-2">No avatar generations recorded yet.</div>
                  ) : (
                    Object.entries(modelSummary?.summaryReport?.avatarSummary?.modelsUsedBreakdown || {}).map(([model, count]: [string, any]) => (
                      <div key={model} className="flex justify-between items-center bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                        <span className="font-mono text-zinc-200">{model}</span>
                        <span className="font-bold bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded text-[11px] border border-emerald-800">
                          {count} portrait(s)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Panel Summary */}
              <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="font-bold text-sm text-blue-400 flex items-center gap-2">
                    <span>🎨 Comic Panels</span>
                  </h3>
                  <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full text-xs font-bold font-sans">
                    {modelSummary?.summaryReport?.comicPagesAndPanelsSummary?.totalPanelsGenerated || 0} Total
                  </span>
                </div>

                <div className="space-y-2 text-xs font-sans">
                  <div className="text-zinc-400 font-semibold text-[11px] uppercase">Models Used Breakdown:</div>
                  {Object.entries(modelSummary?.summaryReport?.comicPagesAndPanelsSummary?.modelsUsedBreakdown || {}).length === 0 ? (
                    <div className="text-zinc-500 italic py-2">No comic panel generations recorded yet.</div>
                  ) : (
                    Object.entries(modelSummary?.summaryReport?.comicPagesAndPanelsSummary?.modelsUsedBreakdown || {}).map(([model, count]: [string, any]) => (
                      <div key={model} className="flex justify-between items-center bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                        <span className="font-mono text-zinc-200">{model}</span>
                        <span className="font-bold bg-blue-950 text-blue-300 px-2 py-0.5 rounded text-[11px] border border-blue-800">
                          {count} panel(s)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Generation History Log Table */}
            <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 space-y-3 font-sans">
              <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                <FileText size={16} className="text-amber-400" />
                <span>Recent Image Generation Event History</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Title / Prompt</th>
                      <th className="py-2 px-3">Requested Engine</th>
                      <th className="py-2 px-3">Model Used</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {modelSummary?.generationHistory?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-zinc-500 italic">No history entries recorded yet.</td>
                      </tr>
                    ) : (
                      modelSummary?.generationHistory?.slice().reverse().map((rec: any) => (
                        <tr key={rec.id} className="hover:bg-zinc-900/50 transition-colors">
                          <td className="py-2 px-3 text-zinc-400 text-[11px]">{rec.timestamp}</td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-sans ${
                              rec.category === 'avatar' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}>
                              {rec.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-zinc-200 truncate max-w-xs">{rec.titleOrPrompt}</td>
                          <td className="py-2 px-3 text-amber-300">{rec.requestedEngine}</td>
                          <td className="py-2 px-3 text-zinc-300">{rec.modelUsed}</td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-sans ${
                              rec.status === 'success' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'troubleshooting' && (
          <div className="flex-1 bg-[#0d121d] border-2 border-zinc-800 rounded-2xl p-6 overflow-y-auto space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                <AlertCircle size={20} />
                <span>ERROR DIAGNOSTICS & TROUBLESHOOTING TICKETS</span>
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Real-time error analysis and suggested resolutions for API limits or fallback occurrences
              </p>
            </div>

            {errorLogs.length === 0 ? (
              <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-xl p-8 text-center space-y-2 font-sans">
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
                <h3 className="text-base font-bold text-emerald-300">All Systems Nominal</h3>
                <p className="text-xs text-emerald-200/80 max-w-md mx-auto">
                  No active errors detected in server or client logs. Story decomposition and image generators are running cleanly.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {errorLogs.map((errLog, idx) => {
                  const getDisplayModel = () => {
                    if (errLog.model) return errLog.model;
                    const matchModel = errLog.details?.match(/Model:\s*([^\]\s,]+)/i) || errLog.details?.match(/Model\/Sub-Model:\s*([^\]\s,]+)/i);
                    if (matchModel) return matchModel[1];
                    if (errLog.details?.includes('huggingface') || errLog.title.includes('huggingface')) return 'Hugging Face Model';
                    if (errLog.details?.includes('pollinations')) return 'Pollinations AI';
                    return 'gemini-3.1-flash-image';
                  };
                  const modelName = getDisplayModel();

                  return (
                    <div key={idx} className="bg-rose-950/20 border-2 border-rose-900/80 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                            <AlertCircle size={14} />
                            <span>{errLog.title}</span>
                          </span>
                          <span className="bg-rose-950/80 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                            {errLog.category}
                          </span>
                          <span className="bg-purple-950/80 text-purple-200 border border-purple-800/80 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm">
                            <Cpu size={12} className="text-purple-400" />
                            <span>Model/Sub-Model: {modelName}</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">{errLog.timestamp}</span>
                      </div>

                      <div className="bg-black/60 p-3 rounded-lg text-xs font-mono text-rose-200 border border-rose-900/40">
                        {errLog.details || errLog.title}
                      </div>

                      <div className="bg-zinc-900/80 p-3 rounded-lg text-xs font-sans text-zinc-300 border border-zinc-800 space-y-1">
                        <div className="font-bold text-amber-300 text-[11px] uppercase">Suggested Action / Resolution:</div>
                        {(() => {
                          const detailsUpper = (errLog.details || '').toUpperCase();
                          const titleUpper = (errLog.title || '').toUpperCase();
                          const isQuotaOrRateLimit = detailsUpper.includes('429') || detailsUpper.includes('RESOURCE_EXHAUSTED') || detailsUpper.includes('QUOTA') || detailsUpper.includes('RATE LIMIT') || titleUpper.includes('RATE LIMIT');
                          const isHfError = detailsUpper.includes('HUGGING') || detailsUpper.includes('CREDITS DEPLETED') || modelName.startsWith('hf-');

                          if (isQuotaOrRateLimit) {
                            return (
                              <p className="text-zinc-200 leading-snug">
                                <strong className="text-amber-400">Google Gemini Free-Tier Rate Limit (429 / Quota Exceeded):</strong> You reached the Google Gemini free-tier request or token limit for model <code className="text-amber-300 font-mono bg-black/50 px-1 py-0.5 rounded">{modelName}</code>. Please wait ~30 seconds for quota cooldown, or switch the Image Engine in the top header selector to Hugging Face or Pollinations AI.
                              </p>
                            );
                          }
                          if (isHfError) {
                            return (
                              <p className="text-zinc-200 leading-snug">
                                <strong className="text-rose-400">Hugging Face API Error:</strong> The Hugging Face inference request for sub-model <code className="text-rose-300 font-mono bg-black/50 px-1 py-0.5 rounded">{modelName}</code> failed or hit account quota limits. Ensure your Hugging Face API key is configured in Settings &gt; Secrets, or switch Image Engine to Google Gemini or Pollinations AI.
                              </p>
                            );
                          }
                          if (detailsUpper.includes('EMPTY TEXT RETURNED') || titleUpper.includes('DECOMPOSITION')) {
                            return (
                              <p className="text-zinc-200 leading-snug">
                                <strong className="text-blue-400">Gemini Text Model Backup Triggered:</strong> The primary model returned an empty string. The server fallback sequence automatically tried backup models (gemini-3.6-flash, 3.5-flash, 3.1-flash-lite) to extract story parts.
                              </p>
                            );
                          }
                          return (
                            <p className="text-zinc-300 leading-snug">
                              If this error persists, verify your Internet connectivity or API key configurations in Settings &gt; Secrets. You can also switch the active Image Engine or Sub-Model in the top header toolbar selector.
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <FLiteTextureModelCard 
        isOpen={showFLiteTextureModal} 
        onClose={() => setShowFLiteTextureModal(false)} 
      />
    </div>
  );
};
