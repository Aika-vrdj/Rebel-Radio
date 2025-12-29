
import React, { useEffect, useState, useRef } from 'react';
import * as db from '../services/supabaseService.ts';
import * as gemini from '../services/geminiService.ts';
import { Broadcast, RadioState } from '../types.ts';
import AudioVisualizer from './AudioVisualizer.tsx';

const ObserverView: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [radioState, setRadioState] = useState<RadioState>(RadioState.IDLE);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const initializeAudio = () => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.connect(audioContextRef.current.destination);
    setIsReady(true);
  };

  const queueAndPlay = async (broadcast: Broadcast) => {
    if (!audioContextRef.current || !analyserRef.current || !broadcast.audioData) return;

    try {
      setRadioState(RadioState.PLAYING);
      setActiveBroadcast(broadcast);

      const binary = gemini.decodeBase64(broadcast.audioData);
      const buffer = await gemini.decodeAudioDataToBuffer(binary, audioContextRef.current);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(analyserRef.current);
      
      const now = audioContextRef.current.currentTime;
      const startTime = Math.max(now, nextStartTimeRef.current);
      
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
      
      source.onended = () => {
        if (audioContextRef.current && audioContextRef.current.currentTime >= nextStartTimeRef.current - 0.1) {
          setRadioState(RadioState.IDLE);
        }
      };
      
      sourceRef.current = source;
    } catch (e) {
      console.error("Observer Playback Error:", e);
    }
  };

  useEffect(() => {
    if (!isReady) return;

    const channel = db.subscribeToNewBroadcasts((broadcast) => {
      console.log("OBS Listener: New Signal Detected", broadcast.id);
      queueAndPlay(broadcast);
    });

    return () => {
      channel?.unsubscribe();
    };
  }, [isReady]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-12 overflow-hidden relative">
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]" />
      
      {!isReady ? (
        <button 
          onClick={initializeAudio}
          className="z-10 px-8 py-4 bg-pink-600 text-white font-bold orbitron animate-pulse neon-border tracking-[0.5em] hover:bg-pink-500 transition-all"
        >
          INITIALIZE OBS FEED
        </button>
      ) : (
        <div className="w-full max-w-4xl z-10 flex flex-col gap-8 text-center">
          <header className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-4">
              <div className={`w-3 h-3 rounded-full ${radioState === RadioState.PLAYING ? 'bg-red-500 animate-ping shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'}`} />
              <h1 className="text-cyan-500 text-xs tracking-[1em] font-black uppercase italic">
                {radioState === RadioState.PLAYING ? 'ON AIR' : 'LISTENING FOR SIGNAL'}
              </h1>
            </div>
            <h2 className="text-5xl font-black italic pink-neon-text text-pink-500 orbitron tracking-tighter">
              REBEL RADIO // LIVE
            </h2>
          </header>

          <div className="h-32">
            <AudioVisualizer analyser={analyserRef.current} isActive={radioState === RadioState.PLAYING} />
          </div>

          <div className={`transition-all duration-1000 transform ${radioState === RadioState.PLAYING ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="bg-slate-950/80 border border-pink-500/30 p-8 rounded-lg neon-border backdrop-blur-xl">
              <span className="text-[10px] text-pink-500 uppercase font-bold tracking-[0.5em] block mb-4">Incoming Transmission</span>
              <p className="text-cyan-400 font-mono text-xl italic leading-relaxed">
                "{activeBroadcast?.script}"
              </p>
            </div>
          </div>
          
          <footer className="text-[8px] text-slate-800 font-mono tracking-widest uppercase mt-12">
            Sync: Supabase Realtime // Latency: Sub-100ms // Source: OBS_BROWSER
          </footer>
        </div>
      )}
    </div>
  );
};

export default ObserverView;
