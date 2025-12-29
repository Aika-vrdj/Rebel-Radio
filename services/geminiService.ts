
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Broadcast, BroadcastMode } from "../types.ts";

// Strict adherence to instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateBroadcastData = async (
  prompt: string, 
  mode: BroadcastMode
): Promise<Partial<Broadcast>> => {
  let title: string;
  let ttsText: string;
  let visualPrompt: string;

  if (mode === BroadcastMode.CREATIVE) {
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

    const parsed = JSON.parse(conceptResponse.text || '{}');
    title = parsed.title;
    ttsText = `Broadcasting from the underground... Rebel Radio is live. Tonight's signal: ${parsed.hostScript}`;
    visualPrompt = parsed.visualPrompt;
  } else {
    const metaResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a cool cyberpunk radio title and a visual art prompt for this literal radio message: "${prompt}". 
      Return JSON: { "title": string, "visualPrompt": string }`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
          },
          required: ['title', 'visualPrompt']
        }
      }
    });
    
    const parsedMeta = JSON.parse(metaResponse.text || '{}');
    title = parsedMeta.title;
    visualPrompt = parsedMeta.visualPrompt;
    ttsText = prompt;
  }

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

  const audioResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ 
      parts: [{ 
        text: mode === BroadcastMode.CREATIVE 
          ? `Say with a cool, sophisticated rebel tone: ${ttsText}`
          : ttsText
      }] 
    }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    }
  });

  const audioData = audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || '';

  return {
    title,
    script: ttsText,
    audioData,
    imageUrl,
    prompt,
    mode,
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

export const createWavBlob = (base64Pcm: string, sampleRate: number = 24000): Blob => {
  const pcmData = decodeBase64(base64Pcm);
  const length = pcmData.byteLength;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  view.setUint32(0, 0x52494646, false); 
  view.setUint32(4, 36 + length, true);
  view.setUint32(8, 0x57415645, false); 
  
  view.setUint32(12, 0x666d7420, false); 
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  
  view.setUint32(36, 0x64617461, false); 
  view.setUint32(40, length, true);

  return new Blob([wavHeader, pcmData.buffer], { type: 'audio/wav' });
};
