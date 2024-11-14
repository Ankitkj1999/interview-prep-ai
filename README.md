# API Speech Bot: Functional Requirements

This project is an **AI Speech Interview Prep Agent** that utilizes API integrations to create an interactive conversation system using three core components.

### 1. Speech-to-Text (Deepgram Nova 2)
   - **Purpose**: Convert user speech to text in real-time using Deepgram Nova 2.
   - **Process**:
     - Capture audio from the user's microphone.
     - Send audio to Deepgram Nova 2 in a streaming format to convert speech into text.
     - Display transcribed text in real-time on the user interface (UI) to provide visual feedback of the conversation.
   - **APIs Involved**: Deepgram Nova 2 (for speech-to-text conversion).
   
### 2. Language Model Processing (LLM Groq)
   - **Purpose**: Analyze and process the transcribed text using LLM Groq to generate a response.
   - **Process**:
     - Send the text output from Deepgram Nova 2 to LLM Groq.
     - Receive a processed response from LLM Groq in streaming format, ensuring minimal latency.
     - Display the response text in real-time on the UI to simulate a natural conversation flow.
   - **APIs Involved**: LLM Groq (for language processing and response generation).

### 3. Text-to-Speech (Deepgram Aura Stream)
   - **Purpose**: Convert LLM Groq's response text to spoken audio in real-time using Deepgram Aura Stream.
   - **Process**:
     - Send the response text from LLM Groq to Deepgram Aura Stream, aiming to utilize streaming or socket-based communication for low latency.
     - Play the generated audio in real-time on the UI, providing a seamless audio response to the user.
   - **APIs Involved**: Deepgram Aura Stream (for text-to-speech conversion). And Groq for LLM.

