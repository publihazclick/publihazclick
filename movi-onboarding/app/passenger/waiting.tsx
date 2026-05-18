import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, X, ChevronRight, Car, Clock } from 'lucide-react-native';

const TOTAL_SECONDS = 90;

const MOCK_OFFERS = [
  { id: '1', name: 'Carlos M.', rating: 4.9, trips: 842, plate: 'ABC-123', eta: '4 min', price: 12000, car: 'Toyota Corolla · Blanco' },
  { id: '2', name: 'Diego R.', rating: 4.7, trips: 321, plate: 'XYZ-456', eta: '7 min', price: 11500, car: 'Chevrolet Spark · Gris' },
];

export default function PassengerWaiting() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(TOTAL_SECONDS);
  const [driverCount, setDriverCount] = useState(0);
  const [offers, setOffers] = useState<typeof MOCK_OFFERS>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: TOTAL_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();

    const tick = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(tick); return 0; }
        return s - 1;
      });
    }, 1000);

    const t1 = setTimeout(() => setDriverCount(1), 3000);
    const t2 = setTimeout(() => setDriverCount(3), 9000);
    const t3 = setTimeout(() => setDriverCount(5), 18000);
    const t4 = setTimeout(() => setOffers(MOCK_OFFERS), 5000);

    return () => {
      clearInterval(tick);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      loop.stop();
    };
  }, []);

  const handleAccept = async (id: string) => {
    setAccepting(id);
    await new Promise(r => setTimeout(r, 800));
    router.replace('/passenger/trip');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: Platform.OS === 'android' ? 16 : 8,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#000000' }}>
          Buscando conductor
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/passenger/home')}
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
          height: 3,
          backgroundColor: '#F3F4F6',
          marginHorizontal: 24,
          marginTop: 16,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            width: progressWidth,
            backgroundColor: seconds > 30 ? '#7C3AED' : '#EF4444',
            borderRadius: 999,
          }}
        />
      </View>

      <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 24 }}>
        <Animated.View
          style={{
            transform: [{ scale: pulse }],
            width: 80,
            height: 80,
            backgroundColor: '#F5F3FF',
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Car size={36} color="#7C3AED" strokeWidth={1.5} />
        </Animated.View>

        <Text style={{ fontSize: 32, fontWeight: '700', color: '#000000', letterSpacing: -0.5 }}>
          {formatTime(seconds)}
        </Text>
        <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>
          Tiempo restante para recibir ofertas
        </Text>

        {driverCount > 0 && (
          <View
            style={{
              marginTop: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#F0FDF4',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
            }}
          >
            <View style={{ width: 8, height: 8, backgroundColor: '#059669', borderRadius: 999 }} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>
              {driverCount} conductor{driverCount !== 1 ? 'es' : ''} viendo tu solicitud
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: '#F9FAFB',
          marginHorizontal: 24,
          borderRadius: 14,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <MapPin size={16} color="#7C3AED" strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '500' }}>Destino</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
            Centro Comercial Andino
          </Text>
        </View>
        <Clock size={14} color="#9CA3AF" strokeWidth={2} />
        <Text style={{ fontSize: 13, color: '#9CA3AF', fontWeight: '500' }}>~15 min</Text>
      </View>

      {offers.length > 0 && (
        <View style={{ paddingHorizontal: 24 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: '#6B7280',
              letterSpacing: 0.8,
              marginBottom: 12,
            }}
          >
            OFERTAS RECIBIDAS
          </Text>
          {offers.map(offer => (
            <View
              key={offer.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
                padding: 16,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: '#7C3AED',
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                    {offer.name[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                    {offer.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                    {offer.car} · {offer.plate}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706' }}>
                      ★ {offer.rating}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{offer.trips} viajes</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} color="#059669" strokeWidth={2.5} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>
                        {offer.eta}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#000000', letterSpacing: -0.5 }}>
                    ${offer.price.toLocaleString('es-CO')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleAccept(offer.id)}
                activeOpacity={0.85}
                disabled={!!accepting}
                style={{
                  height: 48,
                  backgroundColor: accepting === offer.id ? '#059669' : '#000000',
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                  {accepting === offer.id ? 'Aceptando...' : 'Aceptar oferta'}
                </Text>
                {!accepting && <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
