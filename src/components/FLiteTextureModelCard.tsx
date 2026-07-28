import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, Cpu, ExternalLink, Layers, Image as ImageIcon, Loader2 } from 'lucide-react';

interface FLiteTextureModelCardProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
}

export const FLiteTextureModelCard: React.FC<FLiteTextureModelCardProps> = ({ isOpen, onClose, language = 'en' }) => {
  const [prompt, setPrompt] = useState('Gritty, cracked dark concrete comic book wall with weathered moss and rain water stains');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isRTL = language === 'he';

  const samplePrompts = [
    "Gritty, cracked dark concrete comic book wall with weathered moss and rain water stains",
    "Vintage antique weathered parchment comic paper texture with old ink splashes and aged yellowed edges",
    "Futuristic sci-fi dark metallic superhero armor material with intricate glowing cybernetic circuits and carbon fiber mesh",
    "Vibrant pop-art comic book halftone Ben-Day dot matrix pattern with bold ink stippling and textured paper grain"
  ];

  const handleFetchTexture = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Texture generation failed');
      }

      const json = await response.json();
      setImageSrc(json.imageUrl);
    } catch (err: any) {
      console.error('F-Lite Texture fetch error:', err);
      setError(err?.message || 'Could not connect to the texture engine server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-zinc-900 border-4 border-amber-400 rounded-3xl shadow-[0_0_30px_rgba(251,191,36,0.2)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-white"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-black p-5 flex items-center justify-between border-b-4 border-black">
          <div className="flex items-center gap-3">
            <div className="bg-black text-amber-400 p-2.5 rounded-2xl font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <Layers size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-black/90 text-amber-300 text-[10px] font-mono font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  MODEL CARD
                </span>
                <span className="bg-emerald-950 text-emerald-300 text-[10px] font-mono font-black px-2 py-0.5 rounded-full border border-emerald-500/50">
                  100% FREE & SFW
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-black mt-0.5">
                Freepik / F-Lite-Texture Model Card
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors text-black"
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-200">

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-800/80 border-2 border-zinc-700 p-3 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-mono uppercase text-zinc-400">Parameters</span>
              <span className="text-lg font-black text-amber-400">10 Billion</span>
            </div>
            <div className="bg-zinc-800/80 border-2 border-zinc-700 p-3 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-mono uppercase text-zinc-400">License</span>
              <span className="text-sm font-black text-emerald-400 truncate" title="CreativeML Open RAIL-M">CreativeML RAIL-M</span>
            </div>
            <div className="bg-zinc-800/80 border-2 border-zinc-700 p-3 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-mono uppercase text-zinc-400">Developers</span>
              <span className="text-sm font-black text-sky-400">Freepik & Fal.ai</span>
            </div>
            <div className="bg-zinc-800/80 border-2 border-zinc-700 p-3 rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] font-mono uppercase text-zinc-400">Training Dataset</span>
              <span className="text-sm font-black text-purple-400">80M+ SFW Images</span>
            </div>
          </div>

          {/* Special Features & Highlights */}
          <div className="bg-zinc-800/50 border-2 border-amber-500/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-wide">
              <Sparkles size={18} />
              <h3>💡 What Makes F-Lite-Texture Special?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-zinc-900/90 border border-zinc-700 p-3 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <ShieldCheck size={16} />
                  <span>100% Copyright-Safe</span>
                </div>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Trained on Freepik's internal database of over 80 million legally compliant SFW images. Outputs can be used commercially with zero copyright risks.
                </p>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-700 p-3 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Layers size={16} />
                  <span>Enhanced Surface Detail</span>
                </div>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Optimized to produce rich graphic textures, material depth, hyper-detailed surface aesthetics, and complex comic backdrop materials.
                </p>
              </div>

              <div className="bg-zinc-900/90 border border-zinc-700 p-3 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                  <Cpu size={16} />
                  <span>Permissive Licensing</span>
                </div>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Open-source model weights available under CreativeML Open RAIL-M license for local deployment, commercial apps, and custom finetunes.
                </p>
              </div>
            </div>
          </div>

          {/* Usage Rules */}
          <div className="bg-rose-950/40 border-2 border-rose-500/50 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-300 font-black uppercase text-sm">
              <AlertTriangle size={18} />
              <h3>⚠️ Important Usage Rules from the Model Card</h3>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <li className="bg-zinc-900/90 border border-rose-500/30 p-3 rounded-xl space-y-1">
                <strong className="text-rose-200 block font-black">✍️ Write Long Prompts</strong>
                <p className="text-zinc-300 text-[11px]">Performs poorly with short keywords. Provide descriptive, highly detailed sentences for clean imagery.</p>
              </li>
              <li className="bg-zinc-900/90 border border-rose-500/30 p-3 rounded-xl space-y-1">
                <strong className="text-rose-200 block font-black">🚫 Bad for Vector Graphics</strong>
                <p className="text-zinc-300 text-[11px]">Struggles with flat vector graphics or clean logos. Stick to rich illustrations and photographic surfaces.</p>
              </li>
              <li className="bg-zinc-900/90 border border-rose-500/30 p-3 rounded-xl space-y-1">
                <strong className="text-rose-200 block font-black">📐 Aim Above 1 Megapixel</strong>
                <p className="text-zinc-300 text-[11px]">Low-resolution canvas sizes cause severe malformations. Render at 1024x1024 or higher for crisp textures.</p>
              </li>
            </ul>
          </div>

          {/* Interactive Texture Generator Sandbox */}
          <div className="bg-amber-400 text-black rounded-2xl p-5 space-y-4 shadow-lg border-2 border-black">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon size={20} className="text-black" />
                <h3 className="font-black uppercase text-base tracking-tight italic">
                  🎨 Interactive F-Lite Texture Asset Generator
                </h3>
              </div>
              <a 
                href="https://huggingface.co/Freepik/F-Lite-Texture" 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-black text-amber-300 px-2.5 py-1 rounded-full hover:bg-zinc-800 transition-colors"
              >
                <span>HF Model Card</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Prompt Selector / Input */}
            <form onSubmit={handleFetchTexture} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-black/80">
                  Select Sample Texture Prompt or Custom Description:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {samplePrompts.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(p)}
                      className="text-[10px] font-mono bg-black/10 hover:bg-black/20 text-black border border-black/30 px-2.5 py-1 rounded-lg transition-all text-left truncate max-w-full"
                    >
                      {p.substring(0, 45)}...
                    </button>
                  ))}
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-white text-black font-medium text-xs p-3 rounded-xl border-2 border-black shadow-inner focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Describe comic background scene or surface texture..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-amber-300 hover:bg-zinc-900 p-3 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-[3px_3px_0px_0px_rgba(255,255,255,0.4)] active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-amber-400" />
                    <span>Processing Textures via Freepik/F-Lite-Texture (10B)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Texture Canvas</span>
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="p-3 bg-rose-900 text-rose-100 border-2 border-black rounded-xl text-xs font-bold">
                ⚠️ {error}
              </div>
            )}

            {imageSrc && (
              <div className="space-y-2 bg-black p-3 rounded-2xl border-2 border-black">
                <div className="flex items-center justify-between text-amber-400 text-xs font-mono font-bold">
                  <span>Generated Texture Canvas Output:</span>
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/40">
                    Freepik/F-Lite-Texture
                  </span>
                </div>
                <div className="aspect-square w-full rounded-xl overflow-hidden border-2 border-amber-400 bg-zinc-900">
                  <img src={imageSrc} alt="Generated F-Lite Texture" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t-2 border-zinc-800 flex justify-between items-center text-xs text-zinc-400 font-mono">
          <span>CreativeML Open RAIL-M License • SFW 80M+ Dataset</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold uppercase transition-colors"
          >
            Close Card
          </button>
        </div>
      </motion.div>
    </div>
  );
};
