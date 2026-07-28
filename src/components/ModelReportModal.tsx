import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, RefreshCw, BarChart2, User, LayoutGrid, CheckCircle2, AlertTriangle, Layers, Cpu, Sparkles } from 'lucide-react';
import { ALL_MODELS } from '../config/models';

interface ModelReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFLiteCard?: () => void;
  language?: string;
}

interface SummaryData {
  summaryReport: {
    totalGenerations: number;
    avatarSummary: {
      totalAvatarsGenerated: number;
      modelsUsedBreakdown: Record<string, number>;
    };
    comicPagesAndPanelsSummary: {
      totalPanelsGenerated: number;
      modelsUsedBreakdown: Record<string, number>;
    };
  };
  generationHistory: Array<{
    id: string;
    timestamp: string;
    category: 'avatar' | 'panel';
    titleOrPrompt: string;
    requestedEngine: string;
    modelUsed: string;
    status: 'success' | 'fallback';
  }>;
}

export const ModelReportModal: React.FC<ModelReportModalProps> = ({ isOpen, onClose, onOpenFLiteCard, language = 'en' }) => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/model-usage-summary');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Failed to load model usage report:', err);
      setError(err?.message || 'Failed to fetch model summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSummary();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isRTL = language === 'he';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border-4 border-black rounded-3xl shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-black"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header Bar */}
        <div className="bg-black text-white p-5 flex items-center justify-between border-b-4 border-black">
          <div className="flex items-center gap-3">
            <div className="bg-accent text-black p-2 rounded-xl font-bold">
              <BarChart2 size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight">
                {isRTL ? "דוח שימוש במודלים - AI Models Usage Report" : "AI Models Usage Report"}
              </h2>
              <p className="text-xs text-white/70 font-mono">
                {isRTL ? "סיכום מפורט של כל המודלים ששימשו ליצירת אווטארים ועמודי קומיקס" : "Live breakdown of models used for avatars, portraits & comic pages"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Refresh Action Bar */}
          <div className="flex justify-between items-center bg-zinc-100 border-2 border-black p-3.5 rounded-2xl">
            <div className="flex items-center gap-2 font-mono text-xs font-bold">
              <Layers size={16} className="text-amber-600" />
              <span>
                {isRTL ? "סך הכל מחוללים שתועדו:" : "Total Generations Recorded:"}{' '}
                <strong className="text-black text-sm">{data?.summaryReport?.totalGenerations || 0}</strong>
              </span>
            </div>
            <button
              onClick={fetchSummary}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white hover:bg-zinc-800 rounded-xl text-xs font-bold uppercase transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>{isRTL ? "רענן דוח" : "Refresh Data"}</span>
            </button>
          </div>

          {error && (
            <div className="p-4 bg-rose-100 border-2 border-rose-500 rounded-2xl text-rose-800 text-xs font-bold">
              ⚠️ {error}
            </div>
          )}

          {/* Breakdown Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Avatars & Portraits Card */}
            <div className="border-3 border-black rounded-2xl p-4 bg-amber-50/50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
              <div className="flex items-center gap-2 border-b-2 border-black/10 pb-2">
                <User size={18} className="text-amber-700" />
                <h3 className="font-black uppercase text-sm italic">
                  {isRTL ? "אווטארים ופורטרטים של דמויות" : "Character Avatars & Portraits"}
                </h3>
              </div>
              <div className="text-xs space-y-2">
                <p className="font-bold text-zinc-600">
                  {isRTL ? "סך הכל אבטארים נוצרו:" : "Total Avatars Generated:"}{' '}
                  <span className="text-black font-black text-sm">{data?.summaryReport?.avatarSummary?.totalAvatarsGenerated || 0}</span>
                </p>
                <div className="space-y-1.5 pt-1">
                  {Object.entries(data?.summaryReport?.avatarSummary?.modelsUsedBreakdown || {}).length === 0 ? (
                    <p className="text-zinc-500 italic text-[11px]">{isRTL ? "טרם נוצרו אווטארים" : "No avatars generated yet."}</p>
                  ) : (
                    Object.entries(data?.summaryReport?.avatarSummary?.modelsUsedBreakdown || {}).map(([model, count]) => (
                      <div key={model} className="flex justify-between items-center bg-white border border-black/20 p-2 rounded-xl text-[11px] font-mono font-bold">
                        <span className="truncate max-w-[200px]" title={model}>• {model}</span>
                        <span className="bg-amber-400 text-black px-2 py-0.5 rounded-full border border-black text-[10px] shrink-0">
                          {count} {isRTL ? "יחידות" : "used"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Comic Pages / Panels Card */}
            <div className="border-3 border-black rounded-2xl p-4 bg-blue-50/50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
              <div className="flex items-center gap-2 border-b-2 border-black/10 pb-2">
                <LayoutGrid size={18} className="text-blue-700" />
                <h3 className="font-black uppercase text-sm italic">
                  {isRTL ? "עמודי ופאנלי קומיקס" : "Comic Pages & Panels"}
                </h3>
              </div>
              <div className="text-xs space-y-2">
                <p className="font-bold text-zinc-600">
                  {isRTL ? "סך הכל פאנלים נוצרו:" : "Total Panels Generated:"}{' '}
                  <span className="text-black font-black text-sm">{data?.summaryReport?.comicPagesAndPanelsSummary?.totalPanelsGenerated || 0}</span>
                </p>
                <div className="space-y-1.5 pt-1">
                  {Object.entries(data?.summaryReport?.comicPagesAndPanelsSummary?.modelsUsedBreakdown || {}).length === 0 ? (
                    <p className="text-zinc-500 italic text-[11px]">{isRTL ? "טרם נוצרו פאנלי קומיקס" : "No comic panels generated yet."}</p>
                  ) : (
                    Object.entries(data?.summaryReport?.comicPagesAndPanelsSummary?.modelsUsedBreakdown || {}).map(([model, count]) => (
                      <div key={model} className="flex justify-between items-center bg-white border border-black/20 p-2 rounded-xl text-[11px] font-mono font-bold">
                        <span className="truncate max-w-[200px]" title={model}>• {model}</span>
                        <span className="bg-blue-400 text-white px-2 py-0.5 rounded-full border border-black text-[10px] shrink-0">
                          {count} {isRTL ? "יחידות" : "used"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Spotlight Model Card: Freepik / F-Lite-Texture */}
          <div className="bg-amber-400 border-3 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-black">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-black text-amber-300 text-[9px] font-mono font-black px-2 py-0.5 rounded-full uppercase">
                  FEATURED MODEL
                </span>
                <span className="bg-emerald-900 text-emerald-200 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border border-black">
                  100% SFW & COPYRIGHT-SAFE
                </span>
              </div>
              <h4 className="font-black text-base uppercase tracking-tight italic">
                Freepik / F-Lite-Texture (10B Parameters)
              </h4>
              <p className="text-xs font-medium leading-snug max-w-xl">
                Open-source diffusion model by Freepik & Fal.ai trained on 80M+ legally compliant SFW images. CreativeML Open RAIL-M license.
              </p>
            </div>
            {onOpenFLiteCard && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFLiteCard();
                }}
                className="shrink-0 px-4 py-2 bg-black text-amber-300 hover:bg-zinc-800 rounded-xl font-black uppercase text-xs transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,0.4)] active:translate-y-0.5 cursor-pointer"
              >
                Inspect F-Lite Model Card
              </button>
            )}
          </div>

          {/* Deployed System Models Overview */}
          <div className="space-y-3 pt-2">
            <h3 className="font-black uppercase text-sm italic flex items-center gap-2">
              <Cpu size={18} className="text-purple-600" />
              <span>{isRTL ? "מודלים מוגדרים במערכת (Configuration Overview)" : "Deployed System Models Catalog"}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_MODELS.map((model) => (
                <div key={model.id} className="border-2 border-black/20 rounded-xl p-3 bg-zinc-50 hover:bg-white hover:border-black transition-all text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-black font-mono text-[11px] truncate" title={model.id}>{model.name}</span>
                    <span className="bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded-full text-[9px] uppercase font-mono font-black shrink-0">
                      {model.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 line-clamp-2">{model.description}</p>
                  <div className="flex items-center gap-1.5 pt-1 text-[10px] text-zinc-500 font-mono">
                    <Sparkles size={12} className="text-amber-500 shrink-0" />
                    <span className="truncate">{model.strengths}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Generation Log Table */}
          <div className="space-y-3 pt-2">
            <h3 className="font-black uppercase text-sm italic flex items-center gap-2">
              <span>📋</span> {isRTL ? "יומן היסטוריית מחולל AI לפרטים" : "Detailed AI Generation History Log"}
            </h3>

            {(!data?.generationHistory || data.generationHistory.length === 0) ? (
              <div className="border-2 border-dashed border-black/20 p-6 text-center text-zinc-500 text-xs font-bold rounded-2xl">
                {isRTL ? "אין עדיין היסטוריית יצירה. צור אווטאר או קומיקס כדי לראות את המודלים בפעולה!" : "No generation history yet. Create an avatar or comic book to log model usage!"}
              </div>
            ) : (
              <div className="border-2 border-black rounded-2xl overflow-hidden text-xs">
                <div className="max-h-60 overflow-y-auto divide-y-2 divide-black/10">
                  <table className="w-full text-left font-mono">
                    <thead className="bg-black text-white sticky top-0 font-sans text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5">{isRTL ? "זמן" : "Time"}</th>
                        <th className="p-2.5">{isRTL ? "סוג" : "Type"}</th>
                        <th className="p-2.5">{isRTL ? "תיאור/כותרת" : "Prompt / Title"}</th>
                        <th className="p-2.5">{isRTL ? "מודל בפועל" : "Model Used"}</th>
                        <th className="p-2.5 text-center">{isRTL ? "סטטוס" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 bg-white">
                      {data.generationHistory.slice().reverse().map((rec) => (
                        <tr key={rec.id} className="hover:bg-zinc-50">
                          <td className="p-2.5 whitespace-nowrap opacity-70 text-[10px]">{rec.timestamp}</td>
                          <td className="p-2.5 font-bold uppercase text-[10px]">
                            <span className={`px-2 py-0.5 rounded border border-black ${rec.category === 'avatar' ? 'bg-amber-200' : 'bg-blue-200'}`}>
                              {rec.category}
                            </span>
                          </td>
                          <td className="p-2.5 font-sans truncate max-w-[180px]" title={rec.titleOrPrompt}>
                            {rec.titleOrPrompt}
                          </td>
                          <td className="p-2.5 font-bold text-emerald-800 text-[11px]">
                            {rec.modelUsed}
                          </td>
                          <td className="p-2.5 text-center">
                            {rec.status === 'success' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                                <CheckCircle2 size={12} /> OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-[10px]">
                                <AlertTriangle size={12} /> Err
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-100 border-t-4 border-black flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-black text-white hover:bg-zinc-800 rounded-2xl text-xs font-black uppercase transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          >
            {isRTL ? "סגור דוח" : "Close Report"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
