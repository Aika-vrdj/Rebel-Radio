
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        const r = 34;
        const g = 211;
        const b = 238;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${barHeight / 100})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        // Neon cap
        ctx.fillStyle = `rgba(236, 72, 153, 0.8)`;
        ctx.fillRect(x, canvas.height - barHeight - 2, barWidth, 2);

        x += barWidth + 1;
      }
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  return (
    <div className="w-full h-24 bg-slate-900/50 rounded-lg overflow-hidden border border-cyan-500/30">
      <canvas ref={canvasRef} width={600} height={100} className="w-full h-full" />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-cyan-800 text-xs tracking-widest uppercase">
          Signal Offline
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;
