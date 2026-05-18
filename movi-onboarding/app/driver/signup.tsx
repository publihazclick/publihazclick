import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Car, Bike, User, Phone, Mail, CreditCard, Check } from 'lucide-react-native';

type Vehicle = 'carro' | 'moto';
type Step = 1 | 2 | 3;

interface Field {
  key: string;
  label: string;
  placeholder: string;
  icon: any;
  keyboard?: 'default' | 'phone-pad' | 'email-address';
  secure?: boolean;
}

const STEP1_FIELDS: Field[] = [
  { key: 'fullName', label: 'NOMBRE COMPLETO', placeholder: 'Juan Carlos Pérez', icon: User },
  { key: 'phone', label: 'CELULAR', placeholder: '300 123 4567', icon: Phone, keyboard: 'phone-pad' },
  { key: 'email', label: 'CORREO ELECTRÓNICO', placeholder: 'juan@email.com', icon: Mail, keyboard: 'email-address' },
  { key: 'idNumber', label: 'NÚMERO DE CÉDULA', placeholder: '1234567890', icon: CreditCard, keyboard: 'phone-pad' },
];

const STEP2_FIELDS: Field[] = [
  { key: 'plate', label: 'PLACA DEL VEHÍCULO', placeholder: 'ABC-123', icon: Car },
  { key: 'brand', label: 'MARCA', placeholder: 'Toyota', icon: Car },
  { key: 'model', label: 'MODELO', placeholder: 'Corolla', icon: Car },
  { key: 'year', label: 'AÑO', placeholder: '2020', icon: Car, keyboard: 'phone-pad' },
  { key: 'color', label: 'COLOR', placeholder: 'Blanco', icon: Car },
];

