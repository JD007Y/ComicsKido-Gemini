export function speak(text: string, language: string, mood: string, persona: string = 'storyteller', onEnd?: () => void) {
  try {
    if (!window.speechSynthesis || !text) {
      if (onEnd) onEnd();
      return;
    }
    
    // Stop any current speaking
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
  
  // Map languages
  if (language === 'he') utterance.lang = 'he-IL';
  else if (language === 'fr') utterance.lang = 'fr-FR';
  else utterance.lang = 'en-US';

  // Base persona settings
  switch (persona) {
    case 'child':
      utterance.pitch = 1.4;
      utterance.rate = 1.1;
      break;
    case 'grandparent':
      utterance.pitch = 0.8;
      utterance.rate = 0.85;
      break;
    case 'hero':
      utterance.pitch = 1.05;
      utterance.rate = 0.95;
      break;
    case 'villain':
      utterance.pitch = 0.6;
      utterance.rate = 0.8;
      break;
    default: // storyteller
      utterance.pitch = 1;
      utterance.rate = 1;
  }

  // Pathos-aware modifiers (cumulative)
  switch (mood) {
    case 'heroic':
      utterance.pitch *= 1.1;
      utterance.rate *= 0.95;
      break;
    case 'scary':
      utterance.pitch *= 0.8;
      utterance.rate *= 0.8;
      break;
    case 'sad':
      utterance.pitch *= 0.9;
      utterance.rate *= 0.75;
      break;
    case 'happy':
      utterance.pitch *= 1.2;
      utterance.rate *= 1.15;
      break;
  }

  utterance.onend = () => {
    if (onEnd) onEnd();
  };

  utterance.onerror = (e) => {
    console.error("SpeechSynthesis error:", e);
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
} catch (error) {
  console.error("Speech synthesis failed:", error);
  if (onEnd) onEnd();
}
}

export function playComicSound(mood: string) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    
    // If context is suspended, it might need user interaction to start, 
    // but we'll try anyway as this is often triggered by a click
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(console.error);
    }
  
  const playTone = (freq: number, type: OscillatorType, duration: number, volume: number = 0.1) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(audioContext.currentTime + duration);
    
    // Close context after playback to save resources and avoid state issues
    setTimeout(() => {
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    }, (duration + 0.5) * 1000);
  };

  switch (mood) {
    case 'heroic':
      playTone(440, 'square', 0.2, 0.15);
      setTimeout(() => playTone(554, 'square', 0.2, 0.15), 100);
      setTimeout(() => playTone(659, 'square', 0.4, 0.2), 200);
      break;
    case 'scary':
      playTone(80, 'sawtooth', 0.8, 0.2);
      playTone(85, 'sawtooth', 0.8, 0.2);
      break;
    case 'sad':
      playTone(220, 'sine', 1.0, 0.1);
      setTimeout(() => playTone(196, 'sine', 1.0, 0.1), 300);
      break;
    case 'happy':
      playTone(880, 'sine', 0.1, 0.2);
      setTimeout(() => playTone(1100, 'sine', 0.1, 0.2), 50);
      setTimeout(() => playTone(1320, 'sine', 0.2, 0.2), 100);
      break;
    case 'mysterious':
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 1.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(now + 1.5);
      
      setTimeout(() => {
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
      }, 2000);
      break;
  }
} catch (error) {
  console.error("Audio playback failed:", error);
}
}
