
import { DailyLog } from './types';
import { DAILY_TASKS } from './constants';
import { Blob } from '@google/genai';

export const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

export const getRecentWeekdays = (count: number) => {
  const dates: string[] = [];
  let d = new Date();
  while (dates.length < count) {
    if (isWeekday(d)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
};

export const calculateStreak = (logs: Record<string, DailyLog>) => {
  const today = new Date().toISOString().split('T')[0];
  let currentStreak = 0;
  const sortedWeekdays = getRecentWeekdays(100); 
  
  for (const date of sortedWeekdays) {
    const log = logs[date];
    
    // Check if ALL configured tasks are complete for this day
    const isComplete = log && DAILY_TASKS.every(task => log.completions[task.id]);
    
    if (isComplete) {
      currentStreak++;
    } else {
      // If today is not complete, we don't break the streak yet, but we don't count it.
      // If a past weekday is not complete, the streak breaks.
      if (date !== today) break;
    }
  }
  return currentStreak;
};

// Manual Base64 Encoding as per Gemini API rules
export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Manual Base64 Decoding as per Gemini API rules
export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Create PCM Blob for Gemini Live API
export function createPCMBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Manual PCM Decoding for Gemini TTS output
export async function decodeAudioPCM(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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
}
