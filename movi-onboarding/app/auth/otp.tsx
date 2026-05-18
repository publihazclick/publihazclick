import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MessageSquare } from 'lucide-react-native';

const CODE_LENGTH = 6;

export default function AuthOtp() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(p => p - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const filled = code.join('');
  const isComplete = filled.length === CODE_LENGTH;

  const handleInput = (val: string, idx: number) => {
    setError('');
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every(d => d !== '') ) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (value?: string) => {
    const c = value ?? filled;
    if (c.length !== CODE_LENGTH) return;
    setLoading(true);
    setError('');
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    if (c === '000000') {
      setError('Código incorrecto. Verifica e intenta de nuevo.');
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      return;
    }
    router.replace('/passenger/home');
  };

  const handleResend = () => {
    setCode(Array(CODE_LENGTH).fill(''));
    setError('');
    setCountdown(30);
    inputRefs.current[0]?.focus();
  };

  const displayPhone = phone ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <View style={{ paddingTop: Platform.OS === 'android' ? 16 : 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                backgroundColor: '#F3F4F6',
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#000000" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 32 }}>
            <View
              style={{
                width: 56,
                height: 56,
                backgroundColor: '#F5F3FF',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <MessageSquare size={24} color="#7C3AED" strokeWidth={2} />
            </View>
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: '#000000',
                lineHeight: 34,
                letterSpacing: -0.3,
              }}
            >
              Código de verificación
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '400',
                color: '#6B7280',
                marginTop: 6,
                lineHeight: 22,
              }}
            >
              Enviamos un SMS con el código a{'\n'}
              <Text style={{ fontWeight: '600', color: '#000000' }}>{displayPhone}</Text>
            </Text>
          </View>

          <View style={{ marginTop: 40 }}>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              {Array(CODE_LENGTH).fill(0).map((_, i) => (
                <TextInput
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  value={code[i]}
                  onChangeText={val => handleInput(val, i)}
                  onKeyPress={e => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  style={{
                    width: 48,
                    height: 56,
                    borderWidth: 1.5,
                    borderColor: error
                      ? '#EF4444'
                      : code[i]
                      ? '#7C3AED'
                      : '#E5E7EB',
                    borderRadius: 14,
                    textAlign: 'center',
                    fontSize: 22,
                    fontWeight: '700',
                    color: '#000000',
                    backgroundColor: code[i] ? '#F5F3FF' : '#FFFFFF',
                  }}
                  editable={!loading}
                  selectTextOnFocus
                />
              ))}
            </View>

            {error ? (
              <Text
                style={{
                  fontSize: 13,
                  color: '#EF4444',
                  marginTop: 12,
                  textAlign: 'center',
                  fontWeight: '400',
                }}
              >
                {error}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: 32 }}>
            <TouchableOpacity
              onPress={() => handleVerify()}
              activeOpacity={0.85}
              disabled={loading || !isComplete}
              style={{
                height: 56,
                backgroundColor: isComplete ? '#7C3AED' : '#E5E7EB',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '600',
                    color: isComplete ? '#FFFFFF' : '#9CA3AF',
                    letterSpacing: -0.1,
                  }}
                >
                  Verificar código
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View
            style={{
              marginTop: 24,
              alignItems: 'center',
            }}
          >
            {countdown > 0 ? (
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>
                Reenviar código en{' '}
                <Text style={{ color: '#7C3AED', fontWeight: '600' }}>{countdown}s</Text>
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                <Text
                  style={{
                    fontSize: 14,
                    color: '#7C3AED',
                    fontWeight: '600',
                  }}
                >
                  ¿No llegó el código? Reenviar SMS
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={{ marginTop: 16, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '400' }}>
              Cambiar número de teléfono
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
