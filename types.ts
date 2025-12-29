
export interface Broadcast {
  id: string;
  title: string;
  prompt: string;
  script: string;
  audioData: string; // Base64 PCM data or URL
  imageUrl: string;
  createdAt: number;
}

export enum RadioState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface AudioParams {
  sampleRate: number;
  channels: number;
}
