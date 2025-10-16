import React, { useState, useRef, useEffect, FC, useCallback, useMemo } from 'react';
import { Mic, Square, Volume2, Brain, ArrowLeft, ArrowRight } from 'lucide-react';
import { Dua, Surah } from './types';
import { duaDatabase } from './constants';
import { surahDatabase } from './surah-data';
import { QuizScreen } from './components/QuizScreen';

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
  
  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
    readonly resultIndex: number;
  }

  interface SpeechRecognitionResultList {
    [index: number]: SpeechRecognitionResult;
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative;
    readonly length: number;
    readonly isFinal: boolean;
    item(index: number): SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }
}

const App: FC = () => {
  const [currentScreen, setCurrentScreen] = useState('initial');
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSurah, setCurrentSurah] = useState('');
  const [message, setMessage] = useState('');
  
  const [currentDua, setCurrentDua] = useState<Dua | null>(null);
  const [duaMessage, setDuaMessage] = useState('');
  const [failedRecognitionAttempts, setFailedRecognitionAttempts] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);
  const isWelcomeSequencePlaying = useRef(false);
  const postRecitationActionInProgress = useRef(false);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
    }
  }, []);

  const stopPlayback = useCallback((clearState: boolean = true) => {
    if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
    }
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    
    if (clearState) {
        // Only reset Surah/Dua if we are not in the middle of a transition
        if (currentScreen !== 'duaPlayer') {
            setCurrentDua(null);
        }
        if (currentScreen !== 'surah') {
           setCurrentSurah('');
        }
    }
  }, [currentScreen]);

  const startListening = useCallback((force: boolean = false) => {
    if (!force && audioRef.current && !audioRef.current.paused && !isWelcomeSequencePlaying.current) {
      return;
    }
    
    if (recognitionRef.current) {
      let lang = 'en-US'; // Default
      if (currentScreen === 'landing' || currentScreen === 'duaList') {
        lang = 'ta-IN';
      }
      recognitionRef.current.lang = lang;

      setTranscription('');
      if (currentScreen === 'duaList') {
        setDuaMessage('கேட்கிறது...');
      } else if (currentScreen !== 'welcome' && currentScreen !== 'landing') {
        setMessage('கேட்கிறது...');
      }
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.warn('Could not start recognition, it might already be active.', error);
      }
    }
  }, [currentScreen]);

  const goBackToDuaList = useCallback(() => {
    stopPlayback();
    stopListening();
    setCurrentDua(null);
    setCurrentScreen('duaList');
    setTranscription('');
    setDuaMessage('');
  }, [stopPlayback, stopListening]);

 const handlePlaybackEnd = useCallback((isManualStop: boolean = false) => {
    if (postRecitationActionInProgress.current) {
        postRecitationActionInProgress.current = false;
        startListening(true);
        return;
    }

    if (isWelcomeSequencePlaying.current) return;
    
    const wasPlayingSurah = !!currentSurah;
    const wasPlayingDua = !!currentDua;
    
    if (isManualStop) {
        stopPlayback();
        if (currentScreen === 'surah') {
          setMessage('ஓதுதல் நிறுத்தப்பட்டது. மீண்டும் கேட்க, மைக்ரோஃபோனை அழுத்தவும்.');
        } else if (currentScreen === 'duaPlayer') {
          goBackToDuaList();
        }
        setTranscription('');
        return;
    }

    if (currentScreen === 'surah' && wasPlayingSurah) {
        stopPlayback();
        postRecitationActionInProgress.current = true;
        const postRecitationMessage = 'ஓதுதல் முடிந்தது. அடுத்த சூராவின் பெயரைச் சொல்லுங்கள்.';
        setMessage(postRecitationMessage);

        if (audioRef.current) {
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(postRecitationMessage)}&tl=ta&client=tw-ob`;
            audioRef.current.src = ttsUrl;
            audioRef.current.play().catch(err => {
                console.error("Post-recitation TTS failed", err);
                postRecitationActionInProgress.current = false;
                startListening(true);
            });
        } else {
            postRecitationActionInProgress.current = false;
            startListening(true);
        }
    } else if (currentScreen === 'duaPlayer' && wasPlayingDua) {
        stopPlayback();
        // Automatically go back to the list after Dua finishes
        goBackToDuaList();
    }
  }, [stopPlayback, currentScreen, startListening, currentSurah, currentDua, goBackToDuaList]);
  
  const playSurah = useCallback(async (surahKey: string) => {
    const surah = surahDatabase[surahKey];
    if (surah) {
      stopPlayback();
      setCurrentSurah(surah.name);
      
      setMessage(`ஓதப்படுகிறது: சூரா ${surah.name}...`);
      if (audioRef.current) {
        audioRef.current.src = surah.audio;
        audioRef.current.play().catch(err => {
          console.error('Audio playback error:', err);
          setMessage('ஆடியோ கோப்பு கிடைக்கவில்லை. தயவுசெய்து ஆடியோ கோப்பைச் சேர்க்கவும்.');
        });
        audioRef.current.onplaying = () => setIsPlaying(true);
        
        playbackTimerRef.current = setTimeout(() => {
          if (audioRef.current && !audioRef.current.paused) {
            handlePlaybackEnd(false);
          }
        }, 60000);
      }
      
      setTimeout(() => {
        setMessage(`இப்போது ஓதப்படுவது: சூரா ${surah.name} (அத்தியாயம் ${surah.number})`);
      }, 500);
    } else {
      setMessage(`மன்னிக்கவும், அந்த சூராவை கண்டுபிடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.`);
    }
  }, [stopPlayback, handlePlaybackEnd]);

  const handleWelcomeCommand = useCallback((command: string) => {
    if (command.toLowerCase().includes('continue')) {
        setCurrentScreen('landing');
    }
  }, []);

  const handleVoiceCommand = useCallback((command: string) => {
    if (!command) return;

    let foundSurahKey: string | null = null;
    const surahKeys = Object.keys(surahDatabase).sort((a, b) => b.length - a.length);
    for (const key of surahKeys) {
      if (command.toLowerCase().includes(key) || command.toLowerCase().includes(key.replace(/-/g, ' '))) {
        foundSurahKey = key;
        break;
      }
    }
    if (foundSurahKey) {
        playSurah(foundSurahKey);
    } else {
        setMessage(`மன்னிக்கவும், அந்த சூராவை கண்டுபிடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.`);
    }
  }, [playSurah]);

  const playDua = useCallback((dua: Dua) => {
    stopPlayback();
    stopListening();
    
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(dua.arabic)}&tl=ar&client=tw-ob`;
    
    if (audioRef.current) {
      audioRef.current.src = ttsUrl;
      audioRef.current.play().catch(err => {
        console.error('TTS playback error:', err);
        setDuaMessage('ஆடியோவை இயக்க முடியவில்லை. பிணைய இணைப்பைச் சரிபார்க்கவும்.');
        setIsPlaying(false);
        setTimeout(() => goBackToDuaList(), 2000);
      });
      audioRef.current.onplaying = () => setIsPlaying(true);
    }
  }, [stopPlayback, stopListening, goBackToDuaList]);

  const selectDuaAndPlay = useCallback((dua: Dua) => {
    setCurrentDua(dua);
    setCurrentScreen('duaPlayer');
  }, []);

  const handleDuaRequest = useCallback((transcript: string) => {
    const foundDua = Object.values(duaDatabase).find(dua => 
      dua.keywords.some(keyword => transcript.toLowerCase().includes(keyword.toLowerCase()))
    );
    
    if (foundDua) {
      selectDuaAndPlay(foundDua);
    } else {
      setDuaMessage('மன்னிக்கவும், அந்த துவாவைக் கண்டுபிடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.');
    }
  }, [selectDuaAndPlay]);

  const handleLandingCommand = useCallback((command: string) => {
    const lowerCommand = command.toLowerCase().replace(/[.,?]/g, '').trim();
    
    const surahKeywords = ['சூரா', 'சுரா', 'surah'];
    const quizKeywords = ['வினாடி வினா', 'quiz', 'vinadi vina'];
    const duaKeywords = ['துஆ', 'துவா', 'dua'];

    const navigate = (screen: string) => {
        setFailedRecognitionAttempts(0);
        setCurrentScreen(screen);
    };

    if (surahKeywords.some(keyword => lowerCommand.includes(keyword))) {
        navigate('surah');
    } else if (quizKeywords.some(keyword => lowerCommand.includes(keyword))) {
        navigate('quizRules');
    } else if (duaKeywords.some(keyword => lowerCommand.includes(keyword))) {
        navigate('duaList');
    } else {
        const newAttemptCount = failedRecognitionAttempts + 1;
        setFailedRecognitionAttempts(newAttemptCount);
        
        stopListening();

        let errorMsg: string;
        let shouldListenAgain: boolean;

        if (newAttemptCount < 3) {
            errorMsg = "மன்னிக்கவும், எனக்குப் புரியவில்லை. மீண்டும் முயற்சிக்கவும்.";
            shouldListenAgain = true;
        } else {
            errorMsg = "மன்னிக்கவும், உங்கள் குரலை என்னால் கண்டறிய முடியவில்லை. திரையில் உள்ள பொத்தான்களைப் பயன்படுத்தவும்.";
            shouldListenAgain = false;
        }

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(errorMsg)}&tl=ta&client=tw-ob`;
        
        if (audioRef.current) {
            audioRef.current.src = ttsUrl;
            audioRef.current.play().catch(e => {
                console.error("Error TTS failed", e);
                if (shouldListenAgain) startListening();
            });
            audioRef.current.onended = () => {
                if (shouldListenAgain) startListening();
            }
        } else {
            if (shouldListenAgain) startListening();
        }
    }
  }, [startListening, stopListening, failedRecognitionAttempts]);

  useEffect(() => {
    if (currentScreen === 'welcome') {
      stopPlayback();
      const arabicGreeting = 'ٱلسَّلَامُ عَلَيْكُمْ';
      const tamilIntro = "நான் சித்திக்கா - உங்கள் இஸ்லாமிய ரோபோ தோழி. நாம் தொடங்கலாமா?";
      
      let cancelled = false;
      isWelcomeSequencePlaying.current = true;
      
      const playAudio = (text: string, lang: string, isLast: boolean = false) => {
          return new Promise<void>((resolve, reject) => {
              if (cancelled || !audioRef.current) {
                  return reject('cancelled or no audio element');
              }
              const audio = audioRef.current;
              const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
              
              const onEnded = () => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                  if (isLast) {
                      startListening(true);
                  }
                  if (!cancelled) resolve();
              };
              const onError = (e: any) => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                   if (isLast) {
                      // Fallback if audio fails to play, still start listening
                      startListening(true);
                  }
                  if (!cancelled) reject(e);
              };

              audio.src = ttsUrl;
              audio.addEventListener('ended', onEnded);
              audio.addEventListener('error', onError);
              audio.play().catch(onError);
          });
      };
      
      const startSequence = async () => {
          try {
              await playAudio(arabicGreeting, 'ar');
              if (cancelled) return;
              await playAudio(tamilIntro, 'ta', true);
          } catch (error) {
              if (!cancelled) {
                  console.warn("Welcome audio playback failed.", error);
              }
          } finally {
              if (!cancelled) {
                  isWelcomeSequencePlaying.current = false;
              }
          }
      };

      startSequence();

      return () => {
          cancelled = true;
          isWelcomeSequencePlaying.current = false;
          stopPlayback();
          stopListening();
      };
    }
  }, [currentScreen, stopPlayback, startListening, stopListening]);

  useEffect(() => {
    let cancelled = false;
    if (currentScreen === 'landing') {
      stopPlayback();
      setFailedRecognitionAttempts(0);
      
      const playAudio = (text: string, lang: string) => {
          return new Promise<void>((resolve, reject) => {
              if (cancelled || !audioRef.current) {
                  return reject('cancelled or no audio element');
              }
              const audio = audioRef.current;
              const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
              
              const onEnded = () => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                  if (!cancelled) resolve();
              };
              const onError = (e: any) => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                  if (!cancelled) reject(e);
              };

              audio.src = ttsUrl;
              audio.addEventListener('ended', onEnded);
              audio.addEventListener('error', onError);
              audio.play().catch(onError);
          });
      };
      
      const startSequence = async () => {
          try {
              const tamilGreeting = "இன்று நீங்கள் என்ன செய்ய விரும்புகிறீர்கள்?";
              const tamilChoice = "சூரா, வினாடி வினா, அல்லது துஆ?";
              await new Promise(resolve => setTimeout(resolve, 500)); // Delay for transition
              if (cancelled) return;
              await playAudio(tamilGreeting, 'ta');
              if (cancelled) return;
              await playAudio(tamilChoice, 'ta');
              if (cancelled) return;
              startListening();
          } catch (error) {
              if (!cancelled) {
                  console.warn("Landing screen audio playback failed.", error);
              }
          }
      };

      startSequence();

      return () => {
          cancelled = true;
          stopPlayback();
      };
    }
  }, [currentScreen, stopPlayback, startListening]);
  
  useEffect(() => {
    if (currentScreen === 'quizRules') {
        stopPlayback(); // Stop any previous sound

        const rulesTitle = "வினாடி வினா விதிகள்.";
        const rules = [
            'ஒன்று: 5 கேள்விகள் கேட்கப்படும் மற்றும் ஒவ்வொன்றிற்கும் ஒரு சரியான பதில் உள்ளது.',
            'இரண்டு: எந்தவொரு கேள்விக்கும் உங்களுக்கு அதிகபட்சம் மூன்று முயற்சிகள் வழங்கப்படும்.',
            'மூன்று: 5வது கேள்விக்குப் பிறகு மதிப்பெண் அட்டை வழங்கப்படும்.',
            'நான்கு: நீங்கள் விருப்பத்தை கிளிக் செய்யலாம் அல்லது "ஆப்ஷன் 1" என்று கூறலாம்.'
        ];
        
        const audioQueue = [rulesTitle, ...rules];
        let cancelled = false;

        const playQueue = async () => {
            if (!audioRef.current) return;
            const audio = audioRef.current;

            for (const text of audioQueue) {
                if (cancelled) break;
                await new Promise<void>((resolve, reject) => {
                    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ta&client=tw-ob`;
                    
                    const onEnded = () => {
                        audio.removeEventListener('ended', onEnded);
                        audio.removeEventListener('error', onError);
                        if (!cancelled) resolve();
                    };
                    const onError = (e: any) => {
                        audio.removeEventListener('ended', onEnded);
                        audio.removeEventListener('error', onError);
                        console.error("Quiz rules audio chunk failed", e);
                        if (!cancelled) reject(e); // Stop on failure
                    };

                    audio.src = ttsUrl;
                    audio.addEventListener('ended', onEnded);
                    audio.addEventListener('error', onError);
                    audio.play().catch(onError);
                });
            }
        };
        
        playQueue().catch(err => {
            if (!cancelled) {
                console.error("Failed to play all quiz rules.", err);
            }
        });

        return () => {
            cancelled = true;
            stopPlayback(false);
        };
    }
  }, [currentScreen, stopPlayback]);

  useEffect(() => {
      let cancelled = false;
      if (currentScreen === 'surah' || currentScreen === 'duaList') {
          stopPlayback();
          const instructionText = currentScreen === 'surah' 
            ? "நீங்கள் கேட்க விரும்பும் சூராவின் பெயரைச் சொல்லுங்கள்"
            : "நீங்கள் கேட்க விரும்பும் துஆவைத் தேர்ந்தெடுக்கவும் அல்லது அதன் பெயரைச் சொல்லவும்";

          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(instructionText)}&tl=ta&client=tw-ob`;

          if (audioRef.current) {
              const audio = audioRef.current;
              const onEnded = () => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                  if (!cancelled) startListening(true);
              };
              const onError = (e: any) => {
                  audio.removeEventListener('ended', onEnded);
                  audio.removeEventListener('error', onError);
                  console.error("Instructional audio failed", e);
                  if (!cancelled) startListening(true); // Fallback
              };

              audio.src = ttsUrl;
              audio.addEventListener('ended', onEnded);
              audio.addEventListener('error', onError);
              audio.play().catch(onError);
          }

          return () => {
              cancelled = true;
              if (audioRef.current && audioRef.current.src === ttsUrl) {
                  stopPlayback(false);
              }
          };
      }
  }, [currentScreen, startListening, stopPlayback]);

  useEffect(() => {
    if (currentScreen === 'duaPlayer' && currentDua) {
        playDua(currentDua);
    }
  }, [currentScreen, currentDua, playDua]);


  useEffect(() => {
    if (['quiz', 'quizRules', 'initial', 'duaPlayer'].includes(currentScreen)) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
       // Don't nullify for quizRules as it might be needed by the audio playback effect
      if (['quiz', 'initial'].includes(currentScreen)) {
          recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
      }

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        setTranscription(transcript);
        
        if (currentScreen === 'welcome') handleWelcomeCommand(transcript);
        else if (currentScreen === 'surah') handleVoiceCommand(transcript);
        else if (currentScreen === 'duaList') handleDuaRequest(transcript);
        else if (currentScreen === 'landing') handleLandingCommand(transcript);
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error, event.message);
        setIsListening(false);
        
        if (currentScreen === 'landing' && (event.error === 'no-speech' || event.error === 'audio-capture')) {
            handleLandingCommand(''); // Trigger retry logic
            return;
        }

        let errorMessage = 'மன்னிக்கவும், எனக்குப் புரியவில்லை. மீண்டும் முயற்சிக்கவும்.';
        if (event.error !== 'aborted') {
          switch (event.error) {
            case 'network':
              errorMessage = 'ஒரு நெட்வொர்க் பிழை ஏற்பட்டது. உங்கள் இணைய இணைப்பைச் சரிபார்க்கவும்.';
              break;
            case 'no-speech':
              errorMessage = 'நான் எதுவும் கேட்கவில்லை. தயவுசெய்து மீண்டும் பேச முயற்சிக்கவும்.';
              break;
            case 'not-allowed':
            case 'service-not-allowed':
              errorMessage = 'மைக்ரோஃபோன் அணுகல் மறுக்கப்பட்டது. உங்கள் உலாவி அமைப்புகளில் அதை இயக்கவும்.';
              break;
          }
        }
        if (currentScreen === 'duaList') setDuaMessage(errorMessage);
        else if (currentScreen === 'surah') setMessage(errorMessage);
      };

      recognitionRef.current.onend = () => setIsListening(false);
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [currentScreen, handleVoiceCommand, handleDuaRequest, handleLandingCommand, handleWelcomeCommand]);

  const goBack = useCallback(() => {
    stopPlayback();
    stopListening();
    setCurrentScreen('landing');
    setTranscription('');
    setMessage('');
    setDuaMessage('');
    setCurrentDua(null);
    setIsListening(false);
  }, [stopPlayback, stopListening]);
  
  const uniqueSurahs = useMemo(() => {
    const seenNumbers = new Set<number>();
    const result: (Surah & { key: string })[] = [];
    for (const [key, surah] of Object.entries(surahDatabase)) {
        if (!seenNumbers.has(surah.number)) {
            seenNumbers.add(surah.number);
            result.push({ ...surah, key });
        }
    }
    return result.sort((a, b) => a.number - b.number);
  }, []);

  const renderInitialScreen = () => (
    <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 fade-in">
       <h1 className="text-5xl md:text-6xl font-bold text-amber-100 mb-2 tracking-wide">Siddiqah</h1>
       <p className="text-xl text-emerald-200 mb-12 font-semibold">Your Islamic Robot Friend</p>
      <button 
        onClick={() => setCurrentScreen('welcome')}
        className="bg-amber-400 text-emerald-900 font-bold py-4 px-12 rounded-full text-2xl shadow-lg hover:bg-amber-300 transition-all duration-300 transform hover:scale-105"
      >
        Start
      </button>
    </div>
  );

  const renderWelcomeScreen = () => (
    <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 relative fade-in">
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <div className="w-64 h-64 border-4 border-amber-400 rounded-full animate-pulse"></div>
      </div>
      <div className="flex-grow flex flex-col items-center justify-center">
        <h1 className="text-7xl md:text-8xl font-bold text-amber-100 mb-4 tracking-wide font-arabic">ٱلسَّلَامُ عَلَيْكُمْ</h1>
        <p className="text-4xl md:text-5xl font-semibold text-emerald-100 mb-2 tracking-wide">Assalamu Alaikum</p>
        <p className="text-2xl text-emerald-200 font-light tracking-wider">Peace be upon you</p>
        <p className="text-2xl text-emerald-200 font-light tracking-wider font-tamil mt-2">உங்கள் மீது சாந்தி உண்டாவதாக</p>
        <p className="text-xl text-emerald-100 mt-8 font-tamil">நான் சித்திக்கா - உங்கள் இஸ்லாமிய ரோபோ தோழி. நாம் தொடங்கலாமா?</p>
        
        <div className="mt-8 h-20 flex flex-col items-center justify-center">
           {isListening ? (
             <div className="flex flex-col items-center justify-center text-amber-200 fade-in">
                <div className="flex items-center gap-3">
                    <Mic className="text-red-400 animate-pulse" />
                    <span>Listening for "Continue"...</span>
                </div>
                <p className="mt-2 text-emerald-100 min-h-[24px] italic">{transcription || ' '}</p>
             </div>
           ) : (
             <p className="text-lg text-amber-200 font-tamil">தொடர 'Continue' என்று கூறவும்.</p>
           )}
        </div>
      </div>
      <div className="w-full flex justify-end mt-4">
        <button 
          onClick={() => setCurrentScreen('landing')} 
          className="bg-amber-400 text-emerald-900 font-bold py-3 px-6 rounded-full text-lg shadow-lg hover:bg-amber-300 transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
        >
          Continue <ArrowRight size={22} />
        </button>
      </div>
    </div>
  );
  
  const renderLandingScreen = () => (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center p-4">
      <button 
        onClick={() => setCurrentScreen('welcome')} 
        className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors"
      >
        <ArrowLeft size={20} /> 
        <div className="text-left">
            <span>Back</span>
            <div className="font-tamil text-xs font-normal opacity-80 -mt-1">பின் செல்</div>
        </div>
      </button>
      <div className="text-center space-y-12 fade-in">
        <div>
          <p className="text-3xl text-amber-200 font-semibold">What would you like to do today?</p>
          <p className="text-xl text-amber-100 font-tamil mt-2">இன்று நீங்கள் என்ன செய்ய விரும்புகிறீர்கள்?</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-6 max-w-6xl mx-auto mt-12 justify-center sm:items-stretch">
          
          <button onClick={() => setCurrentScreen('surah')} className="group flex flex-col text-center bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white p-8 rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-105 w-full sm:w-1/3">
            <div className="flex-grow">
              <Volume2 className="w-16 h-16 mx-auto mb-4 group-hover:animate-bounce" />
              <h3 className="text-2xl font-bold">Play a Surah</h3>
              <p className="font-tamil text-base text-emerald-100 mb-4">சூராவை ஓதவும்</p>
            </div>
            <div>
                <p className="text-emerald-200 text-sm leading-tight">Listen to Quranic recitations</p>
                <p className="font-tamil text-xs text-emerald-200">குர்ஆன் ஓதுதலைக் கேளுங்கள்</p>
            </div>
          </button>

          <button onClick={() => setCurrentScreen('quizRules')} className="group flex flex-col text-center bg-gradient-to-br from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white p-8 rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-105 w-full sm:w-1/3">
             <div className="flex-grow">
              <Brain className="w-16 h-16 mx-auto mb-4 group-hover:animate-bounce" />
              <h3 className="text-2xl font-bold">Start a Quiz</h3>
              <p className="font-tamil text-base text-teal-100 mb-4">வினாடி வினா தொடங்க</p>
            </div>
            <div>
              <p className="text-teal-200 text-sm leading-tight">Test your Islamic knowledge</p>
              <p className="font-tamil text-xs text-teal-200">உங்கள் இஸ்லாமிய அறிவை சோதிக்கவும்</p>
            </div>
          </button>

          <button onClick={() => setCurrentScreen('duaList')} className="group flex flex-col text-center bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white p-8 rounded-2xl shadow-2xl transform transition-all duration-300 hover:scale-105 w-full sm:w-1/3">
            <div className="flex-grow">
              <div className="w-16 h-16 mx-auto mb-4 group-hover:animate-bounce text-5xl flex items-center justify-center">🤲</div>
              <h3 className="text-2xl font-bold">Play a Dua</h3>
              <p className="font-tamil text-base text-cyan-100 mb-4">துஆவைக் கேட்கவும்</p>
            </div>
            <div>
              <p className="text-cyan-200 text-sm leading-tight">Listen to beautiful supplications</p>
              <p className="font-tamil text-xs text-cyan-200">அழகான பிரார்த்தனைகளைக் கேளுங்கள்</p>
            </div>
          </button>
        </div>
      </div>
      <div className="absolute bottom-10 flex flex-col items-center justify-center">
        {isListening && (
          <div className="flex items-center gap-3 text-amber-200 fade-in">
            <Mic className="text-red-400 animate-pulse" />
            <span>Listening...</span>
          </div>
        )}
        <p className="mt-2 text-emerald-100 min-h-[24px] italic">{transcription}</p>
      </div>
    </div>
  );

  const renderSurahScreen = () => (
    <div className="relative w-full h-screen text-center flex flex-col items-center justify-start p-6">
       <button onClick={goBack} className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors"><ArrowLeft size={20} /> பின் செல்</button>

      <div className="w-full max-w-7xl mx-auto flex flex-col items-center flex-shrink-0">
        <h1 className="text-4xl sm:text-5xl font-bold text-amber-200 mb-2 font-tamil">{currentSurah || 'சூராவை ஓதவும்'}</h1>
        <p className="text-lg text-emerald-200 mb-4 max-w-xl min-h-[56px] transition-all font-tamil">
          {message || 'பட்டியலில் இருந்து ஒரு சூராவைத் தேர்ந்தெடுக்கவும் அல்லது அதன் பெயரைச் சொல்லவும்.'}
        </p>
      </div>
      
      <div className="w-full max-w-7xl mx-auto flex-1 overflow-y-auto mb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {uniqueSurahs.map((surah) => (
                <button
                  key={surah.key}
                  onClick={() => playSurah(surah.key)}
                  className="bg-black/20 hover:bg-white/20 text-emerald-100 font-medium p-3 rounded-xl transition-colors duration-200 text-center h-28 flex flex-col items-center justify-center"
                >
                  <span className="text-amber-300 font-bold text-2xl">{surah.number}</span>
                  <span className="mt-1 text-sm">{surah.name}</span>
                </button>
              ))}
          </div>
      </div>
      
      <div className="w-full flex flex-col items-center flex-shrink-0">
        <div className="h-16 flex items-center justify-center space-x-1.5">
          {isPlaying && currentSurah && Array(5).fill(0).map((_, i) => <div key={i} className={`w-1.5 h-16 bg-emerald-300 rounded-full animate-wave`} style={{ animationDelay: `${i * 0.1}s` }} />)}
        </div>
        <button 
          onClick={isPlaying ? () => handlePlaybackEnd(true) : () => startListening(true)}
          className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 mt-6 ${isListening ? 'bg-red-500 animate-pulse' : (isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-400 hover:bg-amber-500')}`}
        >
          {isPlaying ? <Square size={40} className="text-white" /> : <Mic size={40} className="text-emerald-900" />}
        </button>
        <p className="mt-6 text-emerald-100 min-h-[24px]">{transcription}</p>
      </div>
    </div>
  );
  
 const renderDuaListScreen = () => (
    <div className="relative w-full text-center flex flex-col items-center justify-center min-h-screen p-4 font-tamil">
      <button onClick={goBack} className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors"><ArrowLeft size={20} /> பின் செல்</button>
      
      <div className="w-full max-w-7xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-amber-200 mb-2">துஆ பட்டியல்கள்</h1>
        <p className="text-lg text-emerald-200 mb-8 max-w-xl min-h-[28px]">
          {duaMessage || 'நீங்கள் கேட்க விரும்பும் துஆவைத் தேர்ந்தெடுக்கவும் அல்லது அதன் பெயரைச் சொல்லவும்.'}
        </p>
        
        <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Object.values(duaDatabase).map((dua) => (
            <button
              key={dua.name}
              onClick={() => selectDuaAndPlay(dua)}
              className="bg-black/20 hover:bg-white/20 text-emerald-100 font-medium p-4 rounded-xl transition-colors duration-200 text-center h-28 flex items-center justify-center"
            >
              {dua.name}
            </button>
          ))}
        </div>
      </div>
      
      <div className="absolute bottom-10 flex flex-col items-center justify-center">
        <button 
          onClick={() => startListening(true)}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-amber-400 hover:bg-amber-500'}`}
        >
          <Mic size={32} className="text-emerald-900" />
        </button>
        <p className="mt-4 text-emerald-100 min-h-[24px]">{transcription}</p>
      </div>
    </div>
  );

  const renderDuaPlayerScreen = () => {
    if (!currentDua) return null;

    return (
      <div className="relative w-full text-center flex flex-col items-center justify-center min-h-screen p-4 font-tamil fade-in">
        <button onClick={goBackToDuaList} className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors"><ArrowLeft size={20} /> பின் செல்</button>

        <div className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl">
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-200 mb-6">{currentDua.name}</h1>
            
            <div className="bg-black/20 p-8 rounded-2xl shadow-xl w-full">
              <p dir="rtl" className="text-4xl md:text-5xl font-arabic text-amber-100 leading-relaxed text-right mb-4">
                {currentDua.arabic}
              </p>
              <hr className="border-emerald-600 my-6" />
              <p className="text-lg text-emerald-100 text-left">{currentDua.translationTamil}</p>
            </div>
        </div>
        
        <div className="w-full flex flex-col items-center mt-6">
          <div className="my-4 h-16 flex items-center justify-center space-x-1.5">
            {isPlaying && currentDua && Array(5).fill(0).map((_, i) => <div key={i} className={`w-1.5 h-16 bg-emerald-300 rounded-full animate-wave`} style={{ animationDelay: `${i * 0.1}s` }} />)}
          </div>

          <button 
            onClick={() => handlePlaybackEnd(true)}
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 bg-red-600 hover:bg-red-700`}
          >
            <Square size={40} className="text-white" />
          </button>
          <p className="mt-6 text-emerald-100 min-h-[24px]">ஓதுவதை நிறுத்த</p>
        </div>
      </div>
    );
  };
  
  const renderQuizRulesScreen = () => {
    const rules = [
        { id: 1, en: '5 questions will be asked and each has one correct answer.', ta: '5 கேள்விகள் கேட்கப்படும் மற்றும் ஒவ்வொன்றிற்கும் ஒரு சரியான பதில் உள்ளது.' },
        { id: 2, en: 'You will be given a maximum of three attempts for any question.', ta: 'எந்தவொரு கேள்விக்கும் உங்களுக்கு அதிகபட்சம் மூன்று முயற்சிகள் வழங்கப்படும்.' },
        { id: 3, en: 'You will get a score card at the end of the 5th question.', ta: '5வது கேள்விக்குப் பிறகு மதிப்பெண் அட்டை வழங்கப்படும்.' },
        { id: 4, en: 'You can either click the option or say "Option 1".', ta: 'நீங்கள் விருப்பத்தை கிளிக் செய்யலாம் அல்லது "ஆப்ஷன் 1" என்று கூறலாம்.' },
    ];

    return (
        <div className="relative w-full min-h-screen flex flex-col items-center justify-center p-6 fade-in">
            <button onClick={goBack} className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors">
                <ArrowLeft size={20} /> 
                <div className="text-left">
                    <span>Back</span>
                    <div className="font-tamil text-xs font-normal opacity-80 -mt-1">பின் செல்</div>
                </div>
            </button>
            
            <div className="text-center mb-8">
                <h1 className="text-4xl sm:text-5xl font-bold text-amber-200">Quiz Rules</h1>
                <h2 className="text-3xl font-tamil text-emerald-200 mt-2">வினாடி வினா விதிகள்</h2>
            </div>

            <div className="bg-black/20 p-8 rounded-3xl shadow-2xl w-full max-w-3xl">
                <ul className="space-y-6">
                    {rules.map(rule => (
                        <li key={rule.id} className="flex items-start gap-4">
                            <div className="flex-shrink-0 bg-amber-400 text-emerald-900 rounded-full w-8 h-8 flex items-center justify-center font-bold text-xl">
                                {rule.id}
                            </div>
                            <div>
                                <p className="text-xl text-white">{rule.en}</p>
                                <p className="text-lg text-emerald-200 font-tamil mt-1">{rule.ta}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            
            <button
                onClick={() => setCurrentScreen('quiz')}
                className="mt-10 bg-amber-400 text-emerald-900 font-bold py-4 px-12 rounded-full text-2xl shadow-lg hover:bg-amber-300 transition-all duration-300 transform hover:scale-105 font-tamil"
            >
                வினாடி வினாவைத் தொடங்கு
            </button>
        </div>
    );
  };


  const renderScreen = () => {
    switch (currentScreen) {
      case 'initial':
        return renderInitialScreen();
      case 'welcome':
        return renderWelcomeScreen();
      case 'surah':
        return renderSurahScreen();
      case 'quizRules':
        return renderQuizRulesScreen();
      case 'quiz':
        return <QuizScreen goBack={goBack} />;
      case 'duaList':
        return renderDuaListScreen();
      case 'duaPlayer':
        return renderDuaPlayerScreen();
      case 'landing':
      default:
        return renderLandingScreen();
    }
  };

  return (
    <div className="bg-emerald-900 text-white min-h-screen flex items-center justify-center p-4">
      {renderScreen()}
      <audio ref={audioRef} onEnded={() => handlePlaybackEnd(false)} />
    </div>
  );
};

export default App;
