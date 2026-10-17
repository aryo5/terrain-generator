import React from 'react';
import { X, Sparkles, Zap, ShieldCheck, Check, Sliders, Waves, Sun, Eye } from 'lucide-react';
import { GraphicsPreset } from '../types';

interface GraphicsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: GraphicsPreset;
  onSelectPreset: (preset: GraphicsPreset) => void;
  currentFps?: number;
}

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({
  isOpen,
  onClose,
  currentPreset,
  onSelectPreset,
  currentFps = 60,
}) => {
  if (!isOpen) return null;

  const presets: {
    id: GraphicsPreset;
    name: string;
    badge: string;
    badgeColor: string;
    description: string;
    specs: { label: string; value: string; isPro?: boolean }[];
    recommended?: boolean;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'LOW',
      name: 'LOW',
      badge: 'Hemat Baterai & Max FPS',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      description: 'Menonaktifkan efek berat untuk frame rate paling stabil pada perangkat ringan.',
      icon: <Zap className="w-5 h-5 text-emerald-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: 'Mati (Disabled)' },
        { label: 'Resolusi Layar', value: '1.0x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'Mati (Disabled)' },
        { label: 'Animasi Air', value: 'Statis (Hemat GPU)' },
      ],
    },
    {
      id: 'MEDIUM',
      name: 'MEDIUM',
      badge: 'Default & Direkomendasikan',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      description: 'Pengaturan standar optimal. Grafis indah berdimensi dengan performa stabil 40-60 FPS.',
      recommended: true,
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: '512×512 Soft Shadows' },
        { label: 'Resolusi Layar', value: '1.25x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'FogExp2 Halus Aktif' },
        { label: 'Animasi Air', value: 'Zero-CPU Bobbing' },
      ],
    },
    {
      id: 'HIGH',
      name: 'HIGH',
      badge: 'Visual Sinematik',
      badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      description: 'Kualitas grafis maksimal dengan ombak air low-poly dan bayangan tajam beresolusi tinggi.',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: '1024×1024 High-Res' },
        { label: 'Resolusi Layar', value: '1.5x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'FogExp2 Penuh Berwarna' },
        { label: 'Animasi Air', value: 'Ombak Sinusoide Low-Poly' },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="graphics-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 id="graphics-settings-title" className="text-sm sm:text-base font-bold text-white tracking-wide">
                Pengatur Grafis (Graphics Settings)
              </h2>
              <p className="text-[11px] text-slate-400">
                Pilih profil visual yang sesuai dengan kenyamanan dan performa perangkat Anda
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{currentFps > 0 ? `${currentFps} FPS` : '60 FPS'}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal pengatur grafis"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Presets List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {presets.map((p) => {
              const isSelected = currentPreset === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPreset(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPreset(p.id);
                    }
                  }}
                  className={`relative flex flex-col justify-between p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 select-none ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-800/40 border-slate-700/70 hover:border-slate-600 hover:bg-slate-800/60'
                  }`}
                >
                  {/* Top Row: Icon + Preset Name + Recommended Tag */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                          {p.icon}
                        </div>
                        <span className="font-bold text-base text-white">{p.name}</span>
                      </div>
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : p.recommended ? (
                        <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Default
                        </span>
                      ) : null}
                    </div>

                    <div className="mb-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-block ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                      {p.description}
                    </p>
                  </div>

                  {/* Specs Breakdown */}
                  <div className="pt-3 border-t border-slate-700/60 space-y-1.5 text-[10px] sm:text-[11px]">
                    {p.specs.map((spec, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">{spec.label}:</span>
                        <span className="font-semibold text-slate-200 text-right">{spec.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Select button action */}
                  <div className="mt-4 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPreset(p.id);
                      }}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                          : 'bg-slate-700/60 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isSelected ? '✓ Aktif' : `Pilih ${p.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visual Details Infobox */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-400 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Detail Peningkatan Visual (Visual Polish)</span>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-slate-200">FogExp2 Atmosfir:</strong> Kabut lembut menyatu secara mulus dengan warna horizon langit, memberikan kedalaman ruang 3D alami.
              </li>
              <li>
                <strong className="text-slate-200">Directional Light Hangat:</strong> Sudut sinar matahari diarahkan bersudut dimensional, memunculkan bayangan faset low-poly yang estetis dan dramatis.
              </li>
              <li>
                <strong className="text-slate-200">Animasi Ombak Sinusoide:</strong> Pada preset HIGH, permukaan air bergerak dinamis bergelombang dengan pantulan cahaya berkilau.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs">
          <span className="text-slate-400">
            Preset aktif saat ini:{' '}
            <strong className="text-emerald-400 font-bold">{currentPreset}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors shadow-lg shadow-emerald-600/20"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
