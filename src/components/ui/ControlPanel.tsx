// src/components/ui/ControlPanel.tsx
// 【清理版】移除了 Seal Image Upload, Presets

import React, { useEffect, useRef, useState } from 'react'; 
import { useAppStore } from '../../store/useAppStore';
import { midiService } from '../../services/midiService';

// 本地定义类型
type EffectType = 'None' | 'SimpleGlitch' | 'AnalogGlitch' | 'Particles' | 'Flash' | 'FaceParticles';
type HandSide = 'Left' | 'Right';

interface MidiMapping {
  id: string; hand: HandSide | 'Global'; parameter: string; cc: number; channel: number; label: string; min: number; max: number;
}
interface MidiDevice { id: string; name: string; }

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

// CompactMappingRow 组件保持不变
const CompactMappingRow = ({ mapping, isSolo, onToggleSolo, deviceId, isMuted, anySoloActive }: any) => {
  const handDataRef = useAppStore(state => state.handDataRef);
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const lastValRef = useRef<number>(-1);

  useEffect(() => {
    const loop = () => {
      const data = handDataRef.current;
      let val = 0;
      if (mapping.hand === 'Global') {
        // @ts-ignore
        val = data[mapping.parameter] || 0;
      } else {
        const handObj = mapping.hand === 'Left' ? data.left : data.right;
        // @ts-ignore
        if (handObj) val = handObj[mapping.parameter] || 0;
      }
      if (barRef.current) barRef.current.style.width = `${Math.min(100, Math.max(0, val * 100))}%`;
      const midiVal = Math.floor(mapping.min + (val * (mapping.max - mapping.min)));
      if (textRef.current) textRef.current.innerText = midiVal.toString();
      const shouldSend = !isMuted && (!anySoloActive || isSolo);
      if (shouldSend && midiVal !== lastValRef.current) {
          midiService.sendControlChange(deviceId, mapping.channel, mapping.cc, midiVal);
          lastValRef.current = midiVal;
      }
    };
    loop();
    const intervalId = window.setInterval(loop, MIDI_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [mapping, isSolo, deviceId, isMuted, anySoloActive]);

  return (
    <div className="flex items-center gap-1 mb-1 h-5 group w-full">
      <div className="w-8 text-[9px] text-right font-mono text-white/60 group-hover:text-white uppercase truncate leading-none">{mapping.label}</div>
      <div className="flex-1 h-full bg-white/5 relative rounded-sm overflow-hidden border border-white/5">
        <div ref={barRef} className={`absolute top-0 bottom-0 left-0 transition-all duration-75 ease-out ${isSolo ? 'bg-yellow-500' : 'bg-white/40'}`} style={{ width: '0%' }} />
        <div className="absolute inset-0 flex items-center justify-start px-1"><span ref={textRef} className="text-[8px] font-mono text-white mix-blend-difference font-bold">0</span></div>
      </div>
      <button onClick={() => onToggleSolo(mapping.id)} className={`w-4 h-4 flex items-center justify-center rounded border text-[8px] font-bold transition-colors ${isSolo ? 'bg-yellow-500 border-yellow-500 text-black' : 'border-white/20 text-white/30 hover:border-white/50 hover:text-white'}`} title="Solo / Map">S</button>
    </div>
  );
};

const EFFECT_TYPES: EffectType[] = ['None', 'SimpleGlitch', 'AnalogGlitch', 'Particles', 'FaceParticles', 'Flash'];

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
  const [soloMappingId, setSoloMappingId] = useState<string>('');

  useEffect(() => {
      const getCameras = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videos = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(videos);
            if(videos.length > 0 && !selectedCameraId) setSelectedCameraId(videos[0].deviceId);
        } catch(e) { console.error(e); }
      };
      getCameras();
      midiService.initialize().then(() => { midiService.onStateChange(setMidiDevices); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { addVideoClip(e.target.files[0]); setMode('VJ_MODE'); }
  };

  // 【清理】移除了 handleSealUpload 函数

  const handleToggleSolo = (id: string) => {
      setSoloMappingId(prev => prev === id ? '' : id);
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
                    className="bg-black border border-white/20 text-[9px] w-20 h-5"
                >
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                    onClick={() => updateSlotParams(activeSlotIndex, { amountInvert: !activeSlot.params.amountInvert })}
                    className={`text-[8px] px-1 h-5 border ${activeSlot.params.amountInvert ? 'bg-blue-500' : 'border-white/20 text-white/50'}`}
                >INV</button>
            </div>

            {showSpeed && (
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] w-10">SPD</span>
                    <select
                        value={activeSlot.params.speedSource}
                        onChange={(e) => updateSlotParams(activeSlotIndex, { speedSource: e.target.value })}
                        className="bg-black border border-white/20 text-[9px] w-20 h-5"
                    >
                        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                        onClick={() => updateSlotParams(activeSlotIndex, { speedInvert: !activeSlot.params.speedInvert })}
                        className={`text-[8px] px-1 h-5 border ${activeSlot.params.speedInvert ? 'bg-blue-500' : 'border-white/20 text-white/50'}`}
                    >INV</button>
                </div>
            )}
          </>
      );
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 w-full h-12 bg-black/80 backdrop-blur border-b border-white/10 flex items-center px-4 justify-between z-50 pointer-events-auto">
        <div className="text-xs font-bold tracking-widest text-[#00FF7F]">HAND-OSC // V2</div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-white/10 rounded p-1 gap-1 mr-2">
            <button onClick={() => setMode('LIVE_AR')} className={`px-3 py-1 text-xs rounded ${mode === 'LIVE_AR' ? 'bg-[#00FF7F] text-black' : 'text-white/50'}`}>LIVE AR</button>
            <button onClick={() => setMode('VJ_MODE')} className={`px-3 py-1 text-xs rounded ${mode === 'VJ_MODE' ? 'bg-cyan-400 text-black' : 'text-white/50'}`}>VJ MODE</button>
          </div>
          
          <select value={selectedMidiDevice} onChange={(e) => setSelectedMidiDevice(e.target.value)} className="bg-black border border-white/20 text-[9px] rounded px-1 outline-none h-6 w-24 text-white">
                <option value="all">All MIDI</option>
                {midiDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {mode === 'LIVE_AR' && (
              <select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} className="bg-black border border-white/20 text-[9px] rounded px-1 outline-none h-6 w-24 text-white">
                    {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
              </select>
          )}

          <div className="w-px h-6 bg-white/20 mx-2"></div>
          
          <div className="relative overflow-hidden">
            <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs border border-white/20">+ IMPORT</button>
            <input type="file" accept="video/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
          </div>
          
          <button onClick={toggleFullScreen} className="text-[9px] px-2 py-1 rounded border border-white/20 hover:bg-white/10 text-white">FULL</button>
          
          {/* MIDI 开关 */}
          <button onClick={() => setVisualConfig({ showMidiPanel: !visualConfig.showMidiPanel })} className={`text-[9px] px-2 py-1 rounded border ${visualConfig.showMidiPanel ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>MIDI</button>

          <button onClick={() => setShowSettings(!showSettings)} className={`text-lg ${showSettings ? 'text-[#00FF7F]' : 'text-white'}`}>⚙️</button>
        </div>
      </div>

      {/* BOTTOM SETTINGS PANEL */}
      {showSettings && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex bg-black/90 backdrop-blur border border-white/20 rounded p-3 z-[60] pointer-events-auto gap-4 items-stretch h-32 max-w-[95vw] overflow-x-auto">
              
              {/* 【清理】移除了 PRESETS 区域 */}

              {/* 1. SLOTS (Effect Rack) */}
              <div className="flex flex-col gap-1 w-40 border-r border-white/10 pr-2 shrink-0">
                  <span className="text-[9px] text-white/50 font-bold">RACK</span>
                  {visualConfig.slots.map((slot, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActiveSlotIndex(idx)}
                        className={`flex items-center justify-between px-2 h-6 border cursor-pointer ${activeSlotIndex === idx ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-white/30'}`}
                      >
                          <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); updateSlot(idx, { active: !slot.active }); }}
                                className={`w-2 h-2 rounded-full ${slot.active ? 'bg-[#00FF7F]' : 'bg-gray-600'}`}
                              />
                              <span className={`text-[9px] truncate w-20 ${activeSlotIndex === idx ? 'text-cyan-400' : 'text-white'}`}>{slot.type}</span>
                          </div>
                          <span className="text-[8px] text-white/30">{idx+1}</span>
                      </div>
                  ))}
              </div>

              {/* 2. PARAMETERS (Contextual) */}
              <div className="flex flex-col gap-1 border-r border-white/10 pr-2 w-48 shrink-0">
                  <span className="text-[9px] text-cyan-400 font-bold truncate">PARAMS // {activeSlot.type}</span>
                  <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] w-10">FX</span>
                      <select
                        value={activeSlot.type}
                        onChange={(e) => updateSlot(activeSlotIndex, { type: e.target.value as EffectType })}
                        className="bg-black border border-white/20 text-[9px] w-28 h-5"
                      >
                          {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                  </div>
                  {renderParams()}
              </div>

              {/* 3. GLOBAL SETTINGS */}
              <div className="flex flex-col gap-1 w-28 shrink-0">
                  <span className="text-[9px] text-white/50 font-bold">GLOBAL</span>
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
                      <button onClick={() => setVisualConfig({ mirrorVideo: !visualConfig.mirrorVideo })} className={`w-2 h-2 rounded-full ${visualConfig.mirrorVideo ? 'bg-green-500' : 'bg-gray-600'}`} />
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="text-[9px]">M. SKEL</span>
                      <button onClick={() => setVisualConfig({ mirrorSkeleton: !visualConfig.mirrorSkeleton })} className={`w-2 h-2 rounded-full ${visualConfig.mirrorSkeleton ? 'bg-green-500' : 'bg-gray-600'}`} />
                  </div>
                  
                  {/* 【清理】移除了 SEAL IMG 上传区域 */}
              </div>
          </div>
      )}

      {/* MIDI PANELS (保持不变) */}
      {visualConfig.showMidiPanel && (
        <>
            <div className="absolute top-16 left-4 w-40 p-2 bg-black/30 backdrop-blur-sm rounded-lg border border-white/5 z-40 pointer-events-auto">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-[#00FF7F]">LEFT HAND</span>
                    <button onClick={() => setMuted(m => ({...m, left: !m.left}))} className={`text-[8px] px-1.5 rounded border ${muted.left ? 'border-red-500 text-red-500' : 'border-white/20 text-white/50'}`}>{muted.left ? 'MUTED' : 'ON'}</button>
                </div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Left').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} deviceId={selectedMidiDevice} isMuted={muted.left} anySoloActive={!!soloMappingId} />
                ))}
            </div>

            <div className="absolute top-16 right-4 w-40 p-2 bg-black/30 backdrop-blur-sm rounded-lg border border-white/5 z-40 pointer-events-auto">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-cyan-500">RIGHT HAND</span>
                    <button onClick={() => setMuted(m => ({...m, right: !m.right}))} className={`text-[8px] px-1.5 rounded border ${muted.right ? 'border-red-500 text-red-500' : 'border-white/20 text-white/50'}`}>{muted.right ? 'MUTED' : 'ON'}</button>
                </div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Right').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} deviceId={selectedMidiDevice} isMuted={muted.right} anySoloActive={!!soloMappingId} />
                ))}
                <div className="mt-4 border-t border-white/10 pt-2">
                <div className="text-[10px] font-black text-yellow-500 mb-2">GLOBAL</div>
                {DEFAULT_MAPPINGS.filter(m => m.hand === 'Global').map(m => (
                    <CompactMappingRow key={m.id} mapping={m} isSolo={soloMappingId === m.id} onToggleSolo={handleToggleSolo} deviceId={selectedMidiDevice} isMuted={false} anySoloActive={!!soloMappingId} />
                ))}
                </div>
            </div>
        </>
      )}

      {/* VJ MODE CLIPS (保持不变) */}
      {mode === 'VJ_MODE' && videoClips.length > 0 && showSettings && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/60 rounded-lg backdrop-blur z-50 pointer-events-auto">
          {videoClips.map(clip => (
            <div key={clip.id} className="relative group">
                <button onClick={() => selectVideoClip(clip.id)} className={`w-16 h-12 rounded border overflow-hidden relative ${activeClipId === clip.id ? 'border-cyan-400' : 'border-white/20 opacity-60'}`}>
                <video src={clip.url} className="w-full h-full object-cover" muted />
                <div className="absolute bottom-0 w-full bg-black/50 text-[8px] truncate px-1">{clip.name}</div>
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
