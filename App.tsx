
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { analyzeAudio } from './services/geminiService';
import Visualizer from './components/Visualizer';
import { VisualType, VisualizerConfig, AudioAnalysis } from './types';
import { 
  Music, 
  Upload, 
  Download, 
  Play, 
  Pause, 
  Settings2, 
  Sparkles, 
  Layout, 
  Activity,
  RefreshCw,
  Video,
  StopCircle,
  Wand2,
  Loader2,
  ExternalLink
} from 'lucide-react';

const App: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // AI Video Generation State
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenProgress, setVideoGenProgress] = useState('');

  const [config, setConfig] = useState<VisualizerConfig>({
    type: VisualType.BARS,
    sensitivity: 1.2,
    smoothing: 0.85,
    barWidth: 4,
    colorPalette: ["#3b82f6", "#8b5cf6", "#ec4899"],
    glowStrength: 15
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const setupAudio = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = config.smoothing;

    const source = audioCtx.createMediaElementSource(audioRef.current);
    
    // Create a destination for recording
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(analyser);
    source.connect(dest); // Audio goes to recording destination
    analyser.connect(audioCtx.destination); // Audio goes to speakers

    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    audioDestinationRef.current = dest;
  }, [config.smoothing]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      const url = URL.createObjectURL(file);
      if (audioRef.current) {
        audioRef.current.src = url;
      }
      
      setIsAnalyzing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await analyzeAudio(base64, file.type);
        setAnalysis(res);
        setConfig(prev => ({
          ...prev,
          colorPalette: res.colors
        }));
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      setupAudio();
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // --- Live Recording Logic ---
  const startRecording = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas || !audioDestinationRef.current) return;

    recordedChunksRef.current = [];
    const canvasStream = canvas.captureStream(30); // 30 FPS
    const audioStream = audioDestinationRef.current.stream;
    
    const combinedStream = new MediaStream([
      ...canvasStream.getTracks(),
      ...audioStream.getTracks()
    ]);

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    const recorder = new MediaRecorder(combinedStream, options);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonic-canvas-capture-${Date.now()}.webm`;
      a.click();
      setIsRecording(false);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // --- Veo AI Video Generation ---
  const handleGenerateAIVideo = async () => {
    if (!analysis) return;

    try {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        // Procedure: Proceed after triggering dialog
      }

      setIsGeneratingVideo(true);
      setVideoGenProgress('Initializing Veo Engine...');

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const prompt = `A cinematic, abstract music video visualization. Theme: ${analysis.visualTheme}. Mood: ${analysis.mood}. Description: ${analysis.description}. Colors: ${analysis.colors.join(', ')}. Flowing patterns, high energy, synchronized to a beat, 4k, professional motion graphics.`;

      setVideoGenProgress('Dreaming up visuals (approx 1-2 mins)...');
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '1080p',
          aspectRatio: '9:16'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        setVideoGenProgress('Rendering frames and syncing audio pulses...');
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        setVideoGenProgress('Finalizing and downloading...');
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sonic-canvas-ai-video-${Date.now()}.mp4`;
        a.click();
      }
    } catch (error) {
      console.error("Video generation failed:", error);
      alert("AI Video generation failed. Ensure you have a valid paid API key selected.");
    } finally {
      setIsGeneratingVideo(false);
      setVideoGenProgress('');
    }
  };

  const downloadSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `sonic-canvas-frame-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = config.smoothing;
    }
  }, [config.smoothing]);

  return (
    <div className="min-h-screen bg-black text-[#f9fafb] flex flex-col max-w-[500px] mx-auto border-x border-white/5 shadow-2xl relative overflow-hidden">
      
      {/* AI Video Loading Overlay */}
      {isGeneratingVideo && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-10 text-center">
          <div className="relative mb-8">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            <Sparkles className="w-6 h-6 text-purple-400 absolute top-0 right-0 animate-bounce" />
          </div>
          <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Generating AI Cinema
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-8">
            {videoGenProgress}
          </p>
          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{ width: '60%' }} />
          </div>
          <div className="mt-8 flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
            <Loader2 className="w-3 h-3 animate-spin" /> Powered by Veo 3.1
          </div>
        </div>
      )}

      {/* Pinned Top Bar */}
      <header className="h-16 flex items-center justify-between px-6 bg-black/80 backdrop-blur-md z-30 sticky top-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Music className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">SonicCanvas</h1>
        </div>
        <div className="flex items-center gap-2">
           <button 
            onClick={downloadSnapshot}
            disabled={!audioFile}
            className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"
            title="Download Frame"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Hero Visualizer */}
      <section className="w-full aspect-[3/4] relative bg-black overflow-hidden group">
        <Visualizer 
          analyser={analyserRef.current} 
          config={config}
          isActive={isPlaying}
        />
        
        {!audioFile && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/40 backdrop-blur-[2px]">
            <Activity className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
            <h2 className="text-xl font-bold mb-2">Sonic Canvas AI</h2>
            <p className="text-gray-400 text-sm">Upload music to start visualization</p>
          </div>
        )}

        {/* HUD Elements */}
        <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          {isRecording && (
            <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">REC</span>
            </div>
          )}
        </div>

        {audioFile && (
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-mono text-white/80 truncate max-w-[120px]">{audioFile.name}</span>
            </div>
          </div>
        )}
      </section>

      {/* Control Panel */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-black to-[#050505]">
        
        {/* Playback Hub */}
        <div className="px-6 py-6 border-b border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={togglePlay}
              disabled={!audioFile}
              className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 flex items-center justify-center transition-all shadow-xl shadow-blue-500/20 active:scale-90"
            >
              {isPlaying ? <Pause className="fill-white w-6 h-6" /> : <Play className="fill-white w-6 h-6 ml-1" />}
            </button>
            <div className="flex-1">
              <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="relative h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="absolute h-full bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                />
                <input 
                  type="range" min="0" max={duration || 0} value={currentTime}
                  onChange={(e) => {
                    if (audioRef.current) {
                      const time = parseFloat(e.target.value);
                      audioRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            {isRecording ? (
              <button 
                onClick={stopRecording}
                className="flex-1 h-12 bg-red-600/20 border border-red-600/30 text-red-500 rounded-xl flex items-center justify-center gap-2 font-bold text-xs"
              >
                <StopCircle className="w-4 h-4" /> Stop Recording
              </button>
            ) : (
              <button 
                onClick={startRecording}
                disabled={!audioFile || !isPlaying}
                className="flex-1 h-12 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-xs hover:bg-white/10 disabled:opacity-30"
              >
                <Video className="w-4 h-4" /> Record Live
              </button>
            )}
            <button 
              onClick={handleGenerateAIVideo}
              disabled={!analysis}
              className="flex-1 h-12 bg-purple-600/20 border border-purple-600/30 text-purple-400 rounded-xl flex items-center justify-center gap-2 font-bold text-xs hover:bg-purple-600/30 disabled:opacity-30"
            >
              <Wand2 className="w-4 h-4" /> AI Magic Video
            </button>
          </div>
          
          <div className="relative group">
            <input type="file" accept="audio/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="h-12 border border-white/10 rounded-xl flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 transition-colors text-white">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium">New Track</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* AI Synopsis Card */}
          <div className="p-4 bg-blue-900/5 border border-blue-500/10 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10">
              <Sparkles className="w-24 h-24 text-blue-400" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">AI Analysis</span>
            </div>
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-xs text-blue-300">
                <RefreshCw className="w-3 h-3 animate-spin" /> Decoding audio DNA...
              </div>
            ) : analysis ? (
              <div className="space-y-3">
                <div className="text-sm font-bold text-blue-100 flex justify-between">
                  {analysis.mood}
                  <a 
                    href="https://ai.google.dev/gemini-api/docs/billing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[9px] text-gray-500 flex items-center gap-1 hover:text-gray-400"
                  >
                    Billing Info <ExternalLink className="w-2 h-2" />
                  </a>
                </div>
                <p className="text-[11px] text-blue-200/70 leading-relaxed italic">{analysis.description}</p>
                <div className="flex gap-1 h-1.5">
                  {analysis.colors.map((c, i) => (
                    <div key={i} className="flex-1 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 italic">Upload to reveal synesthetic insights.</p>
            )}
          </div>

          {/* Style Selector */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 block flex items-center gap-2">
              <Layout className="w-3 h-3" /> Core Visualizers
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(VisualType).map((type) => (
                <button
                  key={type}
                  onClick={() => setConfig(prev => ({ ...prev, type }))}
                  className={`px-2 py-3 text-[10px] font-bold rounded-lg border transition-all truncate ${
                    config.type === type 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-5 pb-10">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> Audio Engine
            </label>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-gray-400">
                  <span>SENSITIVITY</span>
                  <span>{config.sensitivity.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="3" step="0.1" 
                  value={config.sensitivity}
                  onChange={(e) => setConfig(prev => ({ ...prev, sensitivity: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-gray-400">
                  <span>SMOOTHING</span>
                  <span>{config.smoothing.toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0.5" max="0.99" step="0.01" 
                  value={config.smoothing}
                  onChange={(e) => setConfig(prev => ({ ...prev, smoothing: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <audio 
        ref={audioRef} 
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => {
          setIsPlaying(false);
          if (isRecording) stopRecording();
        }}
        crossOrigin="anonymous"
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
        @keyframes shimmer { 
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default App;
