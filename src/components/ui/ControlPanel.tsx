// src/components/ui/ControlPanel.tsx
// 【清理版】移除了 Seal Image Upload, Presets

import React, { useEffect, useRef, useState } from 'react'; 
import { useAppStore } from '../../store/useAppStore';
import { midiService } from '../../services/midiService';
import { subscribeRealtimeClock } from '../../utils/realtimeClock';
import { getSharedCameraVideo, switchSharedCamera } from '../../utils/cameraService';

// 本地定义类型
type EffectType = 'None' | 'SimpleGlitch' | 'AnalogGlitch' | 'Particles' | 'Flash' | 'FaceParticles';
type HandSide = 'Left' | 'Right';

interface MidiMapping {
  id: string; hand: HandSide | 'Global'; parameter: string; cc: number; channel: number; label: string; min: number; max: number;
}
interface MidiDevice { id: string; name: string; }
interface DiagnosticsSnapshot {
  cameraWidth: number;
  cameraHeight: number;
  cameraFps: number;
  detectionFps: number;
  detectionMs: number;
  loopMode: string;
  dataAgeMs: number;
  leftPresent: number;
  rightPresent: number;
  bothPresent: number;
}

const SOURCES = [
    'None',
    'L-Dist', 'L-Rot', 'L-Sprd', 'L-G1', 'L-G2', 'L-G3',
    'R-Dist', 'R-Rot', 'R-Sprd', 'R-G1', 'R-G2', 'R-G3',
    'G-T.Dist', 'G-I.Dist', 'G-Seal',
    'G-L.Pres', 'G-R.Pres', 'G-Both'
];

const DEFAULT_MAPPINGS: MidiMapping[] = [
  { id: 'l-dist', hand: 'Left', parameter: 'distance', cc: 1, channel: 1, label: 'Dist', min: 0, max: 127 },
  { id: 'l-rot', hand: 'Left', parameter: 'rotation', cc: 2, channel: 1, label: 'Rot', min: 0, max: 127 },
  { id: 'l-spr', hand: 'Left', parameter: 'spread', cc: 3, channel: 1, label: 'Sprd', min: 0, max: 127 },
  { id: 'l-g1', hand: 'Left', parameter: 'gap1', cc: 5, channel: 1, label: 'G1', min: 0, max: 127 },
  { id: 'l-g2', hand: 'Left', parameter: 'gap2', cc: 6, channel: 1, label: 'G2', min: 0, max: 127 },
  { id: 'l-g3', hand: 'Left', parameter: 'gap3', cc: 7, channel: 1, label: 'G3', min: 0, max: 127 },
  { id: 'r-dist', hand: 'Right', parameter: 'distance', cc: 11, channel: 1, label: 'Dist', min: 0, max: 127 },
  { id: 'r-rot', hand: 'Right', parameter: 'rotation', cc: 12, channel: 1, label: 'Rot', min: 0, max: 127 },
  { id: 'r-spr', hand: 'Right', parameter: 'spread', cc: 13, channel: 1, label: 'Sprd', min: 0, max: 127 },
  { id: 'r-g1', hand: 'Right', parameter: 'gap1', cc: 15, channel: 1, label: 'G1', min: 0, max: 127 },
  { id: 'r-g2', hand: 'Right', parameter: 'gap2', cc: 16, channel: 1, label: 'G2', min: 0, max: 127 },
  { id: 'r-g3', hand: 'Right', parameter: 'gap3', cc: 17, channel: 1, label: 'G3', min: 0, max: 127 },
  { id: 'g-tdist', hand: 'Global', parameter: 'thumbsDist', cc: 20, channel: 1, label: 'T.Dst', min: 0, max: 127 },
  { id: 'g-idist', hand: 'Global', parameter: 'indexDist', cc: 21, channel: 1, label: 'I.Dst', min: 0, max: 127 },
  { id: 'g-seal', hand: 'Global', parameter: 'sealSize', cc: 22, channel: 1, label: 'W.Dst', min: 0, max: 127 },
  { id: 'g-lpres', hand: 'Global', parameter: 'leftPresent', cc: 23, channel: 1, label: 'L.Pre', min: 0, max: 127 },
  { id: 'g-rpres', hand: 'Global', parameter: 'rightPresent', cc: 24, channel: 1, label: 'R.Pre', min: 0, max: 127 },
  { id: 'g-both', hand: 'Global', parameter: 'bothPresent', cc: 25, channel: 1, label: 'Both', min: 0, max: 127 },
];

