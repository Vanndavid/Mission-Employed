
import { DailyLog } from './types';
import { DAILY_TASKS } from './constants';
import { Blob } from '@google/genai';

/**
 * Returns YYYY-MM-DD for a given date in LOCAL time.
 */
export const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns the most recent X days as YYYY-MM-DD strings in descending order.
 */
export const getRecentDays = (count: number) => {
  const dates: string[] = [];
  let d = new Date();
  for (let i = 0; i < count; i++) {
    dates.push(getLocalDateString(d));
    d.setDate(d.getDate() - 1);
  }
  return dates;
};

export const calculateStreak = (logs: Record<string, DailyLog>) => {
  const today = getLocalDateString();
  let currentStreak = 0;
  // Look back at the last 100 potential days
  const sortedDays = getRecentDays(100); 
  
  for (const date of sortedDays) {
    const log = logs[date];
    
    // A day is complete if all tasks in the protocol are checked
    const isComplete = log && DAILY_TASKS.every(task => log.completions[task.id]);
    
    if (isComplete) {
      currentStreak++;
    } else {
      // If it's today and not complete, don't break the streak yet, just don't increment.
      // If it's a past day and not complete, the streak is broken.
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
