
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Broadcast } from "../types";

// Initialize the API client with strict adherence to instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateBroadcastData = async (prompt: string): Promise<Partial<Broadcast>> => {
  // 1. Generate Broadcast Concept & Script
  const conceptResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are the creative director for Rebel Radio, an underground cyberpunk station.
    The user wants music/atmosphere based on: "${prompt}".
    Generate a JSON object with:
    - title: A gritty, evocative cyberpunk title.
    - hostScript: A short radio host introduction (max 120 characters) describing the sound.
    - visualPrompt: A prompt for a digital art generator showing this sound's vibe.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hostScript: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
        },
        required: ['title', 'hostScript', 'visualPrompt']
      }
    }
  });

  const { title, hostScript, visualPrompt } = JSON.parse(conceptResponse.text || '{}');

  // 2. Generate Cover Art
  const imageResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: `High-fidelity cyberpunk digital art, futuristic underground radio station, neon noir, aesthetic: ${visualPrompt}` }]
    },
    config: {
      imageConfig: { aspectRatio: '1:1' }
    }
  });

  let imageUrl = 'https://picsum.photos/400/400';
  for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  // 3. Generate Audio Stream using the supported TTS model
  // We use 'Kore' for the consistent female voice the user requested.
  const audioResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ 
      parts: [{ 
        text: `Say with a cool, sophisticated, and slightly gritty rebel commander tone: Broadcasting from the underground... Rebel Radio is live. Tonight's signal: ${hostScript}` 
      }] 
    }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' } // Melodic female voice for consistency
        }
      }
    }
  });

  const audioData = audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || '';

  return {
    title,
    script: hostScript,
    audioData,
    imageUrl,
    prompt,
    createdAt: Date.now()
  };
};

export const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const decodeAudioDataToBuffer = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

/**
 * Creates a WAV file Blob from raw PCM data.
 */
export const createWavBlob = (base64Pcm: string, sampleRate: number = 24000): Blob => {
  const pcmData = decodeBase64(base64Pcm);
  const length = pcmData.byteLength;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + length, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, length, true);

  return new Blob([wavHeader, pcmData.buffer], { type: 'audio/wav' });
};
