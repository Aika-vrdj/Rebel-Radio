
import React, { useState, useEffect, useRef } from 'react';
import * as gemini from './services/geminiService';
import * as db from './services/supabaseService';
import { Broadcast, RadioState } from './types';
import AudioVisualizer from './components/AudioVisualizer';
import BroadcastCard from './components/BroadcastCard';

const App: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [prompt, setPrompt] = useState('');
  const [radioState, setRadioState] = useState<RadioState>(RadioState.IDLE);
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [generationStep, setGenerationStep] = useState('');
  const [quota, setQuota] = useState<db.QuotaData>({ count: 0, resetAt: 0 });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      const history = await db.getBroadcasts();
      setBroadcasts(history);
      setQuota(db.getQuota());
    };
    fetchHistory();

    // Check quota every minute to handle resets while app is open
    const interval = setInterval(() => {
      setQuota(db.getQuota());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    // Final check before proceeding
    const currentQuota = db.getQuota();
    if (currentQuota.count >= 5) {
      setRadioState(RadioState.ERROR);
      setGenerationStep('DAILY QUOTA EXHAUSTED');
      return;
    }

    setRadioState(RadioState.GENERATING);
    setGenerationStep('TUNING ENCRYPTION...');
    
    try {
      setTimeout(() => setGenerationStep('SKETCHING VISUAL FREQUENCIES...'), 1500);
      setTimeout(() => setGenerationStep('SYNTHESIZING AUDIO WAVEFORM...'), 3000);

      const data = await gemini.generateBroadcastData(prompt);
      
      const newBroadcast: Broadcast = {
        id: Math.random().toString(36).substring(7),
        title: data.title || 'Unknown Signal',
        prompt: data.prompt || prompt,
        script: data.script || '',
        audioData: data.audioData || '',
        imageUrl: data.imageUrl || '',
        createdAt: data.createdAt || Date.now()
      };

      await db.saveBroadcast(newBroadcast);
      setBroadcasts(prev => [newBroadcast, ...prev]);
      setQuota(db.getQuota()); // Refresh local quota state
      setPrompt('');
      playBroadcast(newBroadcast);
    } catch (error) {
      console.error('Failed to generate broadcast:', error);
      setRadioState(RadioState.ERROR);
      setGenerationStep('SIGNAL JAMMED - RETRY LATER');
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
    }
  };

  const downloadActiveSignal = () => {
    if (!activeBroadcast) return;
    const blob = gemini.createWavBlob(activeBroadcast.audioData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebel_radio_${activeBroadcast.title.toLowerCase().replace(/\s+/g, '_')}_signal.wav`;
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

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto relative">
      {/* Noise layer */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]" />

      <header className="w-full mb-8 text-center relative">
        <div className="absolute top-0 right-0 text-[10px] text-pink-500 font-mono hidden md:block animate-pulse text-right">
          ENCRYPTION: AES-256 <br/>
          VOICE-LINK: KORE-ACTIVE <br/>
          QUOTA-LIMIT: 5/24H
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full relative z-10">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="bg-slate-900/80 p-6 rounded-xl neon-border relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2">
               <div className="flex gap-1">
                 {[1,2,3,4,5].map(i => (
                   <div key={i} className={`w-1 h-3 ${radioState === RadioState.PLAYING ? 'bg-cyan-400' : 'bg-slate-800'}`} />
                 ))}
               </div>
            </div>
            
            <div className="flex flex-col gap-4 relative z-10">
              <div className="flex justify-between items-end mb-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-pink-500 uppercase font-bold tracking-widest">Signal State</span>
                  <span className={`text-xl font-bold tracking-tight ${radioState === RadioState.PLAYING ? 'text-green-400' : 'text-cyan-400'}`}>
                    {radioState === RadioState.GENERATING ? generationStep : radioState === RadioState.PLAYING ? 'LIVE TRANSMISSION' : 'FREQ: 101.X IDLE'}
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
                      <img src={activeBroadcast.imageUrl} className="w-full h-full object-cover" alt="Cover" />
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
                    <div className="inline-block px-2 py-0.5 bg-pink-500/20 text-pink-500 text-[8px] font-bold rounded mb-1 w-fit tracking-widest uppercase">Now Airing</div>
                    {activeBroadcast && (
                      <button 
                        onClick={downloadActiveSignal}
                        className="flex items-center gap-2 text-[10px] text-cyan-400 hover:text-white transition-colors uppercase font-bold tracking-tighter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Extract Signal
                      </button>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-pink-500 pink-neon-text truncate leading-tight mt-1">
                    {activeBroadcast?.title || 'System Standby'}
                  </h2>
                  <p className="text-slate-400 text-sm italic mt-1 overflow-hidden line-clamp-3 font-mono leading-snug">
                    {activeBroadcast?.script || 'Awaiting rebel input. Enter a vibe to initiate waveform synthesis.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900/80 p-6 rounded-xl pink-neon-border backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-pink-500 uppercase font-bold text-[10px] tracking-[0.3em]">Signal Synthesis Command</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Quota:</span>
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-3 h-1.5 rounded-sm ${i < quota.count ? 'bg-slate-700' : 'bg-pink-500 animate-pulse'}`}
                    />
                  ))}
                </div>
                {isQuotaExhausted && (
                  <span className="text-[9px] text-pink-500/60 font-mono ml-2">RESET: {getTimeRemaining()}</span>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isQuotaExhausted}
                placeholder={isQuotaExhausted ? "ENCRYPTION LIMIT REACHED. WAIT FOR SIGNAL REGEN." : "PROMPT: Describe the sound of the resistance..."}
                className={`bg-black/80 border rounded-lg p-4 font-mono text-sm transition-all min-h-[100px] resize-none focus:outline-none focus:ring-1 ${isQuotaExhausted ? 'border-slate-800 text-slate-700 cursor-not-allowed' : 'border-pink-500/30 text-pink-400 placeholder-pink-900/40 focus:border-pink-500 focus:ring-pink-500'}`}
              />
              <button 
                onClick={handleGenerate}
                disabled={radioState === RadioState.GENERATING || !prompt.trim() || isQuotaExhausted}
                className="group relative bg-pink-600 hover:bg-pink-500 disabled:bg-slate-900 disabled:text-slate-700 text-white font-bold py-4 rounded-lg uppercase tracking-[0.2em] transition-all overflow-hidden"
              >
                <span className="relative z-10">
                  {isQuotaExhausted ? 'QUOTA DEPLETED' : radioState === RadioState.GENERATING ? 'TRANSMITTING...' : 'INITIATE BROADCAST'}
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
            <h2 className="text-cyan-400 uppercase font-bold text-[10px] tracking-[0.3em]">Archives</h2>
            <span className="text-cyan-900 text-[8px] font-mono uppercase">Decrypted Logs: {broadcasts.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 scroll-smooth custom-scrollbar">
            {broadcasts.length === 0 ? (
              <div className="text-cyan-900/40 p-12 text-center italic border border-dashed border-cyan-900/30 rounded-xl flex flex-col items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M12 20v-8m0 0V4m0 8h8m-8 0H4"/></svg>
                <span className="text-[10px] tracking-widest uppercase">The airwaves are silent. Generate a signal.</span>
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
        <div>© 2077 Night City Archives</div>
        <div className="flex gap-4">
            <span>Lat: 37.7749</span>
            <span>Long: -122.4194</span>
        </div>
        <div>Signal Status: Nominal</div>
      </footer>
    </div>
  );
};

export default App;
