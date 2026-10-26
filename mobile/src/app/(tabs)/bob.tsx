import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image as RNImage, Keyboard, Switch, Modal } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; 
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { DrinkPhoto } from '../../components/DrinkPhoto';
import { useInventory } from '../../hooks/useInventory';
import { apiRequest } from '../../lib/api';
import { BobAccess, BOB_MONTHLY_PRICE, BOB_AI_BUDGET, clearStoredBobAccess, purchaseBob, readStoredBobAccess, restoreBob } from '../../lib/subscription';

function BobDrinkThumbnail({ drinkName, size = 60, colors }: { drinkName: string, size?: number, colors: any }) {
  return (
    <View style={[styles.thumbnailContainer, { width: size, height: size, backgroundColor: colors.background, borderColor: colors.border }]}>
      <DrinkPhoto name={drinkName} style={{ width: '100%', height: '100%' }} iconColor={colors.subtext} iconSize={size * 0.5} />
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
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const holdingMic = useRef(false);
  const startingMic = useRef(false);
  const micSessionBusy = useRef(false);
  const mounted = useRef(true);
  const chatRequest = useRef<AbortController | null>(null);
  const transcriptionRequest = useRef<AbortController | null>(null);
  const { inventory, loaded: inventoryLoaded, error: inventoryError } = useInventory();
  const [useCabinet, setUseCabinet] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<{ text: string; inventory: string[]; useCabinet: boolean } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMicBusy, setIsMicBusy] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [access, setAccess] = useState<BobAccess | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [paywallBusy, setPaywallBusy] = useState(false);
  const [paywallError, setPaywallError] = useState<string | null>(null);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const accessRef = useRef<BobAccess | null>(null);
  accessRef.current = access;

  useFocusEffect(useCallback(() => {
    let active = true;
    readStoredBobAccess().then((value) => {
      if (!active) return;
      setAccess(value);
      if (!value) setAccessNotice(`Subscribe for ${BOB_MONTHLY_PRICE}/month to use Bob's chat and voice. Includes ${BOB_AI_BUDGET} of AI usage per subscription month.`);
      setAccessReady(true);
    }).catch(() => {
      if (active) setAccessReady(true);
    });
    return () => { active = false; };
  }, []));

  async function loseAccess(error: unknown) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : '';
    if (status === 401 || message.includes('subscription has ended')) {
      await clearStoredBobAccess();
      setAccess(null);
      setAccessNotice(message || `Subscribe for ${BOB_MONTHLY_PRICE}/month to use Bob.`);
      return true;
    }
    if (status === 402) {
      setAccessNotice(message);
      return true;
    }
    return false;
  }

  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (inputRef.current) inputRef.current.blur();
    });
    return () => hideSub.remove();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      holdingMic.current = false;
      chatRequest.current?.abort();
      transcriptionRequest.current?.abort();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  async function handlePressIn() {
    if (micSessionBusy.current || startingMic.current || recordingRef.current || loading || isTranscribing) return;
    micSessionBusy.current = true;
    setIsMicBusy(true);
    holdingMic.current = true;
    startingMic.current = true;
    setRequestError(null);
    let started = false;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        if (mounted.current) setRequestError('Microphone access is off. You can type instead.');
        return;
      }
      if (!holdingMic.current || !mounted.current) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      if (!holdingMic.current || !mounted.current) {
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        return;
      }
      recordingRef.current = recording;
      started = true;
      setIsRecording(true);
    } catch {
      if (mounted.current) setRequestError('Recording could not start. Please try again or type.');
    } finally {
      startingMic.current = false;
      if (!started) {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        micSessionBusy.current = false;
        if (mounted.current) setIsMicBusy(false);
      }
    }
  }

  async function handlePressOut() {
    holdingMic.current = false;
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (uri && mounted.current) await processAudioTranscription(uri);
    } catch {
      if (mounted.current) setRequestError('Recording could not be read. Please try again.');
    } finally {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      micSessionBusy.current = false;
      if (mounted.current) setIsMicBusy(false);
    }
  }

  async function processAudioTranscription(uri: string) {
    setIsTranscribing(true);
    setInputMode('text');
    setRequestError(null);
    const controller = new AbortController();
    transcriptionRequest.current = controller;
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        formData.append('audio_file', blob, blob.type.includes('webm') ? 'voice.webm' : 'voice.m4a');
      } else {
        formData.append('audio_file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
      }
      const token = accessRef.current?.accessToken;
      if (!token) return;
      const json = await apiRequest<{ status: string; text: string; remaining_usd: string; spent_usd: string }>('/api/v2/transcribe', {
        method: 'POST', body: formData, signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      }, 45000);
      if (mounted.current && !controller.signal.aborted) {
        setInputText(json.text);
        setAccess(current => current ? { ...current, remainingUsd: json.remaining_usd, spentUsd: json.spent_usd } : current);
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && !(await loseAccess(error))) {
        setRequestError(error instanceof Error ? error.message : 'Transcription failed. Please try again.');
      }
    } finally {
      transcriptionRequest.current = null;
      if (mounted.current) setIsTranscribing(false);
    }
  }

  const sendMessage = async (retry = false) => {
    if (chatRequest.current || micSessionBusy.current || isTranscribing || isRecording) return;
    const pending = retry && failedRequest ? failedRequest : { text: inputText.trim(), inventory: [...inventory], useCabinet };
    if (!pending.text || (pending.useCabinet && (!inventoryLoaded || inventoryError))) return;
    if (!retry) {
      setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: pending.text }]);
      setInputText('');
    }
    const controller = new AbortController();
    chatRequest.current = controller;
    setLoading(true);
    setRequestError(null);
    setFailedRequest(null);
    try {
      const token = accessRef.current?.accessToken;
      if (!token) return;
      const json = await apiRequest<{ status: string; bob_says: string; recipe_id?: number; recipe_name?: string; glass_type?: string; budget_usd?: string; spent_usd?: string; remaining_usd?: string }>('/api/v2/chat_with_bob', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_message: pending.text, inventory: pending.inventory, use_inventory: pending.useCabinet }),
        signal: controller.signal,
      }, 45000);
      if (typeof json.bob_says !== 'string') throw new Error('Bob could not reply. Please try again.');
      if (mounted.current && json.remaining_usd) {
        setAccess((current) => current ? { ...current, budgetUsd: json.budget_usd || current.budgetUsd, spentUsd: json.spent_usd || current.spentUsd, remainingUsd: json.remaining_usd || current.remainingUsd } : current);
      }
      if (mounted.current && !controller.signal.aborted) setMessages(prev => [...prev, {
        id: `bob-${Date.now()}`, role: 'bob', text: json.bob_says,
        recipe_id: json.recipe_id, recipe_name: json.recipe_name, glass_type: json.glass_type,
      }]);
    } catch (error) {
      if (mounted.current && !(await loseAccess(error))) {
        setRequestError(controller.signal.aborted ? 'Request cancelled. Your message is available to retry.' : error instanceof Error ? error.message : 'Bob could not reply. Please try again.');
        setFailedRequest(pending);
      }
    } finally {
      chatRequest.current = null;
      if (mounted.current) setLoading(false);
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0} 
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        
        <View style={[styles.fixedHeader, { backgroundColor: colors.background, borderBottomColor: colors.border, paddingRight: 72 }]}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: 1 }}>ASK BOB</Text>
            <Text style={{ fontSize: 12, color: colors.subtext }}>{access ? `Monthly model allowance: $${access.remainingUsd} of $${access.budgetUsd} left` : 'Your AI Bartender'}</Text>
          </View>
        </View>

        <Modal visible={accessNotice !== null} transparent animationType="fade" onRequestClose={() => setAccessNotice(null)}>
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 }}>
            <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderRadius: 16, padding: 24, gap: 18 }}>
              <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{access ? 'Monthly AI limit' : 'Bob subscription'}</Text>
              <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{accessNotice}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setAccessNotice(null)} style={[styles.paywallButton, { backgroundColor: themePrimary }]}>
                <Text style={{ color: themePrimaryText, fontWeight: '700' }}>{access ? 'OK' : 'View subscription'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {!accessReady ? <ActivityIndicator style={{ marginTop: 40 }} color={themePrimary} /> : !access ? (
          <View style={styles.paywall}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Bob is {BOB_MONTHLY_PRICE}/month</Text>
            <Text style={{ color: colors.subtext, fontSize: 16, lineHeight: 24 }}>
              Library, search, cabinet, recipe studio, and saved versions stay free. Bob's chat and voice are included in the monthly subscription. Model usage in each paid period is capped at {BOB_AI_BUDGET}, shared by chat and voice.
            </Text>
            {paywallError && <Text accessibilityRole="alert" style={{ color: colors.text }}>{paywallError}</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={paywallBusy} style={[styles.paywallButton, { backgroundColor: themePrimary }]} onPress={async () => {
              setPaywallBusy(true);
              setPaywallError(null);
              try { setAccess(await purchaseBob()); }
              catch (error) { setPaywallError(error instanceof Error ? error.message : 'The subscription could not be completed.'); }
              finally { setPaywallBusy(false); }
            }}>
              <Text style={{ color: themePrimaryText, fontWeight: '800' }}>{paywallBusy ? 'Please wait…' : `Subscribe ${BOB_MONTHLY_PRICE}/month`}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={paywallBusy} onPress={async () => {
              setPaywallBusy(true);
              setPaywallError(null);
              try { setAccess(await restoreBob()); }
              catch (error) { setPaywallError(error instanceof Error ? error.message : 'No subscription was found.'); }
              finally { setPaywallBusy(false); }
            }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Restore subscription</Text>
            </TouchableOpacity>
          </View>
        ) : <>
        <View style={[styles.cabinetRow, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Use only my cabinet</Text>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{useCabinet ? `${inventory.length} ingredients · only complete recipes` : 'Explore the full recipe catalog'}</Text>
          </View>
          <Switch accessibilityLabel="Use only my cabinet" value={useCabinet} onValueChange={setUseCabinet} disabled={loading || !inventoryLoaded} />
        </View>
        {useCabinet && inventoryError && <Text accessibilityRole="alert" style={{ color: colors.text, padding: 16 }}>Your cabinet could not be saved or loaded. Open My Cabinet to retry.</Text>}

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
              <TouchableOpacity accessibilityRole="button" onPress={() => chatRequest.current?.abort()} style={{ padding: 12 }}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {requestError && <View accessibilityRole="alert" style={[styles.errorRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, flex: 1 }}>{requestError}</Text>
          {failedRequest && <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => sendMessage(true)} style={{ padding: 12 }}><Text style={{ color: themePrimary, fontWeight: '700' }}>Retry</Text></TouchableOpacity>}
        </View>}
        {isTranscribing && <Text accessibilityLiveRegion="polite" style={{ color: colors.subtext, paddingHorizontal: 20 }}>Transcribing — review the text before sending.</Text>}
        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: 12 }]}>
          <TouchableOpacity style={styles.modeButton} onPress={() => setInputMode(prev => prev === 'text' ? 'voice' : 'text')} disabled={isMicBusy || isTranscribing || loading}>
            {inputMode === 'text' ? <Ionicons name="mic-outline" size={26} color={colors.text} /> : <MaterialIcons name="keyboard" size={26} color={colors.text} />}
          </TouchableOpacity>

          {inputMode === 'text' ? (
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => sendMessage()}
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
                {isRecording ? "Release to Transcribe" : "Hold to Talk"}
              </Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.sendButton, { backgroundColor: inputText.trim() && inputMode === 'text' ? themePrimary : colors.border, opacity: inputMode === 'text' ? 1 : 0 }]} 
            accessibilityLabel="Send message" onPress={() => sendMessage()} disabled={!inputText.trim() || loading || isTranscribing || inputMode === 'voice' || (useCabinet && (!inventoryLoaded || !!inventoryError))}
          >
            <Ionicons name="send" size={18} color={inputText.trim() ? themePrimaryText : colors.subtext} />
          </TouchableOpacity>
        </View>
        </>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cabinetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
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
  paywall: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  paywallButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
