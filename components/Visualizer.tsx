
import React, { useRef, useEffect, useCallback } from 'react';
import { VisualType, VisualizerConfig } from '../types';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  config: VisualizerConfig;
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, config, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const timeRef = useRef<number>(0);

  const draw = useCallback(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;
    timeRef.current += 0.015;

    // Clear frame with slight persistence for trails
    ctx.globalCompositeOperation = 'source-over';
    const trailAlpha = config.type === VisualType.DRUMS ? 0.35 : 0.2;
    ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
    ctx.fillRect(0, 0, width, height);

    const colors = config.colorPalette;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));

    ctx.strokeStyle = gradient;
    ctx.fillStyle = gradient;
    ctx.shadowBlur = config.glowStrength;
    ctx.shadowColor = colors[0];

    switch (config.type) {
      case VisualType.BARS: {
        // Mirrored Bars: Bass in the center
        const centerX = width / 2;
        const totalBars = Math.min(bufferLength / 2, 64);
        const barW = (width / (totalBars * 2)) * 0.8;
        
        for (let i = 0; i < totalBars; i++) {
          // dataArray[0] is bass. As i increases, frequency increases.
          const barHeight = (dataArray[i] / 255) * height * 0.6 * config.sensitivity;
          
          // Right side
          ctx.fillRect(centerX + (i * (barW + 2)), height / 2 - barHeight / 2, barW, barHeight);
          // Left side
          ctx.fillRect(centerX - (i * (barW + 2)) - barW, height / 2 - barHeight / 2, barW, barHeight);
        }
        break;
      }

      case VisualType.DRUMS: {
        const getBandEnergy = (start: number, end: number) => {
          let sum = 0;
          const actualEnd = Math.min(end, bufferLength);
          for (let i = start; i < actualEnd; i++) sum += dataArray[i];
          return sum / (actualEnd - start) / 255;
        };

        const bass = getBandEnergy(0, 10);
        const lowMid = getBandEnergy(10, 40);
        const mid = getBandEnergy(40, 120);
        const high = getBandEnergy(120, bufferLength);

        ctx.save();
        ctx.translate(width / 2, height / 2);

        // KICK (Bass)
        const kickRadius = 40 + bass * 180 * config.sensitivity;
        const kickGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, kickRadius);
        kickGrad.addColorStop(0, colors[0]);
        kickGrad.addColorStop(0.8, colors[0] + '33');
        kickGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = kickGrad;
        ctx.beginPath();
        ctx.arc(0, 0, kickRadius, 0, Math.PI * 2);
        ctx.fill();

        // SNARE (LowMid)
        const snareSize = lowMid * 200 * config.sensitivity;
        ctx.strokeStyle = colors[1] || '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(-snareSize/2, -snareSize/2, snareSize, snareSize);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-snareSize/2.5, -snareSize/2.5, snareSize/1.2, snareSize/1.2);

        // CYMBALS (Highs)
        if (high > 0.35) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const length = high * 200;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * 150, Math.sin(angle) * 150);
            ctx.lineTo(Math.cos(angle) * (150 + length), Math.sin(angle) * (150 + length));
            ctx.stroke();
          }
        }
        ctx.restore();
        break;
      }

      case VisualType.VOCALS: {
        // Vocals sit in the mid-range (approx 300Hz - 4kHz)
        const vocalStart = Math.floor(bufferLength * 0.05);
        const vocalEnd = Math.floor(bufferLength * 0.35);
        let vocalEnergy = 0;
        for (let i = vocalStart; i < vocalEnd; i++) vocalEnergy += dataArray[i];
        vocalEnergy = (vocalEnergy / (vocalEnd - vocalStart)) / 255;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.globalCompositeOperation = 'screen';

        // Organic central "Voice" shape
        const points = 12;
        const baseRadius = 100 + vocalEnergy * 150 * config.sensitivity;
        
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath();
          const layerOffset = layer * 0.5 + timeRef.current;
          const layerColor = colors[layer % colors.length] || colors[0];
          ctx.strokeStyle = layerColor;
          ctx.fillStyle = layerColor + '22';
          ctx.lineWidth = 2;

          for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const noise = Math.sin(angle * 3 + layerOffset) * 20 * vocalEnergy;
            const r = baseRadius - (layer * 30) + noise;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Mid-High "Sibilance" sparks
        const highMidEnergy = dataArray[Math.floor(bufferLength * 0.4)] / 255;
        if (highMidEnergy > 0.5) {
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 5; i++) {
            const r = Math.random() * baseRadius;
            const a = Math.random() * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2 * highMidEnergy, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        break;
      }
    }

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [analyser, config]);

  useEffect(() => {
    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(draw);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isActive, draw]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full rounded-2xl shadow-2xl bg-black transition-all duration-700"
    />
  );
};

export default Visualizer;
