import React, { useState } from 'react';
import { Sparkles, RefreshCw, Copy, Check, ExternalLink, Dices, X, Wand2, Terminal, ArrowRight } from 'lucide-react';
import { generateFromPerchance, inspectPerchanceGenerator } from '../services/perchance';
import { Language } from '../types';

interface PerchanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertPrompt?: (text: string) => void;
  language?: Language;
}

const PRESET_GENERATORS = [
  { name: 'animal-sentence', label: 'Animal Sentence', desc: 'Randomized animal stories & fun sentences' },
  { name: 'writing-prompt', label: 'Writing Prompt', desc: 'Creative writing starters & story seeds' },
  { name: 'character-idea', label: 'Character Idea', desc: 'Unique character archetypes and traits' },
  { name: 'superhero', label: 'Superhero Generator', desc: 'Comic book superhero titles and powers' },
  { name: 'fantasy-name', label: 'Fantasy Name', desc: 'Randomized magical fantasy character names' },
  { name: 'sci-fi-setting', label: 'Sci-Fi Setting', desc: 'Futuristic locations and atmospheric worlds' }
];

export const PerchanceModal: React.FC<PerchanceModalProps> = ({
  isOpen,
  onClose,
  onInsertPrompt,
  language = 'en'
}) => {
  const [generatorName, setGeneratorName] = useState('animal-sentence');
  const [listName, setListName] = useState('output');
  const [count, setCount] = useState(3);
  const [results, setResults] = useState<string[]>([]);
  const [availableLists, setAvailableLists] = useState<string[]>(['output']);
  const [loading, setLoading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInspect = async (name: string) => {
    setInspecting(true);
    setError(null);
    const info = await inspectPerchanceGenerator(name);
    setInspecting(false);

    if (info.success) {
      setAvailableLists(info.availableLists.length > 0 ? info.availableLists : ['output']);
      if (!info.availableLists.includes(listName)) {
        setListName(info.availableLists[0] || 'output');
      }
    } else {
      setError(info.error || 'Could not load generator metadata.');
    }
  };

  const handleGenerate = async () => {
    if (!generatorName.trim()) return;
    setLoading(true);
    setError(null);
    const data = await generateFromPerchance(generatorName.trim(), listName, count);
    setLoading(false);

    if (data.success) {
      setResults(data.results);
      if (data.availableLists && data.availableLists.length > 0) {
        setAvailableLists(data.availableLists);
      }
    } else {
      setError(data.error || 'Failed to generate output from Perchance');
    }
  };

  const handleSelectPreset = (name: string) => {
    setGeneratorName(name);
    setListName('output');
    handleInspect(name);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-500/20 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/30">
              <Dices className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                DIY Perchance Generator API
                <span className="px-2 py-0.5 text-[10px] font-mono bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 font-semibold">
                  JSDOM Runtime
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Run any Perchance generator live via JSDOM sandbox API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* Quick Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-purple-400" />
              Popular Perchance Generators:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_GENERATORS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p.name)}
                  className={`text-left p-2.5 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                    generatorName === p.name
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-900/20'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-bold text-purple-300 flex items-center justify-between">
                    {p.label}
                    {generatorName === p.name && <Sparkles className="w-3 h-3 text-purple-400" />}
                  </span>
                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-1">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Form */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Generator Name Input */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Perchance Generator URL ID
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-xs text-slate-500 font-mono">perchance.org/</span>
                  <input
                    type="text"
                    value={generatorName}
                    onChange={(e) => setGeneratorName(e.target.value)}
                    onBlur={() => generatorName.trim() && handleInspect(generatorName.trim())}
                    placeholder="e.g. animal-sentence"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-28 pr-3 py-1.5 text-xs text-white font-mono focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Target List Dropdown */}
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Target List / Property
                </label>
                <select
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-purple-300 font-mono focus:border-purple-500 focus:outline-none"
                >
                  {availableLists.map((l) => (
                    <option key={l} value={l}>
                      window.root.{l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Count:</label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'item' : 'items'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://perchance.org/${generatorName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Visit Perchance
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={handleGenerate}
                  disabled={loading || inspecting || !generatorName.trim()}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs rounded-lg shadow-lg shadow-purple-900/40 flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Evaluating JSDOM...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate Output
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs font-mono">
              ❌ {error}
            </div>
          )}

          {/* Results Output */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  Generated Perchance Outputs ({results.length}):
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  GET /api/perchance/generate?generator={generatorName}&list={listName}
                </span>
              </div>

              <div className="space-y-2">
                {results.map((resText, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950/80 border border-purple-500/20 rounded-xl flex items-start justify-between gap-3 group hover:border-purple-500/40 transition-colors"
                  >
                    <p className="text-xs text-purple-100 font-sans leading-relaxed whitespace-pre-wrap flex-1">
                      {resText}
                    </p>
                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(resText, idx)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedIndex === idx ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {onInsertPrompt && (
                        <button
                          onClick={() => {
                            onInsertPrompt(resText);
                            onClose();
                          }}
                          className="px-2 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
                          title="Insert into story prompt box"
                        >
                          Insert
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
