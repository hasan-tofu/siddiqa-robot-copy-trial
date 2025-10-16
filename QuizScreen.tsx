import React, { useState, useEffect, useRef, FC, useCallback } from 'react';
import { quizQuestions } from '../constants';
import { QuizQuestion } from '../types';
import { ArrowLeft, Trophy, Mic, Heart, Volume2 } from 'lucide-react';

interface QuizScreenProps {
  goBack: () => void;
}

const Confetti: FC = () => {
  const confettiCount = 50;
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: confettiCount }).map((_, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${Math.random() * 100}%`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${3 + Math.random() * 2}s`,
            width: `${Math.floor(Math.random() * (12 - 6 + 1) + 6)}px`,
            height: `${Math.floor(Math.random() * (12 - 6 + 1) + 6)}px`,
          }}
        />
      ))}
    </div>
  );
};

export const QuizScreen: FC<QuizScreenProps> = ({ goBack }) => {
  const [gameState, setGameState] = useState<'playing' | 'finished'>('playing');
  const [sessionQuestions, setSessionQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [isScored, setIsScored] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [questionTrigger, setQuestionTrigger] = useState(0);

  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isMountedRef = useRef(true);
  const startListeningRef = useRef<(() => void) | null>(null);
  const resultProcessedRef = useRef(false);

  const stopAllActivity = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
    }
    if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.src = '';
    }
    if (isMountedRef.current) {
        setStatus('idle');
    }
  }, []);

  const proceedToNext = useCallback(() => {
    stopAllActivity();
    if (currentQuestionIndex < sessionQuestions.length - 1) {
      setCurrentQuestionIndex(i => i + 1);
      setQuestionTrigger(t => t + 1); // Use a new trigger to reset the question state
    } else {
      if(isMountedRef.current) setGameState('finished');
    }
  }, [stopAllActivity, currentQuestionIndex, sessionQuestions.length]);

  const startListening = useCallback(() => {
    if (!isMountedRef.current || !recognitionRef.current || status !== 'idle' || selectedAnswer !== null) return;
    resultProcessedRef.current = false;
    setTranscript('');
    setStatus('listening');
    try {
      recognitionRef.current.start();
    } catch (e) {
      if (isMountedRef.current) setStatus('idle');
    }
  }, [status, selectedAnswer]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const playFeedbackAudio = useCallback((type: 'correct' | 'incorrect' | 'final_incorrect') => {
    if (!audioRef.current) return;
    
    stopAllActivity();
    setStatus('speaking');

    let text = '';
    const currentQ = sessionQuestions[currentQuestionIndex];
    const correctOptionText = currentQ.options[currentQ.correctAnswer];

    if (type === 'correct') {
      if (currentQuestionIndex === sessionQuestions.length - 1) {
        text = 'சரியான பதில்';
      } else {
        text = 'சரியான பதில். அடுத்த கேள்விக்கு தயாராகுங்கள்';
      }
    } else if (type === 'incorrect') {
      text = 'தவறான பதில், மீண்டும் முயற்சிக்கவும்';
    } else if (type === 'final_incorrect') {
      text = `தவறான பதில். சரியான பதில், ${correctOptionText}`;
    }

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ta&client=tw-ob`;
    const audio = audioRef.current;

    const onAudioEnd = () => {
        audio.onended = null;
        audio.onerror = null;
        if (!isMountedRef.current) return;

        if (type === 'correct') {
            timeoutRef.current = setTimeout(proceedToNext, 1000);
        } else if (type === 'incorrect') {
            setSelectedAnswer(null);
            setIsCorrect(null);
            setStatus('idle');
            timeoutRef.current = setTimeout(() => {
                if (isMountedRef.current && startListeningRef.current) {
                  startListeningRef.current();
                }
            }, 100);
        } else if (type === 'final_incorrect') {
            timeoutRef.current = setTimeout(proceedToNext, 2000);
        }
    };
    
    const onAudioError = (e: any) => {
        console.error("Feedback audio failed", e);
        onAudioEnd(); // Still proceed even if audio fails
    };

    audio.src = ttsUrl;
    audio.onended = onAudioEnd;
    audio.onerror = onAudioError;
    audio.play().catch(onAudioError);

  }, [stopAllActivity, proceedToNext, sessionQuestions, currentQuestionIndex]);

  const handleSelectAnswer = useCallback((index: number) => {
    if (selectedAnswer !== null) return;
    
    stopAllActivity();
    setSelectedAnswer(index);
    const question = sessionQuestions[currentQuestionIndex];
    const isAnswerCorrect = index === question.correctAnswer;
    setIsCorrect(isAnswerCorrect);

    if (isAnswerCorrect) {
      if (!isScored) {
        setScore(s => s + 1);
        setIsScored(true);
      }
      playFeedbackAudio('correct');
    } else {
      const newAttemptsLeft = attemptsLeft - 1;
      setAttemptsLeft(newAttemptsLeft);
      if (newAttemptsLeft > 0) {
        playFeedbackAudio('incorrect');
      } else {
        playFeedbackAudio('final_incorrect');
      }
    }
  }, [stopAllActivity, selectedAnswer, sessionQuestions, currentQuestionIndex, isScored, playFeedbackAudio, attemptsLeft]);

  const playQuestionAudio = useCallback((question: QuizQuestion) => {
    if (!question || !audioRef.current) return;

    stopAllActivity();
    setStatus('speaking');

    const fullText = question.question;
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(fullText)}&tl=ta&client=tw-ob`;
    const audio = audioRef.current;
    
    const onAudioEnd = () => {
        audio.onended = null;
        audio.onerror = null;
        if (!isMountedRef.current) return;
        setStatus('idle');
        setTimeout(() => {
            if (isMountedRef.current && startListeningRef.current) {
                startListeningRef.current();
            }
        }, 100); // Small delay to ensure state updates
    };

    const onAudioError = (e: any) => {
        console.error("Quiz audio playback failed", e);
        onAudioEnd();
    };

    audio.src = ttsUrl;
    audio.onended = onAudioEnd;
    audio.onerror = onAudioError;
    audio.play().catch(onAudioError);
  }, [stopAllActivity]);
  
  const handleRecognitionFailure = useCallback(() => {
    if (selectedAnswer !== null || !isMountedRef.current) return;
    stopAllActivity();

    const newAttemptsLeft = attemptsLeft - 1;
    setAttemptsLeft(newAttemptsLeft);

    if (newAttemptsLeft > 0) {
      if (!audioRef.current) return;
      setStatus('speaking');
      
      const text = 'மன்னிக்கவும், எனக்கு சரியாக கேட்கவில்லை. மீண்டும் முயற்சிக்கவும்.';
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ta&client=tw-ob`;
      const audio = audioRef.current;

      const onAudioEnd = () => {
          audio.onended = null;
          audio.onerror = null;
          if (!isMountedRef.current) return;
          setStatus('idle');
          timeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && startListeningRef.current) {
                startListeningRef.current();
              }
          }, 100);
      };
      
      const onAudioError = (e: any) => {
          console.error("Recognition failure feedback audio failed", e);
          onAudioEnd();
      };

      audio.src = ttsUrl;
      audio.onended = onAudioEnd;
      audio.onerror = onAudioError;
      audio.play().catch(onAudioError);
    } else {
      playFeedbackAudio('final_incorrect');
    }
  }, [selectedAnswer, stopAllActivity, attemptsLeft, playFeedbackAudio]);

  const startNewQuiz = useCallback(() => {
    stopAllActivity();
    const shuffled = [...quizQuestions].sort(() => 0.5 - Math.random());
    setSessionQuestions(shuffled.slice(0, 5));
    setCurrentQuestionIndex(0);
    setQuestionTrigger(0);
    setScore(0);
    setGameState('playing');
  }, [stopAllActivity]);
  
  useEffect(() => {
    isMountedRef.current = true;
    startNewQuiz();
    return () => { 
      isMountedRef.current = false; 
      stopAllActivity(); 
    };
  }, [startNewQuiz, stopAllActivity]);


  useEffect(() => {
    if (gameState === 'playing' && sessionQuestions.length > 0) {
        const question = sessionQuestions[currentQuestionIndex];
        if (question) {
            setSelectedAnswer(null);
            setIsCorrect(null);
            setTranscript('');
            setAttemptsLeft(3);
            setIsScored(false);
            playQuestionAudio(question);
        }
    }
  }, [gameState, currentQuestionIndex, questionTrigger, sessionQuestions, playQuestionAudio]);
  
  useEffect(() => {
      if (gameState === 'finished' && sessionQuestions.length > 0 && audioRef.current) {
          stopAllActivity();
          setStatus('speaking');

          const scorePercent = Math.round((score / sessionQuestions.length) * 100);
          const fullText = `நீங்கள் ${scorePercent} சதவீதம் மதிப்பெண் பெற்றுள்ளீர்கள். வாழ்த்துக்கள்!`;

          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(fullText)}&tl=ta&client=tw-ob`;
          const audio = audioRef.current;
          
          const onAudioEnd = () => {
              if (isMountedRef.current) setStatus('idle');
              audio.onended = null;
              audio.onerror = null;
          };

          audio.src = ttsUrl;
          audio.onended = onAudioEnd;
          audio.onerror = (e) => {
              console.error("Scorecard audio failed", e);
              onAudioEnd();
          };

          // Use a timeout to ensure playback starts after the state transition is fully processed.
          // This helps avoid race conditions and potential browser autoplay restrictions.
          const playbackTimeout = setTimeout(() => {
            if (audioRef.current && isMountedRef.current) {
              audio.play().catch(audio.onerror);
            }
          }, 200);

          return () => {
            clearTimeout(playbackTimeout);
          };
      }
  }, [gameState, score, sessionQuestions, stopAllActivity]);

  const playInvalidAnswerFeedback = useCallback(() => {
    if (!audioRef.current) return;
    
    stopAllActivity();
    setStatus('speaking');

    const text = "பதிலளிக்க 'ஆப்ஷன் ஒன்று' அல்லது 'ஆப்ஷன் 1' என்பது போன்று கூறவும்.";

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ta&client=tw-ob`;
    const audio = audioRef.current;

    const onAudioEnd = () => {
        audio.onended = null;
        audio.onerror = null;
        if (!isMountedRef.current) return;
        setStatus('idle');
        timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && startListeningRef.current) {
              startListeningRef.current();
            }
        }, 100);
    };
    
    const onAudioError = (e: any) => {
        console.error("Invalid feedback audio failed", e);
        onAudioEnd(); // Still proceed
    };

    audio.src = ttsUrl;
    audio.onended = onAudioEnd;
    audio.onerror = onAudioError;
    audio.play().catch(onAudioError);

  }, [stopAllActivity]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
      
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'ta-IN';

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        if (!isMountedRef.current || selectedAnswer !== null) return;
        resultProcessedRef.current = true;
        const recognizedText = event.results[0][0].transcript;
        setTranscript(`நீங்கள் கூறியது: ${recognizedText}`);
        
        const cleanTranscript = recognizedText.trim().replace(/[.,?]/g, '');
        const lowerCleanTranscript = cleanTranscript.toLowerCase();
        
        if (lowerCleanTranscript === 'option' || cleanTranscript === 'ஆப்ஷன்') {
            handleRecognitionFailure();
            return;
        }
        
        const currentQ = sessionQuestions[currentQuestionIndex];
        if (!currentQ) return;
        
        let answerIndex = -1;

        const hasOne = lowerCleanTranscript.includes('one') || cleanTranscript.includes('ஒன்று') || cleanTranscript.includes('1');
        const hasTwo = lowerCleanTranscript.includes('two') || cleanTranscript.includes('இரண்டு') || cleanTranscript.includes('2');
        const hasThree = lowerCleanTranscript.includes('three') || cleanTranscript.includes('மூன்று') || cleanTranscript.includes('3');
        const hasFour = lowerCleanTranscript.includes('four') || cleanTranscript.includes('நான்கு') || cleanTranscript.includes('4');

        if (hasOne) {
            answerIndex = 0;
        } else if (hasTwo) {
            answerIndex = 1;
        } else if (hasThree) {
            answerIndex = 2;
        } else if (hasFour) {
            answerIndex = 3;
        }
        
        if (answerIndex > -1) {
            handleSelectAnswer(answerIndex);
        } else {
            playInvalidAnswerFeedback();
        }
    };

    recognitionRef.current.onend = () => {
        // This handler is the single source of truth for ending a listening session.
        // It runs after onresult or onerror.
        if (isMountedRef.current && status === 'listening') {
            if (!resultProcessedRef.current) {
                // No result was processed, so it's a timeout or error.
                handleRecognitionFailure();
            } else {
                // A result was processed, so we just transition back to idle.
                setStatus('idle');
            }
        }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error, event.message);
        // We simply log the error and do NOT change any state.
        // This prevents a race condition with the onend event.
        // The onend event will fire regardless and will correctly determine
        // if a result was processed or not. If an error occurred, onresult
        // will not have fired, `resultProcessedRef` will be false, and
        // onend will correctly call `handleRecognitionFailure`.
    };

  }, [handleSelectAnswer, selectedAnswer, status, sessionQuestions, currentQuestionIndex, playInvalidAnswerFeedback, handleRecognitionFailure]);
  
  const handleGoBack = () => { stopAllActivity(); goBack(); }

  const scorePercent = sessionQuestions.length > 0 ? Math.round((score / sessionQuestions.length) * 100) : 0;
  if (gameState === 'finished') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900 to-green-900 font-tamil p-4 relative overflow-hidden">
        {scorePercent >= 75 && <Confetti />}
        <div className="text-center bg-black/20 p-10 rounded-3xl shadow-2xl backdrop-blur-sm relative z-10 flex flex-col items-center">
          <Trophy className={`w-24 h-24 mx-auto mb-4 ${scorePercent >= 75 ? 'text-yellow-400' : 'text-emerald-400'}`} />
          <h1 className="text-2xl font-bold text-white mb-2">வினாடி வினா முடிந்தது!</h1>
          <p className="text-8xl font-bold text-white mb-4">{scorePercent}<span className="text-5xl opacity-70">%</span></p>
          <p className="text-xl text-gray-300 mb-2">உங்கள் மதிப்பெண்: {score} / {sessionQuestions.length}</p>
          <p className="text-2xl text-amber-200 mb-8">{scorePercent >= 75 ? '🎉 வாழ்த்துக்கள்! சிறப்பாக செய்தீர்கள்!' : '🤔 நன்றாக முயற்சித்தீர்கள்!'}</p>
          <div className="flex gap-4">
            <button onClick={startNewQuiz} className="bg-amber-400 text-emerald-900 font-bold text-xl py-3 px-8 rounded-2xl transition-transform duration-300 hover:scale-105">மீண்டும் விளையாடு</button>
            <button onClick={handleGoBack} className="bg-white/10 text-white font-bold text-xl py-3 px-8 rounded-2xl transition-transform duration-300 hover:scale-105">முகப்பு</button>
          </div>
        </div>
      </div>
    );
  }
  
  const currentQ = sessionQuestions[currentQuestionIndex];
  if (!currentQ) return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white text-2xl font-tamil">
          வினாடி வினா ஏற்றப்படுகிறது...
      </div>
  );

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-between bg-gradient-to-br from-emerald-900 to-green-900 font-tamil p-6">
      <audio ref={audioRef} />
      <div className="w-full max-w-4xl mx-auto flex flex-col flex-grow">
        <div className="flex items-center justify-between w-full mb-4">
          <button onClick={handleGoBack} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-full transition-colors"><ArrowLeft size={20} /> முகப்பு</button>
          <div className="flex items-center gap-2 text-red-400">
            {Array.from({ length: attemptsLeft }).map((_, i) => <Heart key={i} fill="currentColor" className="w-6 h-6"/>)}
          </div>
          <div className="text-lg font-bold text-white">{currentQuestionIndex + 1} / {sessionQuestions.length}</div>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2.5 mb-6"><div className="bg-yellow-400 h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / sessionQuestions.length) * 100}%` }}></div></div>

        <div key={currentQuestionIndex} className="relative bg-black/20 p-8 rounded-3xl shadow-2xl backdrop-blur-sm mb-6 text-center fade-in">
          {status === 'speaking' && (
            <Volume2 className="w-8 h-8 text-amber-300 animate-pulse absolute top-4 right-4" />
          )}
          <h2 className="text-3xl font-bold text-white leading-relaxed">{currentQ.question}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-grow">
          {currentQ.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isTheCorrectAnswer = currentQ.correctAnswer === index;
            let optionClass = 'bg-white/10 hover:bg-white/20 ring-amber-400 focus:ring-4';
            
            if (selectedAnswer !== null) {
              if (isSelected && isCorrect) optionClass = 'bg-green-600/90 ring-4 ring-white scale-105';
              else if (isSelected && !isCorrect) optionClass = 'bg-red-600/90 ring-4 ring-white';
              else if (attemptsLeft === 0 && isTheCorrectAnswer) optionClass = 'bg-green-600/90 ring-4 ring-white';
              else optionClass = 'bg-white/10 opacity-70';
            }

            return (
              <button key={index} disabled={selectedAnswer !== null} onClick={() => handleSelectAnswer(index)} className={`p-6 rounded-2xl text-left text-white text-2xl font-semibold transition-all duration-300 transform disabled:cursor-not-allowed ${optionClass} fade-in`} style={{ animationDelay: `${index * 100}ms` }}>
                <span className="bg-black/30 rounded-lg px-3 py-1 mr-4">{index + 1}</span>
                {option}
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="h-28 mt-6 flex flex-col items-center justify-center text-emerald-200 text-lg">
        {transcript && <p className="mb-2 italic fade-in">{transcript}</p>}
          <div className="flex flex-col items-center gap-4">
            {status === 'speaking' ? (
              <div className="flex items-center gap-3 text-amber-200 fade-in">
                  <Volume2 className="animate-pulse" />
                  <span>பேசுகிறது...</span>
              </div>
            ) : status === 'listening' ? (
                <div className="flex items-center gap-3 text-amber-200 fade-in">
                  <Mic className="text-red-400 animate-pulse" />
                  <span>🎙️ உங்கள் பதிலை பேசுங்கள்</span>
                </div>
            ) : (
              <>
                <button
                  onClick={() => startListening()}
                  disabled={selectedAnswer !== null || status !== 'idle'}
                  className="bg-amber-400 text-emerald-900 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:bg-amber-500 disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mic size={32} />
                </button>
                {selectedAnswer === null && <div className="opacity-70">பதிலைத் தேர்ந்தெடுக்கவும் அல்லது பேசவும்</div>}
              </>
            )}
            {selectedAnswer !== null && isCorrect === true && (
                <div className="text-green-300 fade-in">சரியான பதில்! அடுத்த கேள்விக்கு தயாராகுங்கள்...</div>
            )}
            {selectedAnswer !== null && isCorrect === false && attemptsLeft > 0 && (
              <div className="text-yellow-300 fade-in">தவறான பதில், மீண்டும் முயற்சிக்கவும்...</div>
            )}
             {selectedAnswer !== null && attemptsLeft === 0 && (
              <div className="text-red-400 fade-in">சரியான பதில் காட்டப்படுகிறது...</div>
            )}
          </div>
      </div>
    </div>
  );
};
