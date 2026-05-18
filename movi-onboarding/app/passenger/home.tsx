import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  MapPin,
  Search,
  Clock,
  Star,
  ChevronRight,
  Navigation,
  Car,
  Bike,
  CreditCard,
  Banknote,
  X,
  Minus,
  Plus,
} from 'lucide-react-native';

const RECENTS = [
  { id: '1', name: 'Centro Comercial Andino', address: 'Cl. 82 #11-53, Bogotá' },
  { id: '2', name: 'Aeropuerto El Dorado', address: 'Av. El Dorado, Bogotá' },
  { id: '3', name: 'Universidad Nacional', address: 'Carrera 45 #26-85, Bogotá' },
];

type Vehicle = 'carro' | 'moto';
type Payment = 'efectivo' | 'nequi' | 'tarjeta';

export default function PassengerHome() {
  const router = useRouter();
  const [tripOpen, setTripOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [selectedDest, setSelectedDest] = useState<(typeof RECENTS)[0] | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>('carro');
  const [price, setPrice] = useState(12000);
  const [payment, setPayment] = useState<Payment>('efectivo');
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState<'dest' | 'price'>('dest');

  const handleSelectDest = (item: (typeof RECENTS)[0]) => {
    setSelectedDest(item);
    setStep('price');
  };

  const handleSearch = async () => {
    setSearching(true);
    await new Promise(r => setTimeout(r, 1200));
    setSearching(false);
    setTripOpen(false);
    router.push('/passenger/waiting');
  };

  const adjustPrice = (delta: number) => {
    setPrice(p => Math.max(3000, p + delta));
  };

  const paymentOptions: { key: Payment; label: string; icon: any }[] = [
    { key: 'efectivo', label: 'Efectivo', icon: Banknote },
    { key: 'nequi', label: 'Nequi', icon: CreditCard },
    { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 24,
          paddingTop: Platform.OS === 'android' ? 16 : 8,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '900',
              color: '#000000',
              letterSpacing: -0.5,
            }}
          >
            MOVI
          </Text>
          <TouchableOpacity
            style={{
              width: 36,
              height: 36,
              backgroundColor: '#7C3AED',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>JD</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            color: '#000000',
            letterSpacing: -0.3,
            marginBottom: 4,
          }}
        >
          ¿A dónde vas?
        </Text>
        <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 20 }}>
          Tú propones el precio. El conductor decide.
        </Text>

        <TouchableOpacity
          onPress={() => { setStep('dest'); setTripOpen(true); }}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1.5,
            borderColor: '#E5E7EB',
            marginBottom: 24,
          }}
        >
          <Search size={20} color="#7C3AED" strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 16, color: '#9CA3AF', fontWeight: '400' }}>
            Buscar destino...
          </Text>
        </TouchableOpacity>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#F3F4F6',
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280', letterSpacing: 0.8 }}>
              RECIENTES
            </Text>
          </View>
          {RECENTS.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => { setTripOpen(true); handleSelectDest(item); }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: idx < RECENTS.length - 1 ? 1 : 0,
                borderBottomColor: '#F9FAFB',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: '#F3F4F6',
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={16} color="#6B7280" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                  {item.address}
                </Text>
              </View>
              <ChevronRight size={16} color="#D1D5DB" strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={{
            backgroundColor: '#7C3AED',
            borderRadius: 16,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
              MOVI PASS
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 }}>
              Ahorra en cada viaje con suscripción mensual
            </Text>
          </View>
          <Star size={32} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
        </View>
      </ScrollView>

      <Modal
        visible={tripOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setTripOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#F3F4F6',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#000000' }}>
                {step === 'dest' ? 'Elige tu destino' : 'Propón tu precio'}
              </Text>
              <TouchableOpacity
                onPress={() => setTripOpen(false)}
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
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {step === 'dest' && (
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: '#F9FAFB',
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: '#E5E7EB',
                      paddingHorizontal: 14,
                      height: 52,
                      marginTop: 16,
                      marginBottom: 20,
                    }}
                  >
                    <Search size={18} color="#9CA3AF" strokeWidth={2} />
                    <TextInput
                      value={destination}
                      onChangeText={setDestination}
                      placeholder="Busca tu destino..."
                      placeholderTextColor="#D1D5DB"
                      style={{ flex: 1, fontSize: 15, color: '#111827' }}
                      autoFocus
                    />
                  </View>

                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: '#6B7280',
                      letterSpacing: 0.8,
                      marginBottom: 12,
                    }}
                  >
                    RECIENTES
                  </Text>
                  {RECENTS.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleSelectDest(item)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: '#F9FAFB',
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          backgroundColor: '#F3F4F6',
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MapPin size={16} color="#6B7280" strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                          {item.address}
                        </Text>
                      </View>
                      <Navigation size={16} color="#7C3AED" strokeWidth={2} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {step === 'price' && selectedDest && (
                <View style={{ paddingTop: 16, gap: 20 }}>
                  <View
                    style={{
                      backgroundColor: '#F9FAFB',
                      borderRadius: 14,
                      padding: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <MapPin size={18} color="#7C3AED" strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                        {selectedDest.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                        {selectedDest.address}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setStep('dest')}>
                      <Text style={{ fontSize: 13, color: '#7C3AED', fontWeight: '600' }}>
                        Cambiar
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#6B7280',
                        letterSpacing: 0.8,
                        marginBottom: 10,
                      }}
                    >
                      TIPO DE VEHÍCULO
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {([
                        { key: 'carro' as Vehicle, label: 'Carro', Icon: Car },
                        { key: 'moto' as Vehicle, label: 'Moto', Icon: Bike },
                      ] as const).map(({ key, label, Icon }) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => setVehicle(key)}
                          activeOpacity={0.8}
                          style={{
                            flex: 1,
                            height: 64,
                            backgroundColor: vehicle === key ? '#F5F3FF' : '#F9FAFB',
                            borderRadius: 14,
                            borderWidth: 1.5,
                            borderColor: vehicle === key ? '#7C3AED' : '#E5E7EB',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                        >
                          <Icon
                            size={20}
                            color={vehicle === key ? '#7C3AED' : '#9CA3AF'}
                            strokeWidth={2}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '600',
                              color: vehicle === key ? '#7C3AED' : '#9CA3AF',
                            }}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#6B7280',
                        letterSpacing: 0.8,
                        marginBottom: 10,
                      }}
                    >
                      TU PRECIO PROPUESTO
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F9FAFB',
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: '#E5E7EB',
                        paddingHorizontal: 8,
                        height: 64,
                        gap: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => adjustPrice(-500)}
                        style={{
                          width: 44,
                          height: 44,
                          backgroundColor: '#FFFFFF',
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Minus size={18} color="#374151" strokeWidth={2} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text
                          style={{ fontSize: 26, fontWeight: '700', color: '#000000', letterSpacing: -0.5 }}
                        >
                          ${price.toLocaleString('es-CO')}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                          El conductor puede contraofertar
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => adjustPrice(500)}
                        style={{
                          width: 44,
                          height: 44,
                          backgroundColor: '#FFFFFF',
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Plus size={18} color="#374151" strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#6B7280',
                        letterSpacing: 0.8,
                        marginBottom: 10,
                      }}
                    >
                      MÉTODO DE PAGO
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {paymentOptions.map(({ key, label, icon: Icon }) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => setPayment(key)}
                          activeOpacity={0.8}
                          style={{
                            flex: 1,
                            height: 52,
                            backgroundColor: payment === key ? '#F5F3FF' : '#F9FAFB',
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: payment === key ? '#7C3AED' : '#E5E7EB',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                        >
                          <Icon
                            size={16}
                            color={payment === key ? '#7C3AED' : '#9CA3AF'}
                            strokeWidth={2}
                          />
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '600',
                              color: payment === key ? '#7C3AED' : '#9CA3AF',
                            }}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleSearch}
                    activeOpacity={0.85}
                    disabled={searching}
                    style={{
                      height: 56,
                      backgroundColor: '#7C3AED',
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 4,
                    }}
                  >
                    {searching ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.1 }}>
                        Buscar conductor
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
