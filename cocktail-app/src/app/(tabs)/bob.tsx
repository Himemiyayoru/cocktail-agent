import { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; 

interface Message {
  id: string;
  role: 'user' | 'bob';
  text: string;
  recipe?: any[];
  physics?: any;
}

export default function BobScreen() {
  const { colors, isDark } = useTheme();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'bob',
      text: "I'm Bob. I've been mixing drinks here for 30 years. What's your poison today?",
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // 🌟 New: Input mode state (text: typing mode, voice: voice mode)
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Start recording
  async function handlePressIn() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'Bob needs to hear you!');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  // Release to stop recording and start transcription
  async function handlePressOut() {
    if (!recording) return;
    setIsRecording(false);
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null); 
      
      if (uri) {
        processAudioTranscription(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
  }

  // Upload audio and transcribe to text
  async function processAudioTranscription(uri: string) {
    setIsTranscribing(true);
    // 🌟 Automatically switch back to text input mode and show transcription status when started
    setInputMode('text'); 
    setInputText("Transcribing..."); 

    try {
      const formData = new FormData();
      formData.append('audio_file', { uri: uri, name: 'voice.m4a', type: 'audio/m4a' } as any);

      const res = await fetch('http://192.168.0.237:8000/api/v2/transcribe', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.status === 'success') {
        // On success, place the transcribed text from Whisper into the input field
        setInputText(json.text);
      } else {
        throw new Error("Transcription failed.");
      }
    } catch (error) {
      Alert.alert("Transcription Error", "Bob didn't quite catch that.");
      setInputText(""); 
    } finally {
      setIsTranscribing(false);
    }
  }

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userText = inputText;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const response = await fetch('http://192.168.0.237:8000/api/v2/chat_with_bob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_message: userText })
      });
      
      const json = await response.json();
      
      if (json.status === 'success') {
        const bobMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'bob',
          text: json.bob_says,
          recipe: json.recipe_data,
          physics: json.physics_metrics
        };
        setMessages(prev => [...prev, bobMsg]);
      } else {
        throw new Error(json.detail || "Bob is ignoring you.");
      }
    } catch (error: any) {
      const errorMsg: Message = { id: (Date.now() + 1).toString(), role: 'bob', text: `[SYSTEM ERROR] ${error.message}` };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    return (
      <View key={msg.id} style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperBob]}>
        {!isUser && <Ionicons name="person-circle-outline" size={28} color={colors.primary} style={styles.avatar} />}
        
        <View style={[styles.messageBubble, { backgroundColor: isUser ? colors.primary : colors.card, borderColor: isUser ? colors.primary : colors.border }]}>
          <Text style={{ color: isUser ? '#000000' : colors.text, fontSize: 16 }}>{msg.text}</Text>
          
          {msg.physics && (
            <View style={[styles.recipeCard, { borderColor: isDark ? '#333' : '#ddd' }]}>
              <Text style={[styles.recipeTitle, { color: isUser ? '#000' : colors.primary }]}>
                {msg.physics.recipe_name?.toUpperCase()}
              </Text>
              <View style={styles.ingredientsList}>
                {(msg.recipe || []).map((ing, idx) => (
                  <Text key={idx} style={{ color: isUser ? '#222' : colors.text, fontSize: 13 }}>
                    • {ing.volume_ml}ml {ing.ingredient_name}
                  </Text>
                ))}
              </View>
              <View style={styles.physicsMetrics}>
                <Text style={styles.metricText}>ABV: {msg.physics.final_abv_percent}%</Text>
                <Text style={styles.metricText}>BRIX: {msg.physics.final_brix}</Text>
                <Text style={styles.metricText}>VOL: {msg.physics.final_volume_ml}ml</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.chatContainer} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
        {messages.map(renderMessage)}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Bob is typing...</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        
      {/* Left mode switch button: tap to toggle between text and voice */}
        <TouchableOpacity 
          style={styles.modeButton} 
          onPress={() => setInputMode(prev => prev === 'text' ? 'voice' : 'text')}
          disabled={isTranscribing || loading}
        >
          {inputMode === 'text' ? (
            <Ionicons name="mic-outline" size={26} color={colors.text} />
          ) : (
            <MaterialIcons name="keyboard" size={26} color={colors.text} />
          )}
        </TouchableOpacity>

        {/* Middle core interaction area: dynamically render based on mode */}
        {inputMode === 'text' ? (
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
            editable={!isTranscribing}
          />
        ) : (
          <TouchableOpacity 
            style={[
              styles.holdToTalkButton, 
              { backgroundColor: isRecording ? colors.primary : colors.background, borderColor: colors.border }
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.7}
          >
            <Text style={[styles.holdToTalkText, { color: isRecording ? '#000' : colors.text }]}>
              {isRecording ? "Release to Send" : "Hold to Talk"}
            </Text>
          </TouchableOpacity>
        )}
        
        {/* Right send button: visible and active only in text mode */}
        <TouchableOpacity 
          style={[
            styles.sendButton, 
            { 
              backgroundColor: inputText.trim() && inputMode === 'text' ? colors.primary : colors.border,
              opacity: inputMode === 'text' ? 1 : 0 
            }
          ]} 
          onPress={sendMessage}
          disabled={!inputText.trim() || loading || isTranscribing || inputMode === 'voice'}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? '#000' : colors.subtext} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatContainer: { padding: 16, paddingBottom: 20 },
  messageWrapper: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  messageWrapperUser: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageWrapperBob: { alignSelf: 'flex-start' },
  avatar: { marginRight: 8, marginTop: 4 },
  messageBubble: { padding: 14, borderRadius: 16, borderWidth: 1 },
  recipeCard: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  recipeTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 6, letterSpacing: 0.5 },
  ingredientsList: { marginBottom: 10 },
  physicsMetrics: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)', padding: 8, borderRadius: 6 },
  metricText: { fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace', color: '#888' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, alignSelf: 'flex-start', marginLeft: 40 },
  loadingText: { marginLeft: 8, fontSize: 12, fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, alignItems: 'center', minHeight: 70 },
  modeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginRight: 8, minHeight: 44 },
  
  // 🌟 New: Wide 'Hold to Talk' button style
  holdToTalkButton: { flex: 1, borderWidth: 1, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8, minHeight: 44 },
  holdToTalkText: { fontSize: 16, fontWeight: '600' },
  
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});