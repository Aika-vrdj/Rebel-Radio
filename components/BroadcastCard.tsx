
import React from 'react';
import { Broadcast, BroadcastMode } from '../types.ts';
import * as gemini from '../services/geminiService.ts';

interface BroadcastCardProps {
  broadcast: Broadcast;
  onPlay: (broadcast: Broadcast) => void;
}

const BroadcastCard: React.FC<BroadcastCardProps> = ({ broadcast, onPlay }) => {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = gemini.createWavBlob(broadcast.audioData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebel_radio_${broadcast.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900/80 border border-cyan-900/50 p-4 rounded-lg hover:border-pink-500/50 transition-all group cursor-pointer" onClick={() => onPlay(broadcast)}>
      <div className="flex gap-4">
        <div className="relative w-20 h-20 flex-shrink-0">
          <img src={broadcast.imageUrl} alt={broadcast.title} className="w-full h-full object-cover rounded border border-cyan-500/30" />
          <div className="absolute inset-0 bg-cyan-500/10 group-hover:bg-pink-500/10 transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-cyan-400 font-bold truncate group-hover:text-pink-400 transition-colors">{broadcast.title}</h3>
            <span className={`text-[7px] px-1 rounded-sm border ${broadcast.mode === BroadcastMode.MANUAL ? 'border-pink-500/50 text-pink-500' : 'border-cyan-500/50 text-cyan-500'} uppercase font-bold`}>
              {broadcast.mode === BroadcastMode.MANUAL ? 'Direct' : 'Synthetic'}
            </span>
          </div>
          <p className="text-slate-500 text-[10px] italic truncate mb-1">"{broadcast.prompt}"</p>
          <p className="text-slate-400 text-sm line-clamp-2 leading-tight">{broadcast.script}</p>
        </div>
        <div className="flex flex-col gap-2 justify-center">
            <button 
              className="w-10 h-10 rounded-full border border-cyan-500/50 flex items-center justify-center text-cyan-400 hover:border-pink-500 hover:text-pink-400 transition-colors"
              title="Play Signal"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button 
              onClick={handleDownload}
              className="w-10 h-10 rounded-full border border-slate-700/50 flex items-center justify-center text-slate-500 hover:text-cyan-400 hover:border-cyan-500 transition-colors"
              title="Extract Waveform"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default BroadcastCard;
