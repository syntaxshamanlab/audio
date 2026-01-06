
export enum VisualType {
  BARS = 'bars',
  DRUMS = 'drums',
  VOCALS = 'vocals'
}

export interface AudioAnalysis {
  mood: string;
  colors: string[];
  energy: number;
  description: string;
  visualTheme: string;
}

export interface VisualizerConfig {
  type: VisualType;
  sensitivity: number;
  smoothing: number;
  barWidth: number;
  colorPalette: string[];
  glowStrength: number;
}
