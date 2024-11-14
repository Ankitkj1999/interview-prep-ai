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
    <div className="w-full min-h-screen flex items-center justify-center">
      <div className="w-4/5 md:w-3/5 h-[80vh] bg-gray-800 rounded-xl shadow-2xl backdrop-blur-sm bg-opacity-50 flex flex-col relative mx-auto my-10">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {/* Empty State */}
          {!transcription && !aiResponse && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-center">
                Start speaking by clicking the microphone button below
              </p>
            </div>
          )}

          {/* User Message */}
          {transcription && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <img 
                  src="https://lh3.googleusercontent.com/a/ACg8ocJA-ruzck7zCEcXCyhhkUJjKt6RZ39aFyBP8ye-oPkMiyj88nzl=s288-c-no"
                  alt="Ankit"
                  className="w-8 h-8 rounded-full object-cover"
                />
              </div>
              <div className="flex justify-end">
                <div className="bg-blue-500 bg-opacity-20 text-white rounded-2xl py-3 px-4 max-w-[80%] shadow-md">
                  <p className="text-sm md:text-base">{transcription}</p>
                </div>
              </div>
            </div>
          )}

          {/* AI Response */}
          {aiResponse && (
            <div className="space-y-2">
              <div className="flex justify-start">
                <img 
                  src="https://emilyai-v1.deepgram.com/aura-asteria-en.svg"
                  alt="Groq"
                  className="w-8 h-8 rounded-full object-cover"
                />
              </div>
              <div className="flex justify-start">
                <div className="bg-gray-700 bg-opacity-50 text-white rounded-2xl py-3 px-4 max-w-[80%] shadow-md">
                  <p className="text-sm md:text-base">{aiResponse}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Microphone Button Container */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <button
            onClick={isListening ? stopStreaming : startStreaming}
            className={`
              w-16 h-16 rounded-full flex items-center justify-center
              transition-all duration-300 ease-in-out transform hover:scale-110
              ${isListening 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/50' 
                : 'bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/50'
              }
            `}
          >
            {isListening ? (
              <MicOff className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeepgramStreaming;

// const TestTailwind = () => {
//   return (
//     <div className="min-h-screen w-full flex items-center justify-center bg-slate-900">
//       <div className="flex flex-col gap-4">
//         {/* Test Background */}
//         <div className="bg-blue-500 hover:bg-blue-700 p-8 rounded-lg shadow-xl">
//           <h2 className="text-white text-2xl font-bold">Test Background</h2>
//         </div>

//         {/* Test Border */}
//         <div className="border-4 border-green-500 p-8 rounded-lg">
//           <h2 className="text-white text-2xl">Test Border</h2>
//         </div>

//         {/* Test Shadow and Transform */}
//         <div className="bg-purple-500 p-8 rounded-lg shadow-2xl hover:scale-110 transition-transform">
//           <h2 className="text-white text-2xl">Test Shadow & Transform</h2>
//         </div>

//         {/* Test Gradient */}
//         <div className="bg-gradient-to-r from-pink-500 to-yellow-500 p-8 rounded-lg">
//           <h2 className="text-white text-2xl">Test Gradient</h2>
//         </div>

//         {/* Test Animation */}
//         <div className="bg-red-500 p-8 rounded-lg animate-pulse">
//           <h2 className="text-white text-2xl">Test Animation</h2>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default TestTailwind;