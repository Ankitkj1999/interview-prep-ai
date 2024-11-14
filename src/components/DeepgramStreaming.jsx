import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import Groq from 'groq-sdk';

const DeepgramStreaming = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const deepgramConnection = useRef(null);
  const mediaRecorderRef = useRef(null);
  
  // Initialize Groq client
  const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true
  });

  const startStreaming = async () => {
    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize Deepgram
      const deepgram = createClient(import.meta.env.VITE_DEEPGRAM_API_KEY);
      
      // Create live transcription connection
      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
      });

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Connection opened');
        
        // Start recording and sending audio
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && connection.getReadyState() === 1) {
            connection.send(event.data);
          }
        };
        
        mediaRecorderRef.current.start(250); // Send data every 250ms
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Connection closed');
      });

      connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript && data.is_final) {
          setTranscription(prev => prev + ' ' + transcript);
          
          // If we have a complete sentence (ends with punctuation), send to Groq
          if (transcript.match(/[.!?]$/)) {
            try {
              const completion = await groq.chat.completions.create({
                messages: [
                  {
                    role: "system",
                    content: "You are a helpful assistant. Keep responses concise and natural."
                  },
                  {
                    role: "user",
                    content: transcript
                  }
                ],
                model: "llama3-70b-8192",
                temperature: 0.7,
                max_tokens: 150,
                stream: true
              });

              let fullResponse = '';
              for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
                setAiResponse(fullResponse);
              }
            } catch (error) {
              console.error('Groq API error:', error);
            }
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
      });

      deepgramConnection.current = connection;
      setIsListening(true);

    } catch (error) {
      console.error('Error starting stream:', error);
    }
  };

  const stopStreaming = () => {
    if (deepgramConnection.current) {
      deepgramConnection.current.finish();
      deepgramConnection.current = null;
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    
    setIsListening(false);
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (deepgramConnection.current) {
        deepgramConnection.current.finish();
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-6">
          <button
            onClick={isListening ? stopStreaming : startStreaming}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
              isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5" />
                Stop Listening
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Start Listening
              </>
            )}
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Your Speech:</h3>
            <p className="min-h-[50px]">{transcription || 'Start speaking...'}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">AI Response:</h3>
            <p className="min-h-[50px]">{aiResponse || 'AI response will appear here...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepgramStreaming;