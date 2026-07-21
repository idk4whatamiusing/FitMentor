import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';

type Msg = {role: 'user' | 'assistant'; content: string};

const STARTERS = [
  'How much protein do I need?',
  'I missed gym for 3 days, what now?',
  'My weight is not increasing',
  'Can I build muscle without whey?',
  'Is my workout plan good?',
];

// ponytail: stub coach — real impl needs server function from web
async function askCoach(_messages: Msg[]): Promise<string> {
  return 'This is a demo response. Connect the coach API for real answers!';
}

export default function CoachScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const newMsgs: Msg[] = [...messages, {role: 'user', content: q}];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);
    try {
      const res = await askCoach(newMsgs);
      setMessages([...newMsgs, {role: 'assistant', content: res}]);
    } catch {
      setMessages([...newMsgs, {role: 'assistant', content: 'Coach unavailable.'}]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>✨</Text>
          </View>
          <View style={s.onlineDot} />
        </View>
        <View>
          <Text style={s.headerTitle}>FitMentor Coach</Text>
          <Text style={s.headerSub}>Online • Ready when you are</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({animated: true})}>
        {messages.length === 0 && (
          <View style={s.starterSection}>
            <View style={s.starterBubble}>
              <Text style={s.starterIntro}>
                Hey! I'm your coach. Ask me anything about training, nutrition, or your plan.
                I know your goals, diet, and budget — so my answers are made just for you. 💪
              </Text>
            </View>
            <Text style={s.starterLabel}>Try asking</Text>
            {STARTERS.map(s => (
              <TouchableOpacity key={s} style={s.starterBtn} onPress={() => send(s)}>
                <Text style={s.starterBtnText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <View
            key={i}
            style={[s.bubbleRow, m.role === 'user' ? s.bubbleRowRight : s.bubbleRowLeft]}>
            <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
              <Text style={m.role === 'user' ? s.bubbleUserText : s.bubbleAssistantText}>
                {m.content}
              </Text>
            </View>
          </View>
        ))}

        {loading && (
          <View style={s.bubbleRowLeft}>
            <View style={[s.bubble, s.bubbleAssistant]}>
              <Text style={s.bubbleAssistantText}>Thinking…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your coach…"
          placeholderTextColor="#64748b"
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || loading}>
          <Text style={s.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  avatarWrap: {position: 'relative'},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 20},
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34d399',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  headerTitle: {fontSize: 16, fontWeight: 'bold', color: '#f8fafc'},
  headerSub: {fontSize: 12, color: '#94a3b8'},
  messages: {padding: 20, paddingBottom: 8},
  starterSection: {gap: 8},
  starterBubble: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
  },
  starterIntro: {fontSize: 14, color: '#f8fafc', lineHeight: 20},
  starterLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  starterBtn: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  starterBtnText: {fontSize: 12, color: '#f8fafc'},
  bubbleRow: {marginBottom: 8},
  bubbleRowRight: {alignItems: 'flex-end'},
  bubbleRowLeft: {alignItems: 'flex-start'},
  bubble: {maxWidth: '85%', borderRadius: 16, padding: 12},
  bubbleUser: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  bubbleUserText: {fontSize: 14, color: '#f8fafc', lineHeight: 20},
  bubbleAssistant: {
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  bubbleAssistantText: {fontSize: 14, color: '#e2e8f0', lineHeight: 20},
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#f8fafc',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {opacity: 0.5},
  sendBtnText: {fontSize: 20, color: '#f8fafc', fontWeight: 'bold'},
});
