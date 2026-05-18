import { useState, useRef } from 'react';
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
import { useRouter } from 'expo-router';
import { ChevronLeft, Phone } from 'lucide-react-native';

const COUNTRY_CODE = '+57';

export default function AuthPhone() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length === 10;

  const formatDisplay = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  };

  const handleChange = (val: string) => {
    setError('');
    setPhone(formatDisplay(val));
  };

  const handleContinue = async () => {
    if (!isValid) {
      setError('Ingresa un número de celular válido de 10 dígitos.');
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    router.push({ pathname: '/auth/otp', params: { phone: COUNTRY_CODE + digits } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
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
              <Phone size={24} color="#7C3AED" strokeWidth={2} />
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
              Tu número de celular
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
              Te enviaremos un código SMS para verificar tu número.
            </Text>
          </View>

          <View style={{ marginTop: 40 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: '#6B7280',
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              NÚMERO DE CELULAR
            </Text>

            <TouchableOpacity
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: error ? '#EF4444' : '#E5E7EB',
                borderRadius: 14,
                height: 56,
                paddingHorizontal: 16,
                gap: 10,
              }}
            >
              <View
                style={{
                  paddingRight: 10,
                  borderRightWidth: 1.5,
                  borderRightColor: '#E5E7EB',
                  height: 24,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#000000',
                  }}
                >
                  🇨🇴 {COUNTRY_CODE}
                </Text>
              </View>
              <TextInput
                ref={inputRef}
                value={phone}
                onChangeText={handleChange}
                keyboardType="phone-pad"
                placeholder="300 123 4567"
                placeholderTextColor="#D1D5DB"
                style={{
                  flex: 1,
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#000000',
                  padding: 0,
                  letterSpacing: 0.5,
                }}
                autoFocus
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              {digits.length > 0 && (
                <Text
                  style={{
                    fontSize: 13,
                    color: isValid ? '#059669' : '#9CA3AF',
                    fontWeight: '500',
                  }}
                >
                  {digits.length}/10
                </Text>
              )}
            </TouchableOpacity>

            {error ? (
              <Text
                style={{
                  fontSize: 13,
                  color: '#EF4444',
                  marginTop: 8,
                  fontWeight: '400',
                }}
              >
                {error}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: 32 }}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.85}
              disabled={loading || !isValid}
              style={{
                height: 56,
                backgroundColor: isValid ? '#7C3AED' : '#E5E7EB',
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
                    color: isValid ? '#FFFFFF' : '#9CA3AF',
                    letterSpacing: -0.1,
                  }}
                >
                  Continuar
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontSize: 12,
              color: '#9CA3AF',
              textAlign: 'center',
              marginTop: 20,
              lineHeight: 18,
            }}
          >
            Al continuar, aceptas nuestros{' '}
            <Text style={{ color: '#7C3AED', fontWeight: '500' }}>Términos de servicio</Text>
            {' '}y{' '}
            <Text style={{ color: '#7C3AED', fontWeight: '500' }}>Política de privacidad</Text>.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
