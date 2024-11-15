import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import Groq from 'groq-sdk';
import { createClient, LiveTranscriptionEvents, LiveTTSEvents } from '@deepgram/sdk';
import { Buffer } from 'buffer';
window.Buffer = Buffer;


const DeepgramStreaming = () => {
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const deepgramConnection = useRef(null);
  const mediaRecorderRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [audioQueue, setAudioQueue] = useState([]);
   const audioSourceRef = useRef(null);
  const audioBufferRef = useRef(null);

  const audioContext = useRef(null);
  const audioChunks = useRef([]);



  const ttsConnectionRef = useRef(null);


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
        endpointing: true,
        vad_turnoff: 500
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

      // connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
      //   const transcript = data.channel.alternatives[0].transcript;
        
      //   if (transcript && data.is_final) {
      //     currentUtterance += ' ' + transcript;
          
      //     clearTimeout(silenceTimer);
      //     silenceTimer = setTimeout(async () => {
      //       if (currentUtterance.trim()) {
      //         addMessage('user', currentUtterance.trim());
              
      //         try {
      //           const completion = await groq.chat.completions.create({
      //             messages: [
      //               {
      //                 role: "system",
      //                 content: "You are a helpful assistant. Keep responses concise and natural."
      //               },
      //               {
      //                 role: "user",
      //                 content: currentUtterance.trim()
      //               }
      //             ],
      //             model: "llama3-70b-8192",
      //             temperature: 0.7,
      //             max_tokens: 150,
      //             stream: true
      //           });

      //           let fullResponse = '';
      //           for await (const chunk of completion) {
      //             const content = chunk.choices[0]?.delta?.content || '';
      //             fullResponse += content;
      //             setMessages(prev => {
      //               const newMessages = [...prev];
      //               if (newMessages[newMessages.length - 1]?.role === 'assistant') {
      //                 newMessages[newMessages.length - 1].content = fullResponse;
      //               } else {
      //                 newMessages.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
      //               }
      //               return newMessages;
      //             });
      //           }
      //         } catch (error) {
      //           console.error('Groq API error:', error);
      //         }
      //         currentUtterance = '';
      //       }
      //     }, 1500);
      //   }
      // });

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
      
                // Handle streaming response and text-to-speech
                let fullResponse = '';
                for await (const chunk of completion) {
                  const content = chunk.choices[0]?.delta?.content || '';
                  fullResponse += content;
      
                  // Update messages with streaming response
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
      
                // Call handleGroqCompletion to finalize response and play TTS
                await handleGroqCompletion(fullResponse);
      
              } catch (error) {
                console.error('Groq API error:', error);
              }
      
              currentUtterance = '';
            }
          }, 1500);
        }
      });
      

      deepgramConnection.current = connection;
      setIsListening(true);

    } catch (error) {
      console.error('Error starting stream:', error);
    }
  };

  const handleGroqCompletion = async (fullResponse) => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages[newMessages.length - 1]?.role === 'assistant') {
        newMessages[newMessages.length - 1].content = fullResponse;
      } else {
        newMessages.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
      }
      return newMessages;
    });
    await playAudioStream(fullResponse);
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

  
  
  
  // const playAudioStream = async (text) => {
  //   try {
  //     if (!audioContext.current) {
  //       audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
  //       await audioContext.current.resume();
  //     }
  
  //     const deepgram = createClient(import.meta.env.VITE_DEEPGRAM_API_KEY);
  //     const connection = deepgram.speak.live({ 
  //       model: "aura-asteria-en",
  //       encoding: "linear16",
  //       sample_rate: 16000,
  //       container: "none"  // Required for WebSocket streaming
  //     });
  
  //     connection.on(LiveTTSEvents.Open, () => {
  //       audioChunks.current = [];
  //       connection.sendText(text);
  //       connection.flush();
  //     });
  
  //     // Create WAV header
  //     const createWavHeader = (dataLength) => {
  //       const buffer = new ArrayBuffer(44);
  //       const view = new DataView(buffer);
        
  //       // "RIFF" chunk descriptor
  //       view.setUint32(0, 0x52494646, false); // "RIFF"
  //       view.setUint32(4, 36 + dataLength, true); // File size
  //       view.setUint32(8, 0x57415645, false); // "WAVE"
        
  //       // "fmt " sub-chunk
  //       view.setUint32(12, 0x666D7420, false); // "fmt "
  //       view.setUint32(16, 16, true); // Subchunk size
  //       view.setUint16(20, 1, true); // Audio format (PCM)
  //       view.setUint16(22, 1, true); // Channels (mono)
  //       view.setUint32(24, 16000, true); // Sample rate
  //       view.setUint32(28, 16000 * 2, true); // Byte rate
  //       view.setUint16(32, 2, true); // Block align
  //       view.setUint16(34, 16, true); // Bits per sample
        
  //       // "data" sub-chunk
  //       view.setUint32(36, 0x64617461, false); // "data"
  //       view.setUint32(40, dataLength, true); // Data size
        
  //       return new Uint8Array(buffer);
  //     };
  
  //     connection.on(LiveTTSEvents.Audio, async (data) => {
  //       const audioData = new Int16Array(data);
  //       const wavHeader = createWavHeader(audioData.byteLength);
        
  //       // Combine header and audio data
  //       const completeAudioData = new Uint8Array(wavHeader.length + audioData.byteLength);
  //       completeAudioData.set(wavHeader);
  //       completeAudioData.set(new Uint8Array(audioData.buffer), wavHeader.length);
        
  //       // Decode and play
  //       try {
  //         const audioBuffer = await audioContext.current.decodeAudioData(completeAudioData.buffer);
  //         const source = audioContext.current.createBufferSource();
  //         source.buffer = audioBuffer;
  //         source.connect(audioContext.current.destination);
  //         source.start(0);
  //       } catch (error) {
  //         console.error('Error decoding audio:', error);
  //       }
  //     });
  
  //     connection.on(LiveTTSEvents.Error, (err) => {
  //       console.error('TTS Error:', err);
  //     });
  
  //     connection.on(LiveTTSEvents.Close, () => {
  //       console.log('TTS Connection closed');
  //     });
  
  //   } catch (error) {
  //     console.error('TTS Setup Error:', error);
  //   }
  // };

  const playAudioStream = async (text) => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.current.resume();
      }
  
      const deepgram = createClient(import.meta.env.VITE_DEEPGRAM_API_KEY);
      const connection = deepgram.speak.live({ 
        model: "aura-asteria-en",
        encoding: "linear16",  // Using PCM 16-bit encoding
        sample_rate: 16000,    // Standard speech sample rate
        container: "none"
      });
  
      let audioQueue = [];
  
      connection.on(LiveTTSEvents.Open, () => {
        audioQueue = [];
        connection.sendText(text);
        connection.flush();
      });
  
      connection.on(LiveTTSEvents.Audio, async (data) => {
        // Convert incoming data to Float32Array for Web Audio API
        const buffer = new Int16Array(data);
        const float32 = new Float32Array(buffer.length);
        
        // Convert Int16 to Float32 (normalized between -1 and 1)
        for (let i = 0; i < buffer.length; i++) {
          float32[i] = buffer[i] / 32768.0;
        }
        
        // Create an audio buffer
        const audioBuffer = audioContext.current.createBuffer(1, float32.length, 16000);
        audioBuffer.getChannelData(0).set(float32);
  
        // Create and play source
        const source = audioContext.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.current.destination);
        
        // Calculate start time to maintain continuous playback
        const startTime = audioContext.current.currentTime + (audioQueue.length * audioBuffer.duration);
        source.start(startTime);
        audioQueue.push(source);
      });
  
      connection.on(LiveTTSEvents.Flushed, () => {
        console.log('Audio stream flushed');
        audioQueue = [];
      });
  
      connection.on(LiveTTSEvents.Error, (err) => {
        console.error('TTS Error:', err);
      });
  
      connection.on(LiveTTSEvents.Close, () => {
        console.log('TTS Connection closed');
        audioQueue = [];
      });
  
    } catch (error) {
      console.error('TTS Setup Error:', error);
    }
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


  useEffect(() => {
    return () => {
      if (ttsConnectionRef.current) {
        ttsConnectionRef.current.close();
      }
      if (audioContext.current) {
        audioContext.current.close();
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