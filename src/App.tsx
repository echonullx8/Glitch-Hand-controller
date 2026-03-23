import React from 'react';
import { Scene } from './components/canvas/Scene';
import { ControlPanel } from './components/ui/ControlPanel';
import { HandTracker } from './components/logic/HandTracker';
import { useAppStore } from './store/useAppStore';

const App: React.FC = () => {
  const { mode } = useAppStore();

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 1. 逻辑层 */}
      <HandTracker />
      
      {/* 2. 视觉层 */}
      <Scene />

      {/* 3. UI 层 */}
      <ControlPanel />
      
      <div className="absolute bottom-2 right-2 text-[10px] text-white/30 pointer-events-none">
        MODE: {mode}
      </div>
    </div>
  );
};

export default App;


