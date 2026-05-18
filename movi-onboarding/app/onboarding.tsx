import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Clipboard,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Tag, ShieldCheck, Zap, Gift, X, Copy, Check } from 'lucide-react-native';

const REFERRAL_LINK = 'https://movi.app/ref/USR-XXXX';

export default function Onboarding() {
  const router = useRouter();
  const [referralOpen, setReferralOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    Clipboard.setString(REFERRAL_LINK);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: Platform.OS === 'android' ? 24 : 16,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '900',
              color: '#000000',
              letterSpacing: -0.5,
              height: 40,
              lineHeight: 40,
              fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-black',
            }}
          >
            MOVI
          </Text>
        </View>

        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: '#000000',
              lineHeight: 38,
              textAlign: 'center',
              fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
              letterSpacing: -0.3,
            }}
          >
            {'Pide tu precio.\nTú mandas.'}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '400',
              color: '#6B7280',
              marginTop: 8,
              textAlign: 'center',
              fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
              lineHeight: 24,
            }}
          >
            Viajes hasta{' '}
            <Text style={{ fontWeight: '600', color: '#000000' }}>30% más baratos</Text>{' '}
            que otras apps
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginTop: 40,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: '#F5F3FF',
              borderRadius: 16,
              padding: 16,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Tag size={20} color="#7C3AED" strokeWidth={2} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: '#7C3AED',
                textAlign: 'center',
                lineHeight: 20,
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
              }}
            >
              {'Tú propones\nel precio'}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: '#ECFDF5',
              borderRadius: 16,
              padding: 16,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ShieldCheck size={20} color="#059669" strokeWidth={2} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: '#059669',
                textAlign: 'center',
                lineHeight: 20,
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
              }}
            >
              {'Conductores\ncon rating 4.8+'}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: '#FEF3C7',
              borderRadius: 16,
              padding: 16,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Zap size={20} color="#D97706" strokeWidth={2} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: '#D97706',
                textAlign: 'center',
                lineHeight: 20,
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
              }}
            >
              {'Disponible\n24/7'}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 48 }}>
          <TouchableOpacity
            onPress={() => router.push('/auth/phone')}
            activeOpacity={0.85}
            style={{
              height: 56,
              backgroundColor: '#7C3AED',
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                letterSpacing: -0.1,
              }}
            >
              Solicitar viaje
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/driver/signup')}
            activeOpacity={0.85}
            style={{
              height: 56,
              backgroundColor: '#000000',
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 12,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                letterSpacing: -0.1,
              }}
            >
              Conducir con Movi
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setReferralOpen(true)}
          activeOpacity={0.8}
          style={{
            marginTop: 24,
            backgroundColor: '#FFFBEB',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#FDE68A',
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Gift size={18} color="#D97706" strokeWidth={2} />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: '500',
              color: '#92400E',
              lineHeight: 18,
              fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
            }}
          >
            Invita amigos y gana{' '}
            <Text style={{ fontWeight: '700' }}>$5.000 en créditos</Text> para tu próximo viaje
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={referralOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReferralOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        >
          <SafeAreaView style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            <View style={{ padding: 24 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: '#000000',
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                  }}
                >
                  Invita y gana
                </Text>
                <TouchableOpacity
                  onPress={() => setReferralOpen(false)}
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: '#F3F4F6',
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} color="#6B7280" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <View
                style={{
                  backgroundColor: '#FFFBEB',
                  borderRadius: 16,
                  padding: 20,
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 20,
                }}
              >
                <Gift size={28} color="#D97706" strokeWidth={2} />
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: '700',
                    color: '#000000',
                    marginTop: 4,
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                  }}
                >
                  $5.000
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: '#92400E',
                    textAlign: 'center',
                    lineHeight: 20,
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
                  }}
                >
                  por cada amigo que complete su primer viaje
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#6B7280',
                  letterSpacing: 0.8,
                  marginBottom: 8,
                  fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                }}
              >
                TU ENLACE DE INVITACIÓN
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F9FAFB',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  paddingLeft: 14,
                  paddingRight: 4,
                  height: 52,
                  gap: 8,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: '#374151',
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
                  }}
                >
                  {REFERRAL_LINK}
                </Text>
                <TouchableOpacity
                  onPress={copyLink}
                  activeOpacity={0.7}
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    backgroundColor: copied ? '#059669' : '#000000',
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  {copied ? (
                    <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <Copy size={14} color="#FFFFFF" strokeWidth={2} />
                  )}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#FFFFFF',
                      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
                    }}
                  >
                    {copied ? 'Copiado' : 'Copiar'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={{
                  fontSize: 12,
                  color: '#9CA3AF',
                  textAlign: 'center',
                  marginTop: 16,
                  lineHeight: 18,
                  fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
                }}
              >
                Comparte el enlace por WhatsApp, Instagram o donde quieras.{'\n'}
                Los créditos se acreditan automáticamente.
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
