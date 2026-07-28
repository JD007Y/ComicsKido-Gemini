import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from '../translations';
import { Language } from '../types';

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
  language: Language;
}

export function CameraCapture({ onCapture, onClose, language }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const t = translations[language];

  const startCamera = async (mode: 'user' | 'environment') => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode }
      });
      
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setError(null);
    } catch (err) {
      console.error("Camera access error:", err);
      setError(t.cameraError);
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Mirror preservation if using front camera
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onCapture(dataUrl);
      }
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
    >
      <div className="relative w-full max-w-md aspect-[3/4] bg-neutral-900 overflow-hidden sm:rounded-3xl">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-white p-8 text-center bg-red-900/20">
            <X size={48} className="mb-4 opacity-50" />
            <p className="font-bold">{error}</p>
            <button 
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-white text-black rounded-full font-bold"
            >
              {t.cancel}
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
            
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
              <button 
                onClick={onClose}
                className="p-3 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-black/60 transition-colors"
                title={t.cancel}
              >
                <X size={24} />
              </button>
              
              <button 
                onClick={toggleCamera}
                className="p-3 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-black/60 transition-colors"
                title={t.flipCamera}
              >
                <RefreshCw size={24} />
              </button>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 z-10">
              <button 
                onClick={capturePhoto}
                className="group relative flex items-center justify-center"
                title={t.capture}
              >
                <div className="absolute w-20 h-20 border-4 border-white rounded-full group-active:scale-90 transition-transform" />
                <Circle size={64} className="text-white fill-white scale-75 group-active:scale-100 transition-transform" />
              </button>
            </div>
          </>
        )}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}