export default function DriverSignup() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [vehicle, setVehicle] = useState<Vehicle>('carro');
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: string, val: string) => {
    setForm(p => ({ ...p, [key]: val }));
    setErrors(p => ({ ...p, [key]: '' }));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    STEP1_FIELDS.forEach(f => {
      if (!form[f.key]?.trim()) e[f.key] = 'Este campo es obligatorio.';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    STEP2_FIELDS.forEach(f => {
      if (!form[f.key]?.trim()) e[f.key] = 'Este campo es obligatorio.';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = async () => {
    if (!terms) {
      setErrors(p => ({ ...p, terms: 'Debes aceptar los términos para continuar.' }));
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSubmitted(true);
  };

  const stepTitles: Record<Step, string> = {
    1: 'Tus datos personales',
    2: 'Tu vehículo',
    3: 'Últimos detalles',
  };

  const stepSubs: Record<Step, string> = {
    1: 'Necesitamos verificar tu identidad.',
    2: 'El vehículo con el que quieres trabajar.',
    3: 'Revisa y acepta para continuar.',
  };

  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={{ flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <View
            style={{
              width: 80,
              height: 80,
              backgroundColor: '#ECFDF5',
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={36} color="#059669" strokeWidth={2.5} />
          </View>
          <Text style={{ fontSize: 26, fontWeight: '700', color: '#000000', textAlign: 'center', letterSpacing: -0.3 }}>
            ¡Solicitud enviada!
          </Text>
          <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
            Tu solicitud está en revisión. Te notificaremos por SMS cuando sea aprobada.{'\n'}
            El proceso tarda entre 24 y 48 horas.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/onboarding')}
            activeOpacity={0.85}
            style={{
              height: 56,
              backgroundColor: '#000000',
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: Platform.OS === 'android' ? 16 : 8,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <TouchableOpacity
              onPress={() => (step === 1 ? router.back() : setStep((step - 1) as Step))}
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
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#000000' }}>
                Conducir con Movi
              </Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                Paso {step} de 3
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([1, 2, 3] as Step[]).map(s => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 3,
                  backgroundColor: s <= step ? '#000000' : '#E5E7EB',
                  borderRadius: 999,
                }}
              />
            ))}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
            {stepTitles[step]}
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 28 }}>
            {stepSubs[step]}
          </Text>

          {step === 1 && (
            <View style={{ gap: 16 }}>
              {STEP1_FIELDS.map(field => {
                const Icon = field.icon;
                return (
                  <View key={field.key}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: '#6B7280',
                        letterSpacing: 0.8,
                        marginBottom: 6,
                      }}
                    >
                      {field.label}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: errors[field.key] ? '#EF4444' : '#E5E7EB',
                        borderRadius: 14,
                        height: 52,
                        paddingHorizontal: 14,
                        gap: 10,
                      }}
                    >
                      <Icon size={18} color="#9CA3AF" strokeWidth={2} />
                      <TextInput
                        value={form[field.key] ?? ''}
                        onChangeText={v => set(field.key, v)}
                        placeholder={field.placeholder}
                        placeholderTextColor="#D1D5DB"
                        keyboardType={field.keyboard ?? 'default'}
                        secureTextEntry={field.secure}
                        style={{ flex: 1, fontSize: 15, color: '#111827' }}
                        autoCapitalize="words"
                      />
                    </View>
                    {errors[field.key] ? (
                      <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>
                        {errors[field.key]}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 16 }}>
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: '#6B7280',
                    letterSpacing: 0.8,
                    marginBottom: 8,
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
                        backgroundColor: vehicle === key ? '#000000' : '#F9FAFB',
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: vehicle === key ? '#000000' : '#E5E7EB',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon
                        size={20}
                        color={vehicle === key ? '#FFFFFF' : '#9CA3AF'}
                        strokeWidth={2}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: vehicle === key ? '#FFFFFF' : '#9CA3AF',
                        }}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {STEP2_FIELDS.map(field => {
                const Icon = field.icon;
                return (
                  <View key={field.key}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: '#6B7280',
                        letterSpacing: 0.8,
                        marginBottom: 6,
                      }}
                    >
                      {field.label}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: errors[field.key] ? '#EF4444' : '#E5E7EB',
                        borderRadius: 14,
                        height: 52,
                        paddingHorizontal: 14,
                        gap: 10,
                      }}
                    >
                      <Icon size={18} color="#9CA3AF" strokeWidth={2} />
                      <TextInput
                        value={form[field.key] ?? ''}
                        onChangeText={v => set(field.key, v)}
                        placeholder={field.placeholder}
                        placeholderTextColor="#D1D5DB"
                        keyboardType={field.keyboard ?? 'default'}
                        style={{ flex: 1, fontSize: 15, color: '#111827' }}
                        autoCapitalize={field.key === 'plate' ? 'characters' : 'words'}
                      />
                    </View>
                    {errors[field.key] ? (
                      <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>
                        {errors[field.key]}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 16 }}>
              <View
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 16,
                  padding: 16,
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 }}>
                  RESUMEN
                </Text>
                {[
                  { label: 'Nombre', value: form.fullName },
                  { label: 'Celular', value: form.phone },
                  { label: 'Cédula', value: form.idNumber },
                  { label: 'Vehículo', value: vehicle === 'carro' ? 'Carro' : 'Moto' },
                  { label: 'Placa', value: form.plate },
                  { label: 'Marca / Modelo', value: `${form.brand ?? ''} ${form.model ?? ''}`.trim() },
                  { label: 'Año', value: form.year },
                ].map(row => (
                  <View
                    key={row.label}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#6B7280' }}>{row.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                      {row.value || '—'}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => setTerms(t => !t)}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: terms ? '#7C3AED' : '#D1D5DB',
                    backgroundColor: terms ? '#7C3AED' : '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                >
                  {terms && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 19 }}>
                  Acepto los{' '}
                  <Text style={{ color: '#7C3AED', fontWeight: '600' }}>Términos de servicio</Text>
                  {' '}y la{' '}
                  <Text style={{ color: '#7C3AED', fontWeight: '600' }}>Política de privacidad</Text>
                  {' '}de Movi. Entiendo que mi información será verificada.
                </Text>
              </TouchableOpacity>
              {errors.terms ? (
                <Text style={{ fontSize: 12, color: '#EF4444', marginTop: -8 }}>{errors.terms}</Text>
              ) : null}

              <View
                style={{
                  backgroundColor: '#FFFBEB',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#FDE68A',
                  padding: 14,
                }}
              >
                <Text style={{ fontSize: 13, color: '#92400E', lineHeight: 19 }}>
                  📋 Después de enviar, nuestro equipo revisará tu solicitud en{' '}
                  <Text style={{ fontWeight: '700' }}>24–48 horas</Text>. Recibirás un SMS de confirmación.
                </Text>
              </View>
            </View>
          )}

          <View style={{ marginTop: 32 }}>
            {step < 3 ? (
              <TouchableOpacity
                onPress={handleNext}
                activeOpacity={0.85}
                style={{
                  height: 56,
                  backgroundColor: '#000000',
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.1 }}>
                  Continuar
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={loading}
                style={{
                  height: 56,
                  backgroundColor: '#7C3AED',
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.1 }}>
                    Enviar solicitud
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
