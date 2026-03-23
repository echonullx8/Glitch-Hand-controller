import React from 'react';

// 1. 导出类型 (关键修复)
export type HandSide = 'Left' | 'Right';

export interface MidiMapping {
  id: string;
  hand: HandSide | 'Global';
  parameter: string;
  cc: number;
  channel: number;
  label: string;
  min: number;
  max: number;
  // inverted removed
}

interface MappingRowProps {
  mapping: MidiMapping;
  val: number;
  isSolo: boolean;
  onToggleSolo: (id: string) => void;
}

const CompactMappingRow: React.FC<MappingRowProps> = React.memo(({ mapping, val, isSolo, onToggleSolo }) => {
  const midiVal = Math.round(val * 127);
  
  return (
    <div className="flex items-center gap-1 mb-1 h-5 group w-full">
      <div className="w-8 text-[9px] text-right font-mono text-white/60 group-hover:text-white uppercase truncate leading-none">
        {mapping.label}
      </div>

      <div className="flex-1 h-full bg-white/5 relative rounded-sm overflow-hidden border border-white/5">
        <div
            className={`absolute top-0 bottom-0 left-0 transition-all duration-75 ease-out ${isSolo ? 'bg-yellow-500' : 'bg-white/40'}`}
            style={{ width: `${Math.min(100, Math.max(0, val * 100))}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-start px-1">
            <span className="text-[8px] font-mono text-white mix-blend-difference font-bold">{midiVal}</span>
        </div>
      </div>

      <button
        onClick={() => onToggleSolo(mapping.id)}
        className={`w-4 h-4 flex items-center justify-center rounded border text-[8px] font-bold transition-colors ${
            isSolo 
            ? 'bg-yellow-500 border-yellow-500 text-black' 
            : 'border-white/20 text-white/30 hover:border-white/50 hover:text-white'
        }`}
        title="Solo / Map"
      >
        S
      </button>
    </div>
  );
});

export default CompactMappingRow;
