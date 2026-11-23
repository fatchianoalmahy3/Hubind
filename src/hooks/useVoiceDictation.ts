import { useCallback, useEffect, useRef, useState } from 'react';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0?: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function resolveSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function appendVoiceTranscript(existing: string, spoken: string): string {
  const cleanSpoken = spoken.trim().replace(/\s+/g, ' ');
  if (!cleanSpoken) return existing;
  const trimmedExisting = existing.trimEnd();
  if (!trimmedExisting) {
    return cleanSpoken.charAt(0).toUpperCase() + cleanSpoken.slice(1);
  }
  const needsPeriodSpace = !/[.,!?;:\n-]$/.test(trimmedExisting);
  const formattedSpoken = needsPeriodSpace
    ? cleanSpoken.charAt(0).toLowerCase() + cleanSpoken.slice(1)
    : cleanSpoken.charAt(0).toUpperCase() + cleanSpoken.slice(1);
  return `${trimmedExisting} ${formattedSpoken}`;
}

export function useVoiceDictation(lang = 'id-ID') {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const onTranscriptRef = useRef<(transcript: string) => void>(() => {});
  const activeFieldRef = useRef<string | null>(null);

  const [isSupported] = useState<boolean>(() => Boolean(resolveSpeechRecognitionCtor()));
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [voiceError, setVoiceError] = useState('');

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    activeFieldRef.current = null;
    setActiveFieldId(null);
    setInterimText('');
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        // Ignore already-stopped recognition errors
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleListening = useCallback(
    (fieldId: string, onFinalTranscript: (transcript: string) => void) => {
      setVoiceError('');
      if (activeFieldRef.current === fieldId) {
        stopListening();
        return;
      }

      const Ctor = resolveSpeechRecognitionCtor();
      if (!Ctor) {
        setVoiceError(
          'Browser ini belum mendukung dikte suara langsung. Gunakan Chrome/Safari atau tombol mikrofon di keyboard HP.'
        );
        return;
      }

      if (recognitionRef.current) {
        stopListening();
      }

      onTranscriptRef.current = onFinalTranscript;
      activeFieldRef.current = fieldId;
      setActiveFieldId(fieldId);
      setInterimText('');

      try {
        const rec = new Ctor();
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event: BrowserSpeechRecognitionEvent) => {
          let interim = '';
          let finalChunk = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const res = event.results[i];
            const text = res?.[0]?.transcript || '';
            if (res?.isFinal) {
              finalChunk += `${text} `;
            } else {
              interim += text;
            }
          }
          setInterimText(interim.trim());
          const cleanFinal = finalChunk.trim();
          if (cleanFinal && activeFieldRef.current === fieldId) {
            onTranscriptRef.current(cleanFinal);
          }
        };

        rec.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
          const code = event?.error || '';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setVoiceError('Izin mikrofon ditolak. Aktifkan izin mikrofon di browser Anda.');
          } else if (code === 'no-speech') {
            setVoiceError('Tidak ada suara terdeteksi. Coba ketuk mikrofon dan bicara lebih dekat.');
          } else if (code === 'network') {
            setVoiceError('Koneksi internet dibutuhkan untuk pengenalan suara browser.');
          } else if (code !== 'aborted') {
            setVoiceError('Gagal mengenali suara. Silakan coba lagi atau ketik manual.');
          }
          stopListening();
        };

        rec.onend = () => {
          if (activeFieldRef.current === fieldId) {
            recognitionRef.current = null;
            activeFieldRef.current = null;
            setActiveFieldId(null);
            setInterimText('');
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        setVoiceError('Gagal menyalakan mikrofon. Pastikan halaman dibuka melalui HTTPS.');
        stopListening();
      }
    },
    [lang, stopListening]
  );

  return {
    isSupported,
    activeFieldId,
    interimText,
    voiceError,
    clearVoiceError: () => setVoiceError(''),
    toggleListening,
    stopListening,
  };
}
