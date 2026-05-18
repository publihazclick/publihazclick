import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  Animated,
  Platform,
  Linking,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  Shield,
  Star,
  ChevronRight,
  X,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  Car,
  User,
} from 'lucide-react-native';

type TripStage = 'heading' | 'arrived' | 'onboard' | 'completed';

interface ChatMessage {
  id: string;
  text: string;
  from: 'driver' | 'passenger';
  time: string;
}

const DRIVER = {
  name: 'Carlos Martínez',
  initials: 'CM',
  rating: 4.9,
  trips: 842,
  plate: 'ABC-123',
  car: 'Toyota Corolla',
  color: 'Blanco',
  phone: '+573001234567',
  eta: 4,
};

const DESTINATION = 'Centro Comercial Andino';
const PRICE = 12000;

const STAGE_CONFIG: Record<TripStage, { label: string; sub: string; color: string; bg: string }> = {
  heading:   { label: 'Conductor en camino',   sub: 'Tu conductor se está acercando',       color: '#7C3AED', bg: '#F5F3FF' },
  arrived:   { label: 'Conductor llegó',        sub: 'Dirígete al punto de recogida',        color: '#D97706', bg: '#FEF3C7' },
  onboard:   { label: 'En camino al destino',   sub: 'Disfruta tu viaje, tú mandas el precio', color: '#059669', bg: '#ECFDF5' },
  completed: { label: '¡Llegaste!',             sub: 'Califica tu experiencia',              color: '#059669', bg: '#ECFDF5' },
};

const QUICK_REPLIES = ['Voy en 2 min', '¿Dónde estás?', 'Ya salgo', 'Ok, te espero'];

