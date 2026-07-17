import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image as RNImage, Keyboard } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; 
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

// ==========================================
// Bob's Optimized Thumbnail Component
// ==========================================
const globalBobImageCache: Record<string, string | null> = {};

function BobDrinkThumbnail({ drinkName, size = 60, colors }: { drinkName: string, size?: number, colors: any }) {
  const [imgUrl, setImgUrl] = useState<string | null>(globalBobImageCache[drinkName] || null);

  useEffect(() => {
    if (globalBobImageCache[drinkName] !== undefined) {
      setImgUrl(globalBobImageCache[drinkName]);
      return;
    }
    let isMounted = true;
    fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(drinkName)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.drinks && data.drinks.length > 0) {
          const exactMatch = data.drinks.find((d: any) => d.strDrink.toLowerCase() === drinkName.toLowerCase());
          const bestDrink = exactMatch || data.drinks[0];
          const url = bestDrink.strDrinkThumb + '/preview';
          globalBobImageCache[drinkName] = url;
          if (isMounted) setImgUrl(url);
        } else {
          globalBobImageCache[drinkName] = null;
          if (isMounted) setImgUrl(null);
        }
      })
      .catch(() => { if (isMounted) setImgUrl(null); });
      
    return () => { isMounted = false; };
  }, [drinkName]);

  return (
    <View style={[styles.thumbnailContainer, { width: size, height: size, backgroundColor: colors.background, borderColor: colors.border }]}>
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="disk" transition={200} />
      ) : (
        <Ionicons name="wine-outline" size={size * 0.5} color={colors.subtext} opacity={0.5} />
      )}
    </View>
  );
}

interface Message {
  id: string;
  role: 'user' | 'bob';
  text: string;
  recipe_id?: number;
  recipe_name?: string;
  glass_type?: string;
}

export default function BobScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter(); 
  
  const themePrimary = isDark ? colors.primary : '#111111'; 
  const themePrimaryText = isDark ? '#000000' : '#FFFFFF';

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'bob', text: "I'm Bob. I've been mixing drinks here for 30 years. What's your poison today?"
  }]);
  
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (inputRef.current) inputRef.current.blur();
    });
    return () => hideSub.remove();
  }, []);

  async function handlePressIn() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) { console.error('Failed to start recording', err); }
  }

  async function handlePressOut() {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null); 
      if (uri) processAudioTranscription(uri);
    } catch (error) { console.error('Failed to stop recording', error); }
  }

  async function processAudioTranscription(uri: string) {
    setIsTranscribing(true);
    setInputMode('text'); 
    setInputText("Transcribing..."); 
    try {
      const formData = new FormData();
      formData.append('audio_file', { uri: uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
      
      const res = await fetch('http://192.168.0.237:8000/api/v2/transcribe', { method: 'POST', body: formData });
      const json = await res.json();
      
      if (json.status === 'success') setInputText(json.text);
      else throw new Error("Transcription failed.");
    } catch (error) {
      setInputText(""); 
    } finally { setIsTranscribing(false); }
  }

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const userText = inputText;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
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
          recipe_id: json.recipe_id,
          recipe_name: json.recipe_name,
          glass_type: json.glass_type
        };
        setMessages(prev => [...prev, bobMsg]);
      } else {
        throw new Error(json.detail || "Bob is ignoring you.");
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'bob', text: `[SYSTEM ERROR] ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    return (
      <View key={msg.id} style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperBob]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <RNImage source={require('../../../assets/images/bob.jpg')} style={[styles.realAvatar, { borderColor: themePrimary }]} />
          </View>
        )}
        <View style={{ flexShrink: 1 }}>
          <View style={[styles.messageBubble, { backgroundColor: isUser ? themePrimary : colors.card, borderColor: isUser ? themePrimary : colors.border }]}>
            <Text style={{ color: isUser ? themePrimaryText : colors.text, fontSize: 16, lineHeight: 22 }}>{msg.text}</Text>
          </View>

          {msg.recipe_id !== undefined && msg.recipe_name && (
            <TouchableOpacity 
              style={[styles.recommendedCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => router.push(`/recipe/${msg.recipe_id}`)}
            >
              <BobDrinkThumbnail drinkName={msg.recipe_name} size={50} colors={colors} />
              <View style={styles.recommendedTextContainer}>
                <Text style={[styles.recommendedTitle, { color: colors.text }]} numberOfLines={1}>{msg.recipe_name}</Text>
                <Text style={[styles.recommendedSubtitle, { color: themePrimary }]}>
                  {msg.glass_type?.toUpperCase()} • TAP TO VIEW RECIPE
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: colors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={0} 
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        
        <View style={[styles.fixedHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: 1 }}>ASK BOB</Text>
            <Text style={{ fontSize: 12, color: colors.subtext }}>Your AI Bartender</Text>
          </View>
        </View>

        <ScrollView 
          ref={scrollViewRef} 
          contentContainerStyle={styles.chatContainer} 
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled" 
        >
          {messages.map(renderMessage)}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={themePrimary} />
              <Text style={[styles.loadingText, { color: colors.subtext }]}>Bob is mixing...</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? insets.bottom + 10 : 16 }]}>
          <TouchableOpacity style={styles.modeButton} onPress={() => setInputMode(prev => prev === 'text' ? 'voice' : 'text')} disabled={isTranscribing || loading}>
            {inputMode === 'text' ? <Ionicons name="mic-outline" size={26} color={colors.text} /> : <MaterialIcons name="keyboard" size={26} color={colors.text} />}
          </TouchableOpacity>

          {inputMode === 'text' ? (
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={sendMessage}
              editable={!isTranscribing}
              placeholder="Tell Bob what you want..."
              placeholderTextColor={colors.subtext}
            />
          ) : (
            <TouchableOpacity 
              style={[styles.holdToTalkButton, { backgroundColor: isRecording ? themePrimary : colors.background, borderColor: colors.border }]}
              onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={0.7}
            >
              <Text style={[styles.holdToTalkText, { color: isRecording ? themePrimaryText : colors.text }]}>
                {isRecording ? "Release to Send" : "Hold to Talk"}
              </Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.sendButton, { backgroundColor: inputText.trim() && inputMode === 'text' ? themePrimary : colors.border, opacity: inputMode === 'text' ? 1 : 0 }]} 
            onPress={sendMessage} disabled={!inputText.trim() || loading || isTranscribing || inputMode === 'voice'}
          >
            <Ionicons name="send" size={18} color={inputText.trim() ? themePrimaryText : colors.subtext} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fixedHeader: { 
    flexDirection: 'row', 
    justifyContent: 'flex-start',
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 15,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  chatContainer: { padding: 16, paddingBottom: 20 },
  messageWrapper: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  messageWrapperUser: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageWrapperBob: { alignSelf: 'flex-start' },
  avatarContainer: { marginRight: 10, marginTop: 2, justifyContent: 'flex-start' },
  realAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5 },
  messageBubble: { padding: 14, borderRadius: 16, borderWidth: 1 },
  recommendedCard: { marginTop: 10, padding: 10, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  thumbnailContainer: { borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  recommendedTextContainer: { flex: 1, marginLeft: 12 },
  recommendedTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  recommendedSubtitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, alignSelf: 'flex-start', marginLeft: 44 },
  loadingText: { marginLeft: 8, fontSize: 12, fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, alignItems: 'center', minHeight: 70 },
  modeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginRight: 8, minHeight: 44 },
  holdToTalkButton: { flex: 1, borderWidth: 1, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8, minHeight: 44 },
  holdToTalkText: { fontSize: 16, fontWeight: '600' },
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});