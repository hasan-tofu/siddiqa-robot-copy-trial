export interface Surah {
  name: string;
  number: number;
  audio: string;
}

export interface SurahDatabase {
  [key: string]: Surah;
}

export interface Dua {
    name: string; // Tamil name
    arabic: string;
    translationTamil: string;
    keywords: string[];
}

export interface DuaDatabase {
    [key: string]: Dua;
}

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: number;
}