export default function PassengerTrip() {
  const router = useRouter();
  const [stage, setStage] = useState<TripStage>('heading');
  const [eta, setEta] = useState(DRIVER.eta);
  const [chatOpen, setChatOpen] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [message, setMessage] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', text: 'Hola, ya voy hacia tu ubicación 🚗', from: 'driver', time: '10:42' },
  ]);
  const pulse = useRef(new Animated.Value(1)).current;
  const panicScale = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    if (stage === 'arrived') loop.start();
    else loop.stop();
    return () => loop.stop();
  }, [stage]);

  useEffect(() => {
    if (stage !== 'heading') return;
    const t = setInterval(() => {
      setEta(e => {
        if (e <= 1) {
          clearInterval(t);
          setStage('arrived');
          return 0;
        }
        return e - 1;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    if (stage === 'arrived') {
      const t = setTimeout(() => {
        const msg: ChatMessage = {
          id: Date.now().toString(),
          text: 'Ya llegué, estoy en la entrada principal 📍',
          from: 'driver',
          time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(p => [...p, msg]);
      }, 3000);
      return () => clearTimeout(t);
    }
    if (stage === 'onboard') {
      const t = setTimeout(() => {
        const msg: ChatMessage = {
          id: Date.now().toString(),
          text: '¡Listo! Rumbo al destino 🛣️',
          from: 'driver',
          time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(p => [...p, msg]);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const sendMessage = (text?: string) => {
    const t = text ?? message.trim();
    if (!t) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      text: t,
      from: 'passenger',
      time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => [...p, msg]);
    setMessage('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handlePanic = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    setPanicOpen(false);
    Linking.openURL('tel:123');
  };

  const handleRatingSubmit = async () => {
    setSubmittingRating(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmittingRating(false);
    router.replace('/passenger/home');
  };

  const cfg = STAGE_CONFIG[stage];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: Platform.OS === 'android' ? 16 : 8,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#000000' }}>Viaje en curso</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setChatOpen(true)}
            style={{
              width: 36,
              height: 36,
              backgroundColor: '#F3F4F6',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MessageCircle size={18} color="#374151" strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${DRIVER.phone}`)}
            style={{
              width: 36,
              height: 36,
              backgroundColor: '#F3F4F6',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Phone size={18} color="#374151" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            marginHorizontal: 24,
            marginTop: 20,
            backgroundColor: cfg.bg,
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale: stage === 'arrived' ? pulse : 1 }],
              width: 44,
              height: 44,
              backgroundColor: cfg.color,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {stage === 'completed'
              ? <CheckCircle size={22} color="#FFFFFF" strokeWidth={2} />
              : stage === 'onboard'
              ? <Navigation size={22} color="#FFFFFF" strokeWidth={2} />
              : stage === 'arrived'
              ? <MapPin size={22} color="#FFFFFF" strokeWidth={2} />
              : <Car size={22} color="#FFFFFF" strokeWidth={2} />
            }
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{cfg.label}</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{cfg.sub}</Text>
          </View>
          {stage === 'heading' && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: cfg.color }}>{eta}</Text>
              <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '500' }}>min</Text>
            </View>
          )}
        </View>

        <View
          style={{
            marginHorizontal: 24,
            marginTop: 12,
            backgroundColor: '#F9FAFB',
            borderRadius: 16,
            overflow: 'hidden',
            height: 180,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#F3F4F6',
          }}
        >
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 48,
                height: 48,
                backgroundColor: '#E5E7EB',
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Navigation size={22} color="#9CA3AF" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500' }}>
              Mapa en tiempo real
            </Text>
            <Text style={{ fontSize: 11, color: '#D1D5DB' }}>
              Integrar MapView aquí
            </Text>
          </View>
        </View>

        <View
          style={{
            marginHorizontal: 24,
            marginTop: 12,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#F3F4F6',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F9FAFB',
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                backgroundColor: '#7C3AED',
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>
                {DRIVER.initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
                {DRIVER.name}
              </Text>
              <Text style={{ fontSize: 13, color: '#9CA3AF', marginTop: 1 }}>
                {DRIVER.car} · {DRIVER.color} · {DRIVER.plate}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>
                  ★ {DRIVER.rating}
                </Text>
                <Text style={{ fontSize: 13, color: '#D1D5DB' }}>·</Text>
                <Text style={{ fontSize: 13, color: '#9CA3AF' }}>{DRIVER.trips} viajes</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row' }}>
            <View
              style={{
                flex: 1,
                padding: 16,
                borderRightWidth: 1,
                borderRightColor: '#F3F4F6',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.6 }}>
                DESTINO
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                {DESTINATION}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 16, gap: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.6 }}>
                PRECIO
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#000000' }}>
                ${PRICE.toLocaleString('es-CO')}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 24, marginTop: 12 }}>
          {stage === 'heading' && (
            <TouchableOpacity
              onPress={() => setCancelOpen(true)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                height: 48,
                backgroundColor: '#FEF2F2',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              <X size={16} color="#EF4444" strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444' }}>Cancelar</Text>
            </TouchableOpacity>
          )}

          {stage === 'arrived' && (
            <TouchableOpacity
              onPress={() => setStage('onboard')}
              activeOpacity={0.85}
              style={{
                flex: 1,
                height: 48,
                backgroundColor: '#000000',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              <User size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Ya subí al vehículo</Text>
            </TouchableOpacity>
          )}

          {stage === 'onboard' && (
            <TouchableOpacity
              onPress={() => setStage('completed')}
              activeOpacity={0.85}
              style={{
                flex: 1,
                height: 48,
                backgroundColor: '#059669',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              <CheckCircle size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Llegué al destino</Text>
            </TouchableOpacity>
          )}

          {stage === 'completed' && (
            <TouchableOpacity
              onPress={() => setRatingOpen(true)}
              activeOpacity={0.85}
              style={{
                flex: 1,
                height: 48,
                backgroundColor: '#7C3AED',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              <Star size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Calificar viaje</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setPanicOpen(true)}
            activeOpacity={0.8}
            style={{
              width: 48,
              height: 48,
              backgroundColor: '#FEF2F2',
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={20} color="#EF4444" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            marginHorizontal: 24,
            marginTop: 12,
            flexDirection: 'row',
            gap: 4,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {(['heading', 'arrived', 'onboard', 'completed'] as TripStage[]).map((s, i) => {
            const done = ['heading', 'arrived', 'onboard', 'completed'].indexOf(stage) >= i;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: done ? '#7C3AED' : '#E5E7EB',
                  }}
                />
                {i < 3 && (
                  <View
                    style={{
                      width: 24,
                      height: 2,
                      backgroundColor: done && stage !== s ? '#7C3AED' : '#E5E7EB',
                      borderRadius: 999,
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 24, marginTop: 6 }}>
          {['En camino', 'Llegó', 'En viaje', 'Completado'].map((label, i) => {
            const done = ['heading', 'arrived', 'onboard', 'completed'].indexOf(stage) >= i;
            return (
              <Text
                key={label}
                style={{
                  fontSize: 9,
                  fontWeight: done ? '700' : '400',
                  color: done ? '#7C3AED' : '#D1D5DB',
                  textAlign: 'center',
                  width: 52,
                }}
              >
                {label}
              </Text>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              height: '75%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: '#F3F4F6',
              }}
            >
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>{DRIVER.name}</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{DRIVER.car} · {DRIVER.plate}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setChatOpen(false)}
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

            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map(msg => (
                <View
                  key={msg.id}
                  style={{
                    alignSelf: msg.from === 'passenger' ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    marginBottom: 6,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: msg.from === 'passenger' ? '#7C3AED' : '#F3F4F6',
                      borderRadius: 16,
                      borderBottomRightRadius: msg.from === 'passenger' ? 4 : 16,
                      borderBottomLeftRadius: msg.from === 'driver' ? 4 : 16,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: msg.from === 'passenger' ? '#FFFFFF' : '#111827',
                        lineHeight: 20,
                      }}
                    >
                      {msg.text}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: '#D1D5DB',
                      marginTop: 3,
                      alignSelf: msg.from === 'passenger' ? 'flex-end' : 'flex-start',
                      paddingHorizontal: 2,
                    }}
                  >
                    {msg.time}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {QUICK_REPLIES.map(r => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => sendMessage(r)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        backgroundColor: '#F3F4F6',
                        borderRadius: 999,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: '#F9FAFB',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  marginBottom: Platform.OS === 'ios' ? 16 : 8,
                }}
              >
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Escribe un mensaje..."
                  placeholderTextColor="#D1D5DB"
                  style={{ flex: 1, fontSize: 15, color: '#111827', maxHeight: 80 }}
                  multiline
                  onSubmitEditing={() => sendMessage()}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  onPress={() => sendMessage()}
                  disabled={!message.trim()}
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: message.trim() ? '#7C3AED' : '#E5E7EB',
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send size={16} color="#FFFFFF" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={panicOpen} animationType="fade" transparent onRequestClose={() => setPanicOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 28,
              width: '100%',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                backgroundColor: '#FEF2F2',
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={30} color="#EF4444" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#000000', textAlign: 'center' }}>
              ¿Estás en peligro?
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 }}>
              Al confirmar, se llamará al{' '}
              <Text style={{ fontWeight: '700', color: '#111827' }}>123</Text>
              {' '}y se compartirá tu ubicación con las autoridades.
            </Text>
            <TouchableOpacity
              onPress={handlePanic}
              activeOpacity={0.85}
              style={{
                width: '100%',
                height: 56,
                backgroundColor: '#EF4444',
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>
                🆘 Llamar al 123
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPanicOpen(false)}
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ fontSize: 15, color: '#6B7280', fontWeight: '500' }}>Cancelar, estoy bien</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={cancelOpen} animationType="fade" transparent onRequestClose={() => setCancelOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 28,
              width: '100%',
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#000000' }}>¿Cancelar viaje?</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 21 }}>
              El conductor ya está en camino. Cancelar ahora puede afectar tu calificación como pasajero.
            </Text>
            <View
              style={{
                backgroundColor: '#FEF3C7',
                borderRadius: 12,
                padding: 12,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <Clock size={16} color="#D97706" strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#92400E', lineHeight: 19 }}>
                Cancelaciones frecuentes pueden resultar en restricciones de la cuenta.
              </Text>
            </View>
            <View style={{ gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => {
                  setCancelOpen(false);
                  router.replace('/passenger/home');
                }}
                activeOpacity={0.85}
                style={{
                  height: 52,
                  backgroundColor: '#EF4444',
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Sí, cancelar viaje</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCancelOpen(false)}
                activeOpacity={0.8}
                style={{
                  height: 52,
                  backgroundColor: '#F3F4F6',
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>No, mantener viaje</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={ratingOpen} animationType="slide" transparent onRequestClose={() => {}}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 28,
              paddingBottom: Platform.OS === 'ios' ? 40 : 28,
            }}
          >
            <View style={{ alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  backgroundColor: '#7C3AED',
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}>{DRIVER.initials}</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#000000' }}>
                ¿Cómo estuvo {DRIVER.name.split(' ')[0]}?
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
                Tu calificación ayuda a mejorar la comunidad Movi
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setStars(n)} activeOpacity={0.7}>
                  <Text style={{ fontSize: 40 }}>{n <= stars ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 24,
              }}
            >
              {[
                { emoji: '😊', label: 'Amable' },
                { emoji: '⏱', label: 'Puntual' },
                { emoji: '🚗', label: 'Auto limpio' },
                { emoji: '🛡', label: 'Seguro' },
              ].map(tag => (
                <TouchableOpacity
                  key={tag.label}
                  activeOpacity={0.8}
                  style={{
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#F9FAFB',
                    borderRadius: 12,
                    padding: 12,
                    width: '22%',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{tag.emoji}</Text>
                  <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500', textAlign: 'center' }}>
                    {tag.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={handleRatingSubmit}
                activeOpacity={0.85}
                disabled={submittingRating || stars === 0}
                style={{
                  height: 56,
                  backgroundColor: stars > 0 ? '#7C3AED' : '#E5E7EB',
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {submittingRating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '600',
                      color: stars > 0 ? '#FFFFFF' : '#9CA3AF',
                    }}
                  >
                    Enviar calificación
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.replace('/passenger/home')}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 15, color: '#9CA3AF', fontWeight: '400' }}>Omitir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
