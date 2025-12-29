
import React, { useState, useEffect, useRef } from 'react';
import * as gemini from './services/geminiService';
import * as db from './services/supabaseService';
import { Broadcast, RadioState, BroadcastMode } from './types';
import AudioVisualizer from './components/AudioVisualizer';
import BroadcastCard from './components/BroadcastCard';

const App: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<BroadcastMode>(BroadcastMode.CREATIVE);
  const [radioState, setRadioState] = useState<RadioState>(RadioState.IDLE);
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [generationStep, setGenerationStep] = useState('');
  const [quota, setQuota] = useState<db.QuotaData>({ count: 0, resetAt: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<'offline' | 'schema_error' | 'connected' | 'connecting'>('connecting');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const refreshAppData = async () => {
    try {
      const history = await db.getBroadcasts();
      setBroadcasts(history);
      const quotaData = await db.getQuota();
      setQuota(quotaData);
      setCloudStatus(db.getCloudStatus());
    } catch (e) {
      console.error("Refresh Error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAppData();
    const interval = setInterval(refreshAppData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    const currentQuota = await db.getQuota();
    if (currentQuota.count >= 5) {
      setRadioState(RadioState.ERROR);
      setGenerationStep('DAILY QUOTA EXHAUSTED');
      return;
    }

    setRadioState(RadioState.GENERATING);
    setGenerationStep('TUNING ENCRYPTION...');
    
    try {
      // 1. Generate Broadcast Data
      const data = await gemini.generateBroadcastData(prompt, mode);
      
      const newBroadcast: Broadcast = {
        id: Math.random().toString(36).substring(7),
        title: data.title || 'Unknown Signal',
        prompt: data.prompt || prompt,
        script: data.script || '',
        audioData: data.audioData || '', // Base64 string
        imageUrl: data.imageUrl || '',
        mode: mode,
        createdAt: data.createdAt || Date.now()
      };

      // 2. Insert into Database (New Schema)
      setGenerationStep('TRANSMITTING...');
      await db.saveBroadcast(newBroadcast);
      
      // 3. UI Update (Success)
      setGenerationStep('SIGNAL TRANSMITTED');
      setRadioState(RadioState.IDLE);
      
      // Refresh to show latest
      const history = await db.getBroadcasts();
      setBroadcasts(history);
      
      const updatedQuota = await db.getQuota();
      setQuota(updatedQuota);
      setCloudStatus(db.getCloudStatus());
      
      setPrompt('');
      setActiveBroadcast(newBroadcast);

      // IMPORTANT: No auto-play. Signal is sent to cloud for OBS.
      
      // Clear status message after delay
      setTimeout(() => {
        setGenerationStep(prev => prev === 'SIGNAL TRANSMITTED' ? '' : prev);
      }, 5000);

    } catch (error) {
      console.error('Failed to generate broadcast:', error);
      setRadioState(RadioState.ERROR);
      setGenerationStep('SIGNAL JAMMED');
    }
  };

  const playBroadcast = async (broadcast: Broadcast) => {
    if (!broadcast.audioData) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.connect(audioContextRef.current.destination);
    }

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
    }

    setRadioState(RadioState.PLAYING);
    setActiveBroadcast(broadcast);

    try {
      const binary = gemini.decodeBase64(broadcast.audioData);
      const buffer = await gemini.decodeAudioDataToBuffer(binary, audioContextRef.current);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(analyserRef.current!);
      
      source.onended = () => {
        setRadioState(RadioState.IDLE);
      };

      source.start(0);
      sourceRef.current = source;
    } catch (e) {
      console.error("Playback error:", e);
      setRadioState(RadioState.ERROR);
      setGenerationStep('PLAYBACK FAILED');
    }
  };

  const downloadActiveSignal = () => {
    if (!activeBroadcast) return;
    const blob = gemini.createWavBlob(activeBroadcast.audioData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebel_radio_signal_${activeBroadcast.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTimeRemaining = () => {
    const diff = quota.resetAt - Date.now();
    if (diff <= 0) return "Resetting...";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const isQuotaExhausted = quota.count >= 5;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-cyan-500 font-mono italic">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="animate-pulse tracking-[0.4em] uppercase text-xs">Pinging Night City Nodes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]" />

      <header className="w-full mb-8 text-center relative">
        <div className="absolute top-0 right-0 text-[10px] font-mono hidden md:block animate-pulse text-right">
          <div className="flex items-center justify-end gap-2 mb-1">
             <span className="text-slate-500">CLOUD_SYNC:</span>
             <div className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : cloudStatus === 'schema_error' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-red-500 animate-ping'}`} />
          </div>
          <span className="text-pink-500 uppercase">{cloudStatus === 'connected' ? 'SUPABASE_ACTIVE' : cloudStatus === 'schema_error' ? 'LOCAL_FALLBACK' : 'OFFLINE'}</span> <br/>
          <span className="text-pink-500">VOICE-LINK: KORE-ACTIVE</span> <br/>
          <span className="text-pink-500">QUOTA: {quota.count}/5</span>
        </div>
        <h1 className="text-4xl md:text-7xl font-black italic orbitron neon-text tracking-tighter mb-2">
          REBEL <span className="text-pink-500 pink-neon-text">RADIO</span>
        </h1>
        <div className="flex items-center justify-center gap-4">
           <div className="h-[1px] w-12 bg-cyan-900"></div>
           <p className="text-cyan-500/80 text-xs tracking-[0.4em] uppercase font-bold">
            Quantum Sound Synthesis Active
           </p>
           <div className="h-[1px] w-12 bg-cyan-900"></div>
        </div>
      </header>

      {generationStep === 'SIGNAL TRANSMITTED' && (
        <div className="w-full bg-green-500/10 border border-green-500/50 p-2 mb-6 rounded text-center text-[10px] text-green-400 uppercase tracking-widest font-bold animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          SUCCESS: SIGNAL TRANSMITTED TO BROADCAST SERVER
        </div>
      )}

      {radioState === RadioState.ERROR && (
        <div className="w-full bg-red-500/10 border border-red-500/50 p-2 mb-6 rounded text-center text-[10px] text-red-500 uppercase tracking-widest font-bold animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
          ERROR: {generationStep || 'SIGNAL JAMMED'}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full relative z-10">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="bg-slate-900/80 p-6 rounded-xl neon-border relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2">
               <div className="flex gap-1">
                 {[1,2,3,4,5].map(i => (
                   <div key={i} className={`w-1 h-3 ${radioState === RadioState.PLAYING ? 'bg-cyan-400 animate-pulse' : 'bg-slate-800'}`} />
                 ))}
               </div>
            </div>
            
            <div className="flex flex-col gap-4 relative z-10">
              <div className="flex justify-between items-end mb-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-pink-500 uppercase font-bold tracking-widest">Signal State</span>
                  <span className={`text-xl font-bold tracking-tight ${radioState === RadioState.PLAYING ? 'text-green-400' : 'text-cyan-400'}`}>
                    {radioState === RadioState.GENERATING ? generationStep : radioState === RadioState.PLAYING ? 'LIVE TRANSMISSION' : generationStep || 'FREQ: 101.X IDLE'}
                  </span>
                </div>
                <div className="text-right">
                    <span className="text-[10px] text-cyan-500 uppercase font-bold">Processor</span>
                    <span className="block text-cyan-400 font-mono text-xs">KORE-TTS-LOCKED</span>
                </div>
              </div>

              <AudioVisualizer analyser={analyserRef.current} isActive={radioState === RadioState.PLAYING} />

              <div className="flex flex-col md:flex-row gap-4 mt-2">
                <div className="w-full md:w-40 h-40 border border-cyan-500/30 rounded overflow-hidden flex-shrink-0 relative group">
                  {activeBroadcast ? (
                    <>
                      <img src={activeBroadcast.imageUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeBroadcast.id}`} className="w-full h-full object-cover" alt="Cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    </>
                  ) : (
                    <div className="w-full h-full bg-slate-800/50 flex flex-col items-center justify-center text-cyan-900 border-2 border-dashed border-cyan-900/20">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
                      <span className="text-[8px] mt-2 uppercase font-bold">Wait Scan</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="inline-block px-2 py-0.5 bg-pink-500/20 text-pink-500 text-[8px] font-bold rounded mb-1 w-fit tracking-widest uppercase">
                      {radioState === RadioState.PLAYING ? 'Playing' : 'Latest Signal'}
                    </div>
                    {activeBroadcast && (
                      <button 
                        onClick={downloadActiveSignal}
                        className="flex items-center gap-2 text-[10px] text-cyan-400 hover:text-white transition-colors uppercase font-bold tracking-tighter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Extract
                      </button>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-pink-500 pink-neon-text truncate leading-tight mt-1">
                    {activeBroadcast?.title || 'System Standby'}
                  </h2>
                  <p className="text-slate-400 text-sm italic mt-1 overflow-hidden line-clamp-3 font-mono leading-snug">
                    {activeBroadcast?.script || 'Awaiting rebel input. Transmitted signals are routed to the cloud for live broadcast.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900/80 p-6 rounded-xl pink-neon-border backdrop-blur-md">
            <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
              <div className="flex bg-black/40 p-1 rounded-lg border border-pink-500/20">
                <button 
                  onClick={() => setMode(BroadcastMode.CREATIVE)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase tracking-widest ${mode === BroadcastMode.CREATIVE ? 'bg-cyan-500/20 text-cyan-400 neon-border' : 'text-slate-600 hover:text-slate-400'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z"/></svg>
                  Creative
                </button>
                <button 
                  onClick={() => setMode(BroadcastMode.MANUAL)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase tracking-widest ${mode === BroadcastMode.MANUAL ? 'bg-pink-500/20 text-pink-500 pink-neon-border' : 'text-slate-600 hover:text-slate-400'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="12" y2="5"/></svg>
                  Manual
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Quota:</span>
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-3 h-1.5 rounded-sm ${i < quota.count ? 'bg-slate-700 shadow-inner' : 'bg-pink-500 animate-pulse shadow-[0_0_5px_rgba(236,72,153,0.5)]'}`}
                    />
                  ))}
                </div>
                {isQuotaExhausted && (
                  <span className="text-[9px] text-pink-500/60 font-mono ml-2 uppercase">RESET: {getTimeRemaining()}</span>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isQuotaExhausted}
                placeholder={isQuotaExhausted ? "ENCRYPTION LIMIT REACHED. WAIT FOR SIGNAL REGEN." : mode === BroadcastMode.CREATIVE ? "PROMPT: Describe the sound vibe..." : "TERMINAL: Enter literal broadcast script..."}
                className={`bg-black/80 border rounded-lg p-4 font-mono text-sm transition-all min-h-[100px] resize-none focus:outline-none focus:ring-1 ${isQuotaExhausted ? 'border-slate-800 text-slate-700 cursor-not-allowed' : mode === BroadcastMode.CREATIVE ? 'border-cyan-500/30 text-cyan-400 placeholder-cyan-900/40 focus:border-cyan-500 focus:ring-cyan-500' : 'border-pink-500/30 text-pink-400 placeholder-pink-900/40 focus:border-pink-500 focus:ring-pink-500'}`}
              />
              <button 
                onClick={handleGenerate}
                disabled={radioState === RadioState.GENERATING || !prompt.trim() || isQuotaExhausted}
                className={`group relative font-bold py-4 rounded-lg uppercase tracking-[0.2em] transition-all overflow-hidden ${mode === BroadcastMode.CREATIVE ? 'bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-900' : 'bg-pink-600 hover:bg-pink-500 disabled:bg-slate-900'} text-white shadow-lg`}
              >
                <span className="relative z-10">
                  {isQuotaExhausted ? 'QUOTA DEPLETED' : radioState === RadioState.GENERATING ? generationStep : 'TRANSMIT SIGNAL'}
                </span>
                {!isQuotaExhausted && (
                  <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                )}
              </button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 flex flex-col h-[calc(100vh-280px)] min-h-[450px]">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-cyan-400 uppercase font-bold text-[10px] tracking-[0.3em]">
              Node Archive
            </h2>
            <span className="text-cyan-900 text-[8px] font-mono uppercase">Total Transmissions: {broadcasts.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 scroll-smooth custom-scrollbar">
            {broadcasts.length === 0 ? (
              <div className="text-cyan-900/40 p-12 text-center italic border border-dashed border-cyan-900/30 rounded-xl flex flex-col items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M12 20v-8m0 0V4m0 8h8m-8 0H4"/></svg>
                <span className="text-[10px] tracking-widest uppercase">No active signals found.</span>
              </div>
            ) : (
              broadcasts.map(b => (
                <BroadcastCard key={b.id} broadcast={b} onPlay={playBroadcast} />
              ))
            )}
          </div>
        </div>
      </div>

      <footer className="w-full mt-auto pt-8 pb-4 border-t border-cyan-900/20 flex flex-col md:flex-row justify-between items-center text-cyan-900 text-[8px] tracking-[0.3em] uppercase font-bold gap-4">
        <div>© 2077 Rebel Radio Underground</div>
        <div className="flex gap-4">
            <span className={cloudStatus === 'connected' ? 'text-green-500/50' : ''}>LINK: {cloudStatus.toUpperCase()}</span>
            <span>FREQ: 101.9 MHz</span>
        </div>
        <div>Transmitter: Nominal</div>
      </footer>
    </div>
  );
};

export default App;