const MIDI_POLL_INTERVAL_MS = 33;
const DIAGNOSTICS_POLL_INTERVAL_MS = 250;

const getMappingValue = (mapping: MidiMapping, data: any) => {
  if (mapping.hand === 'Global') {
    return data[mapping.parameter] || 0;
  }

  const handObj = mapping.hand === 'Left' ? data.left : data.right;
  return handObj ? handObj[mapping.parameter] || 0 : 0;
};

const getMidiValue = (mapping: MidiMapping, val: number) => {
  return Math.floor(mapping.min + (val * (mapping.max - mapping.min)));
};

// CompactMappingRow 组件保持不变
const CompactMappingRow = ({ mapping, isSolo, onToggleSolo, value }: any) => {
  const midiVal = getMidiValue(mapping, value);

  return (
    <div className="flex items-center gap-1 mb-1 h-5 group w-full">
      <div className="w-8 text-[9px] text-right font-mono text-slate-400 group-hover:text-slate-100 uppercase truncate leading-none">{mapping.label}</div>
      <div className="flex-1 h-full bg-slate-950/55 relative rounded-sm overflow-hidden border border-slate-200/10">
        <div className={`absolute top-0 bottom-0 left-0 transition-all duration-75 ease-out ${isSolo ? 'bg-cyan-200' : 'bg-slate-200/35'}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
        <div className="absolute inset-0 flex items-center justify-start px-1"><span className="text-[8px] font-mono text-white mix-blend-difference font-bold">{midiVal}</span></div>
      </div>
      <button onClick={() => onToggleSolo(mapping.id)} className={`w-4 h-4 flex items-center justify-center rounded border text-[8px] font-bold transition-colors ${isSolo ? ACTIVE_CHROME : INACTIVE_CHROME}`} title="Solo / Map">S</button>
    </div>
  );
};

const EFFECT_TYPES: EffectType[] = ['None', 'SimpleGlitch', 'AnalogGlitch', 'Particles', 'FaceParticles', 'Flash'];
const GLASS_PANEL = 'bg-slate-950/55 backdrop-blur-xl border border-slate-200/10 shadow-[0_18px_60px_rgba(3,7,18,0.45)]';
const CONTROL_FIELD = 'bg-slate-950/60 border border-slate-200/10 text-slate-100 shadow-inner shadow-black/30 focus:border-cyan-200/50 focus:outline-none';
const ACTIVE_CHROME = 'bg-cyan-200/12 text-cyan-50 border-cyan-100/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_20px_rgba(103,232,249,0.16)]';
const INACTIVE_CHROME = 'border-slate-200/10 text-slate-300/70 hover:border-cyan-200/30 hover:bg-cyan-200/10 hover:text-slate-100';

const DiagnosticsPanel = ({ data }: { data: DiagnosticsSnapshot }) => {
  const fmt = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0.0';

  return (
    <div className={`absolute top-16 left-1/2 -translate-x-1/2 w-64 ${GLASS_PANEL} rounded-md p-2 z-50 pointer-events-none font-mono`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-cyan-100 font-black tracking-[0.18em]">DIAGNOSTICS</span>
        <span className="text-[8px] text-slate-400">{data.loopMode}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-300/75">
        <span>CAM RES</span><span className="text-right text-slate-50">{data.cameraWidth}x{data.cameraHeight}</span>
        <span>CAM FPS</span><span className="text-right text-slate-50">{fmt(data.cameraFps)}</span>
        <span>DETECT FPS</span><span className="text-right text-slate-50">{fmt(data.detectionFps)}</span>
        <span>DETECT MS</span><span className="text-right text-slate-50">{fmt(data.detectionMs, 2)}</span>
        <span>DATA AGE</span><span className="text-right text-slate-50">{fmt(data.dataAgeMs, 0)} ms</span>
        <span>HANDS</span><span className="text-right text-slate-50">L{data.leftPresent} R{data.rightPresent} B{data.bothPresent}</span>
      </div>
      <div className="mt-2 text-[8px] text-slate-400/80 leading-tight">
        DATA AGE 是网页内部识别数据的新鲜度，不等于真实摄像头物理延迟。
      </div>
    </div>
  );
};

export const ControlPanel: React.FC = () => {
  const {
    mode, setMode, addVideoClip, videoClips, selectVideoClip, activeClipId, removeVideoClip,
    visualConfig, setVisualConfig,
    updateSlot, updateSlotParams, activeSlotIndex, setActiveSlotIndex,
    // 【清理】移除了 loadPreset, savePreset, setSealImage, sealImage
  } = useAppStore();

  const [muted, setMuted] = useState({ left: false, right: false });
  const [showSettings, setShowSettings] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>('all');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isLoadingCameras, setIsLoadingCameras] = useState(true);
  const [soloMappingId, setSoloMappingId] = useState<string>('');
  const [midiValues, setMidiValues] = useState<Record<string, number>>({});
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot>({
      cameraWidth: 0,
      cameraHeight: 0,
      cameraFps: 0,
      detectionFps: 0,
      detectionMs: 0,
      loopMode: 'idle',
      dataAgeMs: 0,
      leftPresent: 0,
      rightPresent: 0,
      bothPresent: 0
  });
  const lastMidiValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
      let isCancelled = false;

      const getCameras = async () => {
        try {
            await getSharedCameraVideo().catch(error => {
                console.warn('Camera permission or initial video failed before device enumeration.', error);
            });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videos = devices.filter(d => d.kind === 'videoinput');
            if (isCancelled) return;

            setVideoDevices(videos);
            if(videos.length > 0 && !selectedCameraId) setSelectedCameraId(videos[0].deviceId);
        } catch(e) { console.error(e); }
        finally {
            if (!isCancelled) setIsLoadingCameras(false);
        }
      };

      getCameras();
      navigator.mediaDevices?.addEventListener?.('devicechange', getCameras);
      midiService.initialize().then(() => { midiService.onStateChange(setMidiDevices); });

      return () => {
          isCancelled = true;
          navigator.mediaDevices?.removeEventListener?.('devicechange', getCameras);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
      if (!visualConfig.showMidiPanel) return;

      lastMidiValuesRef.current = {};

      const loop = () => {
          const data = useAppStore.getState().handDataRef.current;
          const nextValues: Record<string, number> = {};

          DEFAULT_MAPPINGS.forEach(mapping => {
              const val = getMappingValue(mapping, data);
              nextValues[mapping.id] = val;

              const isMuted = mapping.hand === 'Left' ? muted.left : mapping.hand === 'Right' ? muted.right : false;
              const isSolo = soloMappingId === mapping.id;
              const shouldSend = !isMuted && (!soloMappingId || isSolo);
              const midiVal = getMidiValue(mapping, val);

              if (shouldSend && midiVal !== lastMidiValuesRef.current[mapping.id]) {
                  midiService.sendControlChange(selectedMidiDevice, mapping.channel, mapping.cc, midiVal);
                  lastMidiValuesRef.current[mapping.id] = midiVal;
              }
          });

          if (document.visibilityState === 'visible') {
              setMidiValues(nextValues);
          }
      };

      loop();
      return subscribeRealtimeClock(MIDI_POLL_INTERVAL_MS, loop);
  }, [muted.left, muted.right, selectedMidiDevice, soloMappingId, visualConfig.showMidiPanel]);

  useEffect(() => {
      if (!showDiagnostics) return;

      const updateDiagnostics = () => {
          const data = useAppStore.getState().handDataRef.current;
          setDiagnostics({
              cameraWidth: data.diagnostics.cameraWidth,
              cameraHeight: data.diagnostics.cameraHeight,
              cameraFps: data.diagnostics.cameraFps,
              detectionFps: data.diagnostics.detectionFps,
              detectionMs: data.diagnostics.detectionMs,
              loopMode: data.diagnostics.loopMode,
              dataAgeMs: data.lastUpdated ? Math.max(0, performance.now() - data.lastUpdated) : 0,
              leftPresent: data.leftPresent,
              rightPresent: data.rightPresent,
              bothPresent: data.bothPresent
          });
      };

      updateDiagnostics();
      const intervalId = window.setInterval(updateDiagnostics, DIAGNOSTICS_POLL_INTERVAL_MS);
      return () => window.clearInterval(intervalId);
  }, [showDiagnostics]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { addVideoClip(e.target.files[0]); setMode('VJ_MODE'); }
  };

  // 【清理】移除了 handleSealUpload 函数

  const handleToggleSolo = (id: string) => {
      setSoloMappingId(prev => prev === id ? '' : id);
  };

  const handleCameraChange = async (deviceId: string) => {
      try {
          await switchSharedCamera(deviceId);
          setSelectedCameraId(deviceId);
      } catch (error) {
          console.error('Could not switch camera.', error);
      }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  };

  const activeSlot = visualConfig.slots[activeSlotIndex];

  const renderParams = () => {
      if (activeSlot.type === 'None') return <div className="text-[9px] text-white/30">NO EFFECT SELECTED</div>;

      const showSpeed = activeSlot.type === 'SimpleGlitch' || activeSlot.type === 'AnalogGlitch' || activeSlot.type === 'FaceParticles';

      return (
          <>
            <div className="flex items-center gap-2">
                <span className="text-[9px] w-10">AMT</span>
                <select
                    value={activeSlot.params.amountSource}
                    onChange={(e) => updateSlotParams(activeSlotIndex, { amountSource: e.target.value })}
                    className={`${CONTROL_FIELD} text-[9px] w-20 h-5 rounded-sm px-1`}
                >
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                    onClick={() => updateSlotParams(activeSlotIndex, { amountInvert: !activeSlot.params.amountInvert })}
                    className={`text-[8px] px-1 h-5 rounded-sm border ${activeSlot.params.amountInvert ? ACTIVE_CHROME : INACTIVE_CHROME}`}
                >INV</button>
            </div>

            {showSpeed && (
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] w-10">SPD</span>
                    <select
                        value={activeSlot.params.speedSource}
                        onChange={(e) => updateSlotParams(activeSlotIndex, { speedSource: e.target.value })}
                        className={`${CONTROL_FIELD} text-[9px] w-20 h-5 rounded-sm px-1`}
                    >
                        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                        onClick={() => updateSlotParams(activeSlotIndex, { speedInvert: !activeSlot.params.speedInvert })}
                        className={`text-[8px] px-1 h-5 rounded-sm border ${activeSlot.params.speedInvert ? ACTIVE_CHROME : INACTIVE_CHROME}`}
                    >INV</button>
                </div>
            )}
          </>
      );
  };

  return (
    <div className="absolute inset-0 pointer-events-none text-slate-100">
      <div className="absolute inset-x-0 -top-24 h-72 bg-[radial-gradient(ellipse_at_18%_12%,rgba(125,211,252,0.18),rgba(15,23,42,0.08)_38%,transparent_72%)] blur-2xl pointer-events-none" />
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 w-full h-12 bg-slate-950/55 backdrop-blur-xl border-b border-slate-200/10 shadow-[0_10px_50px_rgba(2,6,23,0.35)] flex items-center px-4 justify-between z-50 pointer-events-auto">
        <div className="text-xs font-semibold tracking-[0.32em] text-slate-100">HAND CONTROLLER</div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-slate-900/70 rounded-md p-1 gap-1 mr-2 border border-slate-200/10 shadow-inner shadow-black/30">
            <button onClick={() => setMode('LIVE_AR')} className={`px-3 py-1 text-xs rounded ${mode === 'LIVE_AR' ? ACTIVE_CHROME : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'}`}>LIVE AR</button>
            <button onClick={() => setMode('VJ_MODE')} className={`px-3 py-1 text-xs rounded ${mode === 'VJ_MODE' ? ACTIVE_CHROME : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'}`}>VJ MODE</button>
          </div>
          
          <select value={selectedMidiDevice} onChange={(e) => setSelectedMidiDevice(e.target.value)} className={`${CONTROL_FIELD} text-[9px] rounded px-1 h-6 w-24`}>
                <option value="all">All MIDI</option>
                {midiDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {mode === 'LIVE_AR' && (
              <select value={selectedCameraId} disabled={isLoadingCameras} onChange={(e) => handleCameraChange(e.target.value)} className={`${CONTROL_FIELD} text-[9px] rounded px-1 h-6 w-28 disabled:opacity-50`}>
                    {isLoadingCameras && <option value="">Detecting...</option>}
                    {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
              </select>
          )}

          <div className="w-px h-6 bg-slate-200/10 mx-2"></div>
          
          <div className="relative overflow-hidden">
            <button className="px-3 py-1 bg-slate-900/60 hover:bg-cyan-200/10 rounded text-xs border border-slate-200/10 hover:border-cyan-200/30 text-slate-200">+ IMPORT</button>
            <input type="file" accept="video/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>
          
          <button onClick={toggleFullScreen} className={`text-[9px] px-2 py-1 rounded border ${INACTIVE_CHROME}`}>FULL</button>
          
          {/* MIDI 开关 */}
          <button onClick={() => setVisualConfig({ showMidiPanel: !visualConfig.showMidiPanel })} className={`text-[9px] px-2 py-1 rounded border ${visualConfig.showMidiPanel ? ACTIVE_CHROME : INACTIVE_CHROME}`}>MIDI</button>

          <button onClick={() => setShowDiagnostics(v => !v)} className={`text-[9px] px-2 py-1 rounded border ${showDiagnostics ? ACTIVE_CHROME : INACTIVE_CHROME}`}>DIAG</button>

          <button onClick={() => setShowSettings(!showSettings)} className={`text-lg transition-colors ${showSettings ? 'text-cyan-100 drop-shadow-[0_0_12px_rgba(103,232,249,0.45)]' : 'text-slate-300 hover:text-slate-50'}`}>⚙️</button>
        </div>
      </div>

      {showDiagnostics && <DiagnosticsPanel data={diagnostics} />}

      {/* BOTTOM SETTINGS PANEL */}
      {showSettings && (
          <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex ${GLASS_PANEL} rounded-md p-3 z-[60] pointer-events-auto gap-4 items-stretch h-32 max-w-[95vw] overflow-x-auto`}>
              
              {/* 【清理】移除了 PRESETS 区域 */}

              {/* 1. SLOTS (Effect Rack) */}
              <div className="flex flex-col gap-1 w-40 border-r border-slate-200/10 pr-2 shrink-0">
                  <span className="text-[9px] text-slate-400 font-bold tracking-[0.2em]">RACK</span>
                  {visualConfig.slots.map((slot, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActiveSlotIndex(idx)}
                        className={`flex items-center justify-between px-2 h-6 border rounded-sm cursor-pointer transition-colors ${activeSlotIndex === idx ? 'border-cyan-200/50 bg-cyan-200/10 shadow-[0_0_18px_rgba(103,232,249,0.12)]' : 'border-slate-200/10 hover:border-cyan-200/30 hover:bg-white/5'}`}
                      >
                          <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); updateSlot(idx, { active: !slot.active }); }}
                                className={`w-2 h-2 rounded-full ${slot.active ? 'bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]' : 'bg-slate-600'}`}
                              />
                              <span className={`text-[9px] truncate w-20 ${activeSlotIndex === idx ? 'text-cyan-100' : 'text-slate-200'}`}>{slot.type}</span>
                          </div>
                          <span className="text-[8px] text-slate-500">{idx+1}</span>
                      </div>
                  ))}
              </div>

              {/* 2. PARAMETERS (Contextual) */}
              <div className="flex flex-col gap-1 border-r border-slate-200/10 pr-2 w-48 shrink-0">
                  <span className="text-[9px] text-cyan-100 font-bold truncate tracking-[0.16em]">PARAMS // {activeSlot.type}</span>
                  <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] w-10">FX</span>
                      <select
                        value={activeSlot.type}
                        onChange={(e) => updateSlot(activeSlotIndex, { type: e.target.value as EffectType })}
                        className={`${CONTROL_FIELD} text-[9px] w-28 h-5 rounded-sm px-1`}
                      >
                          {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                  </div>
                  {renderParams()}
              </div>

              {/* 3. GLOBAL SETTINGS */}
              <div className="flex flex-col gap-1 w-28 shrink-0">
                  <span className="text-[9px] text-slate-400 font-bold tracking-[0.2em]">GLOBAL</span>
                  <div className="flex items-center justify-between">
                      <span className="text-[9px]">VID OP.</span>
                      <input type="range" min="0" max="1" step="0.1" value={visualConfig.videoOpacity} onChange={(e) => setVisualConfig({ videoOpacity: parseFloat(e.target.value) })} className="w-12 h-1" />
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[9px]">SKEL OP.</span>
                      <input type="range" min="0" max="1" step="0.1" value={visualConfig.skeletonOpacity} onChange={(e) => setVisualConfig({ skeletonOpacity: parseFloat(e.target.value) })} className="w-12 h-1" />
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[9px]">M. VIDEO</span>
                      <button onClick={() => setVisualConfig({ mirrorVideo: !visualConfig.mirrorVideo })} className={`w-2 h-2 rounded-full ${visualConfig.mirrorVideo ? 'bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]' : 'bg-slate-600'}`} />
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[9px]">M. SKEL</span>
                      <button onClick={() => setVisualConfig({ mirrorSkeleton: !visualConfig.mirrorSkeleton })} className={`w-2 h-2 rounded-full ${visualConfig.mirrorSkeleton ? 'bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]' : 'bg-slate-600'}`} />
                  </div>
                  
                  {/* 【清理】移除了 SEAL IMG 上传区域 */}
              </div>
          </div>
      )}

      {/* MIDI PANELS (保持不变) */}
      {visualConfig.showMidiPanel && (
        <>
            <div className={`absolute top-16 left-4 w-40 p-2 ${GLASS_PANEL} rounded-md z-40 pointer-events-auto`}>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-cyan-100 tracking-[0.14em]">LEFT HAND</span>
                    <button onClick={() => setMuted(m => ({...m, left: !m.left}))} className={`text-[8px] px-1.5 rounded border ${muted.left ? 'border-rose-300/60 text-rose-200 bg-rose-500/10' : INACTIVE_CHROME}`}>{muted.left ? 'MUTED' : 'ON'}</button>
                </div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Left').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} value={midiValues[m.id] || 0} />
                ))}
            </div>

            <div className={`absolute top-16 right-4 w-40 p-2 ${GLASS_PANEL} rounded-md z-40 pointer-events-auto`}>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-blue-100 tracking-[0.14em]">RIGHT HAND</span>
                    <button onClick={() => setMuted(m => ({...m, right: !m.right}))} className={`text-[8px] px-1.5 rounded border ${muted.right ? 'border-rose-300/60 text-rose-200 bg-rose-500/10' : INACTIVE_CHROME}`}>{muted.right ? 'MUTED' : 'ON'}</button>
                </div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Right').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} value={midiValues[m.id] || 0} />
                ))}
                <div className="mt-4 border-t border-slate-200/10 pt-2">
                <div className="text-[10px] font-black text-slate-200 mb-2 tracking-[0.14em]">GLOBAL</div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Global').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} value={midiValues[m.id] || 0} />
                ))}
                </div>
            </div>
        </>
      )}

      {/* VJ MODE CLIPS (保持不变) */}
      {mode === 'VJ_MODE' && videoClips.length > 0 && showSettings && (
        <div className={`absolute bottom-40 left-1/2 -translate-x-1/2 flex gap-2 p-2 ${GLASS_PANEL} rounded-md z-50 pointer-events-auto`}>
          {videoClips.map(clip => (
            <div key={clip.id} className="relative group">
                <button onClick={() => selectVideoClip(clip.id)} className={`w-16 h-12 rounded border overflow-hidden relative ${activeClipId === clip.id ? 'border-cyan-200/70 shadow-[0_0_18px_rgba(103,232,249,0.18)]' : 'border-slate-200/20 opacity-60'}`}>
                <video src={clip.url} className="w-full h-full object-cover" muted />
                <div className="absolute bottom-0 w-full bg-slate-950/70 text-[8px] truncate px-1">{clip.name}</div>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); removeVideoClip(clip.id); }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    X
                </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
