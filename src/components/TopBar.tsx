import React from 'react';
import {
  Compass,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Zap,
  Undo2,
  Redo2,
  Eye,
  Camera,
} from 'lucide-react';
import { BiomeType, PerformanceMode, TimeOfDay } from '../types';

interface TopBarProps {
  seed: number;
  biome: BiomeType;
  objectCount: number;
  timeOfDay: TimeOfDay;
  onTimeOfDayChange: (t: TimeOfDay) => void;
  onCameraPreset: (preset: 'iso' | 'top' | 'cinematic' | 'reset') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDockCollapsed: boolean;
  onToggleDock: () => void;
  fps: number;
  performanceMode: PerformanceMode;
  onCyclePerformanceMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  seed,
  biome,
  objectCount,
  timeOfDay,
  onTimeOfDayChange,
  onCameraPreset,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDockCollapsed,
  onToggleDock,
  fps,
  performanceMode,
  onCyclePerformanceMode,
}) => {
  const perfBadgeColor =
    performanceMode === 'mobile'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : performanceMode === 'balanced'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-purple-500/20 text-purple-300 border-purple-500/40';

  const perfLabel =
    performanceMode === 'mobile'
      ? 'Mobile ⚡'
      : performanceMode === 'balanced'
      ? 'Balanced ⚖️'
      : 'Ultra ✨';

  return (
    <header className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between pointer-events-none z-20 gap-2">
      {/* Brand & Stats Spec Badge */}
      <div className="flex items-center gap-2 sm:gap-3 bg-slate-900/95 border border-slate-700/60 text-slate-100 rounded-xl px-2.5 sm:px-4 py-1.5 sm:py-2 pointer-events-auto shadow-xl">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
          <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-xs sm:text-sm tracking-wide text-white whitespace-nowrap">TerraForge 3D</h1>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {biome}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-mono">
            <span>#{seed}</span>
            <span>•</span>
            <span>{objectCount} objs</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">{fps > 0 ? `${fps} FPS` : '60 FPS'}</span>
          </div>
        </div>
      </div>

      {/* Mobile Performance Toggle Button */}
      <div className="flex items-center gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={onCyclePerformanceMode}
          className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-colors shadow-lg ${perfBadgeColor} bg-slate-900/90 hover:bg-slate-800`}
          title={`Performance mode: ${performanceMode}. Click to switch between Mobile (Ultra-fast), Balanced, and Ultra`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden xs:inline">{perfLabel}</span>
          <span className="xs:hidden">{performanceMode.toUpperCase().slice(0, 3)}</span>
        </button>
      </div>

      {/* Center Camera & Time of Day Controls */}
      <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 rounded-xl px-3 py-1.5 pointer-events-auto shadow-xl">
        {/* Undo / Redo */}
        <div className="flex items-center border-r border-slate-700/80 pr-2 mr-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo last action"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo action"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Presets */}
        <div className="flex items-center gap-1 border-r border-slate-700/80 pr-2 mr-1">
          <span className="text-[11px] text-slate-400 font-medium px-1 flex items-center gap-1">
            <Camera className="w-3.5 h-3.5" /> Cam:
          </span>
          <button
            type="button"
            onClick={() => onCameraPreset('iso')}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Isometric 45° Angle"
          >
            Iso
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('top')}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Top-Down Map View"
          >
            Top
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('cinematic')}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Ground Horizon View"
          >
            Cine
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('reset')}
            aria-label="Reset Camera View"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lighting / Atmosphere */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-400 font-medium px-1">Atmosphere:</span>
          <button
            type="button"
            onClick={() => onTimeOfDayChange('day')}
            className={`p-1.5 rounded transition-colors ${
              timeOfDay === 'day' ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:text-white'
            }`}
            title="Daylight"
            aria-label="Daylight atmosphere"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeOfDayChange('golden')}
            className={`p-1.5 rounded transition-colors ${
              timeOfDay === 'golden' ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:text-white'
            }`}
            title="Golden Hour"
            aria-label="Golden Hour atmosphere"
          >
            <Sunrise className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeOfDayChange('sunset')}
            className={`p-1.5 rounded transition-colors ${
              timeOfDay === 'sunset' ? 'bg-rose-500/30 text-rose-300' : 'text-slate-400 hover:text-white'
            }`}
            title="Sunset Dusk"
            aria-label="Sunset atmosphere"
          >
            <Sunset className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeOfDayChange('cyberpunk')}
            className={`p-1.5 rounded transition-colors ${
              timeOfDay === 'cyberpunk' ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
            title="Cyber Neon Night"
            aria-label="Cyberpunk atmosphere"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeOfDayChange('night')}
            className={`p-1.5 rounded transition-colors ${
              timeOfDay === 'night' ? 'bg-indigo-500/30 text-indigo-300' : 'text-slate-400 hover:text-white'
            }`}
            title="Midnight"
            aria-label="Midnight atmosphere"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Zen Mode / Toggle HUD Button */}
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={onToggleDock}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors shadow-xl"
          title={isDockCollapsed ? 'Show UI Dock (H)' : 'Hide UI Dock (Zen Mode - H)'}
        >
          <Eye className="w-4 h-4 text-emerald-400" />
          <span>{isDockCollapsed ? 'Show Dock' : 'Zen View'}</span>
        </button>
      </div>
    </header>
  );
};
