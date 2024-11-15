import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import Groq from 'groq-sdk';

const DeepgramStreaming = () => {
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const deepgramConnection = useRef(null);
  const mediaRecorderRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true
  });

  const addMessage = (role, content) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now() }]);
  };

  const startStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const deepgram = createClient(import.meta.env.VITE_DEEPGRAM_API_KEY);
      
      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        interim_results: false,
        punctuate: true,
        endpointing: true
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && connection.getReadyState() === 1) {
            connection.send(event.data);
          }
        };
        mediaRecorderRef.current.start(250);
      });

      let currentUtterance = '';
      let silenceTimer = null;

      connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        
        if (transcript && data.is_final) {
          currentUtterance += ' ' + transcript;
          
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(async () => {
            if (currentUtterance.trim()) {
              addMessage('user', currentUtterance.trim());
              
              try {
                const completion = await groq.chat.completions.create({
                  messages: [
                    {
                      role: "system",
                      content: "You are a helpful assistant. Keep responses concise and natural."
                    },
                    {
                      role: "user",
                      content: currentUtterance.trim()
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
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages[newMessages.length - 1]?.role === 'assistant') {
                      newMessages[newMessages.length - 1].content = fullResponse;
                    } else {
                      newMessages.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
                    }
                    return newMessages;
                  });
                }
              } catch (error) {
                console.error('Groq API error:', error);
              }
              currentUtterance = '';
            }
          }, 1000);
        }
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-center">
                Start speaking by clicking the microphone button below
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.timestamp} className="space-y-2">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <img 
                  src={message.role === 'user' 
                    ? "https://lh3.googleusercontent.com/a/ACg8ocJA-ruzck7zCEcXCyhhkUJjKt6RZ39aFyBP8ye-oPkMiyj88nzl=s288-c-no"
                    : "https://emilyai-v1.deepgram.com/aura-asteria-en.svg"
                  }
                  alt={message.role === 'user' ? "User" : "Assistant"}
                  className="w-8 h-8 rounded-full object-cover"
                />
              </div>
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`
                  ${message.role === 'user' 
                    ? 'bg-blue-500 bg-opacity-20' 
                    : 'bg-gray-700 bg-opacity-50'
                  } 
                  text-white rounded-2xl py-3 px-4 max-w-[80%] shadow-md
                `}>
                  <p className="text-sm md:text-base">{message.content}</p>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

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