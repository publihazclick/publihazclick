import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, map, of, Observable } from 'rxjs';

export interface Country {
  country: string;
  iso2?: string;
  iso3?: string;
}

export interface CountryCities {
  country: string;
  cities: string[];
}

export interface CountryStates {
  country: string;
  states: { name: string; cities: string[] }[];
}

export interface CountryResponse {
  data: Country[];
}

export interface CitiesResponse {
  data: CountryCities;
}

export interface StatesResponse {
  data: CountryStates;
}

@Injectable({
  providedIn: 'root'
})
export class CountriesService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = 'https://countriesnow.space/api/v0.1/countries';

  // Signals para caché
  private readonly _countries = signal<Country[]>([]);
  private readonly _citiesByCountry = signal<Record<string, string[]>>({});
  private readonly _statesByCountry = signal<Record<string, { name: string; cities: string[] }[]>>({});
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly countries = this._countries.asReadonly();
  readonly citiesByCountry = this._citiesByCountry.asReadonly();
  readonly statesByCountry = this._statesByCountry.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Obtiene la lista de todos los países
   */
  getCountries(): import('rxjs').Observable<Country[]> {
    // Si ya tenemos los países en caché, devolverlos
    if (this._countries().length > 0) {
      return of(this._countries());
    }

    this._loading.set(true);
    this._error.set(null);

    return this.http.get<CountryResponse>(`${this.API_URL}/iso`).pipe(
      tap(response => {
        if (response?.data) {
          // Ordenar países alfabéticamente
          const sortedCountries = response.data
            .filter(c => c.country)
            .sort((a, b) => a.country.localeCompare(b.country));
          this._countries.set(sortedCountries);
        }
        this._loading.set(false);
      }),
      map(response => response?.data || []),
      catchError(err => {
        // Failed to fetch countries
        this._error.set('Error al cargar los países');
        this._loading.set(false);
        return of([]);
      })
    );
  }

  /**
   * Obtiene las ciudades de un país específico
   */
  getCitiesByCountry(country: string): import('rxjs').Observable<string[]> {
    // Verificar si ya tenemos las ciudades en caché
    const cached = this._citiesByCountry()[country];
    if (cached) {
      return of(cached);
    }

    this._loading.set(true);
    this._error.set(null);

    return this.http.post<CitiesResponse>(`${this.API_URL}/cities`, {
      country
    }).pipe(
      tap(response => {
        if (response?.data?.cities) {
          const cities = response.data.cities.filter(c => c).sort();
          this._citiesByCountry.update(cache => ({
            ...cache,
            [country]: cities
          }));
        }
        this._loading.set(false);
      }),
      map(response => response?.data?.cities || []),
      catchError(err => {
        // Failed to fetch cities
        this._error.set('Error al cargar las ciudades');
        this._loading.set(false);
        return of([]);
      })
    );
  }

  /**
   * Obtiene los estados/regiones y ciudades de un país específico
   */
  getStatesAndCitiesByCountry(country: string): import('rxjs').Observable<{ name: string; cities: string[] }[]> {
    // Verificar si ya tenemos los estados en caché
    const cached = this._statesByCountry()[country];
    if (cached) {
      return of(cached);
    }

    this._loading.set(true);
    this._error.set(null);

    return this.http.post<StatesResponse>(`${this.API_URL}/states`, {
      country
    }).pipe(
      tap(response => {
        if (response?.data?.states) {
          const states = response.data.states
            .filter(s => s.name && s.cities)
            .map(s => ({
              name: s.name,
              cities: s.cities.filter(c => c).sort()
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          
          this._statesByCountry.update(cache => ({
            ...cache,
            [country]: states
          }));
        }
        this._loading.set(false);
      }),
      map(response => response?.data?.states || []),
      catchError(err => {
        // Failed to fetch states
        this._error.set('Error al cargar los estados');
        this._loading.set(false);
        return of([]);
      })
    );
  }

  /**
   * Obtiene los departamentos/estados para un país específico (basado en código telefónico)
   * Retorna un array sincronico usando el cache
   */
  getDepartments(phoneCode: string): string[] {
    // Mapeo de códigos telefónicos a nombres de países
    const phoneToCountry: Record<string, string> = {
      '+57': 'Colombia',
      '+54': 'Argentina',
      '+55': 'Brasil',
      '+56': 'Chile',
      '+51': 'Peru',
      '+58': 'Venezuela',
      '+52': 'Mexico',
      '+34': 'Spain',
      '+1': 'United States',
      '+44': 'United Kingdom',
      '+33': 'France',
      '+49': 'Germany',
      '+39': 'Italy',
      '+351': 'Portugal',
      '+31': 'Netherlands',
      '+32': 'Belgium',
      '+41': 'Switzerland',
      '+43': 'Austria',
      '+46': 'Sweden',
      '+47': 'Norway',
      '+45': 'Denmark',
      '+48': 'Poland',
      '+7': 'Russia',
      '+86': 'China',
      '+81': 'Japan',
      '+82': 'South Korea',
      '+91': 'India',
      '+61': 'Australia',
      '+64': 'New Zealand',
      '+65': 'Singapore',
      '+852': 'Hong Kong',
      '+886': 'Taiwan',
      '+66': 'Thailand',
      '+84': 'Vietnam',
      '+62': 'Indonesia',
      '+63': 'Philippines',
      '+60': 'Malaysia',
      '+90': 'Turkey',
      '+20': 'Egypt',
      '+27': 'South Africa',
      '+234': 'Nigeria',
      '+254': 'Kenya',
      '+212': 'Morocco',
      '+972': 'Israel',
      '+971': 'United Arab Emirates',
      '+966': 'Saudi Arabia',
      '+502': 'Guatemala',
      '+503': 'El Salvador',
      '+504': 'Honduras',
      '+505': 'Nicaragua',
      '+506': 'Costa Rica',
      '+507': 'Panama',
      '+53': 'Cuba',
      '+593': 'Ecuador',
      '+595': 'Paraguay',
      '+598': 'Uruguay',
      '+591': 'Bolivia',
      '+509': 'Haiti'
    };

    const countryName = phoneToCountry[phoneCode] || 'Colombia';
    const states = this._statesByCountry()[countryName];
    
    if (states) {
      return states.map(s => s.name);
    }
    
    // Si no hay cache, retornar departamentos de Colombia por defecto
    const defaultStates = this._statesByCountry()['Colombia'];
    return defaultStates ? defaultStates.map(s => s.name) : [];
  }

  /**
   * Obtiene las ciudades para un departamento específico
   * Busca en todos los países cacheados
   */
  getCities(departmentName: string): string[] {
    // Buscar en todos los países cacheados
    for (const country of Object.keys(this._statesByCountry())) {
      const states = this._statesByCountry()[country];
      const state = states?.find(s => s.name === departmentName);
      if (state) {
        return state.cities;
      }
    }
    
    // Si no encuentra, buscar en Colombia por defecto
    const defaultStates = this._statesByCountry()['Colombia'];
    const defaultState = defaultStates?.find(s => s.name === departmentName);
    return defaultState ? defaultState.cities : [];
  }

  /**
   * Obtiene la lista de países con códigos telefónicos comunes
   * Combinamos la API con códigos conocidos
   */
  getCountriesWithPhoneCodes(): { code: string; name: string; flag: string }[] {
    // Códigos telefónicos comunes
    const phoneCodes: Record<string, { code: string; flag: string }> = {
      'Colombia': { code: '+57', flag: '🇨🇴' },
      'Argentina': { code: '+54', flag: '🇦🇷' },
      'Brasil': { code: '+55', flag: '🇧🇷' },
      'Chile': { code: '+56', flag: '🇨🇱' },
      'Perú': { code: '+51', flag: '🇵🇪' },
      'Venezuela': { code: '+58', flag: '🇻🇪' },
      'México': { code: '+52', flag: '🇲🇽' },
      'España': { code: '+34', flag: '🇪🇸' },
      'United States': { code: '+1', flag: '🇺🇸' },
      'Canada': { code: '+1', flag: '🇨🇦' },
      'United Kingdom': { code: '+44', flag: '🇬🇧' },
      'France': { code: '+33', flag: '🇫🇷' },
      'Germany': { code: '+49', flag: '🇩🇪' },
      'Italy': { code: '+39', flag: '🇮🇹' },
      'Portugal': { code: '+351', flag: '🇵🇹' },
      'Netherlands': { code: '+31', flag: '🇳🇱' },
      'Belgium': { code: '+32', flag: '🇧🇪' },
      'Switzerland': { code: '+41', flag: '🇨🇭' },
      'Austria': { code: '+43', flag: '🇦🇹' },
      'Sweden': { code: '+46', flag: '🇸🇪' },
      'Norway': { code: '+47', flag: '🇳🇴' },
      'Denmark': { code: '+45', flag: '🇩🇰' },
      'Poland': { code: '+48', flag: '🇵🇱' },
      'Russia': { code: '+7', flag: '🇷🇺' },
      'China': { code: '+86', flag: '🇨🇳' },
      'Japan': { code: '+81', flag: '🇯🇵' },
      'South Korea': { code: '+82', flag: '🇰🇷' },
      'India': { code: '+91', flag: '🇮🇳' },
      'Australia': { code: '+61', flag: '🇦🇺' },
      'New Zealand': { code: '+64', flag: '🇳🇿' },
      'Singapore': { code: '+65', flag: '🇸🇬' },
      'Hong Kong': { code: '+852', flag: '🇭🇰' },
      'Taiwan': { code: '+886', flag: '🇹🇼' },
      'Thailand': { code: '+66', flag: '🇹🇭' },
      'Vietnam': { code: '+84', flag: '🇻🇳' },
      'Indonesia': { code: '+62', flag: '🇮🇩' },
      'Philippines': { code: '+63', flag: '🇵🇭' },
      'Malaysia': { code: '+60', flag: '🇲🇾' },
      'Turkey': { code: '+90', flag: '🇹🇷' },
      'Egypt': { code: '+20', flag: '🇪🇬' },
      'South Africa': { code: '+27', flag: '🇿🇦' },
      'Nigeria': { code: '+234', flag: '🇳🇬' },
      'Kenya': { code: '+254', flag: '🇰🇪' },
      'Morocco': { code: '+212', flag: '🇲🇦' },
      'Israel': { code: '+972', flag: '🇮🇱' },
      'UAE': { code: '+971', flag: '🇦🇪' },
      'Saudi Arabia': { code: '+966', flag: '🇸🇦' },
      'Guatemala': { code: '+502', flag: '🇬🇹' },
      'El Salvador': { code: '+503', flag: '🇸🇻' },
      'Honduras': { code: '+504', flag: '🇭🇳' },
      'Nicaragua': { code: '+505', flag: '🇳🇮' },
      'Costa Rica': { code: '+506', flag: '🇨🇷' },
      'Panama': { code: '+507', flag: '🇵🇦' },
      'Cuba': { code: '+53', flag: '🇨🇺' },
      'Dominican Republic': { code: '+1', flag: '🇩🇴' },
      'Ecuador': { code: '+593', flag: '🇪🇨' },
      'Paraguay': { code: '+595', flag: '🇵🇾' },
      'Uruguay': { code: '+598', flag: '🇺🇾' },
      'Bolivia': { code: '+591', flag: '🇧🇴' },
      'Haiti': { code: '+509', flag: '🇭🇹' },
      'Puerto Rico': { code: '+1', flag: '🇵🇷' }
    };

    return Object.entries(phoneCodes).map(([name, { code, flag }]) => ({
      code,
      name,
      flag
    }));
  }

  /**
   * Lista completa de todos los países del mundo con código telefónico
   */
  getAllCountries(): { code: string; name: string }[] {
    return [
      { name: 'Afganistán', code: '+93' }, { name: 'Albania', code: '+355' },
      { name: 'Alemania', code: '+49' }, { name: 'Andorra', code: '+376' },
      { name: 'Angola', code: '+244' }, { name: 'Antigua y Barbuda', code: '+1' },
      { name: 'Arabia Saudita', code: '+966' }, { name: 'Argelia', code: '+213' },
      { name: 'Argentina', code: '+54' }, { name: 'Armenia', code: '+374' },
      { name: 'Australia', code: '+61' }, { name: 'Austria', code: '+43' },
      { name: 'Azerbaiyán', code: '+994' }, { name: 'Bahamas', code: '+1' },
      { name: 'Bangladés', code: '+880' }, { name: 'Barbados', code: '+1' },
      { name: 'Baréin', code: '+973' }, { name: 'Bélgica', code: '+32' },
      { name: 'Belice', code: '+501' }, { name: 'Benín', code: '+229' },
      { name: 'Bielorrusia', code: '+375' }, { name: 'Bolivia', code: '+591' },
      { name: 'Bosnia y Herzegovina', code: '+387' }, { name: 'Botsuana', code: '+267' },
      { name: 'Brasil', code: '+55' }, { name: 'Brunéi', code: '+673' },
      { name: 'Bulgaria', code: '+359' }, { name: 'Burkina Faso', code: '+226' },
      { name: 'Burundi', code: '+257' }, { name: 'Bután', code: '+975' },
      { name: 'Cabo Verde', code: '+238' }, { name: 'Camboya', code: '+855' },
      { name: 'Camerún', code: '+237' }, { name: 'Canadá', code: '+1' },
      { name: 'Catar', code: '+974' }, { name: 'Chad', code: '+235' },
      { name: 'Chile', code: '+56' }, { name: 'China', code: '+86' },
      { name: 'Chipre', code: '+357' }, { name: 'Colombia', code: '+57' },
      { name: 'Comoras', code: '+269' }, { name: 'Congo', code: '+242' },
      { name: 'Corea del Norte', code: '+850' }, { name: 'Corea del Sur', code: '+82' },
      { name: 'Costa Rica', code: '+506' }, { name: 'Costa de Marfil', code: '+225' },
      { name: 'Croacia', code: '+385' }, { name: 'Cuba', code: '+53' },
      { name: 'Dinamarca', code: '+45' }, { name: 'Dominica', code: '+1' },
      { name: 'Ecuador', code: '+593' }, { name: 'Egipto', code: '+20' },
      { name: 'El Salvador', code: '+503' }, { name: 'Emiratos Árabes Unidos', code: '+971' },
      { name: 'Eritrea', code: '+291' }, { name: 'Eslovaquia', code: '+421' },
      { name: 'Eslovenia', code: '+386' }, { name: 'España', code: '+34' },
      { name: 'Estados Unidos', code: '+1' }, { name: 'Estonia', code: '+372' },
      { name: 'Etiopía', code: '+251' }, { name: 'Filipinas', code: '+63' },
      { name: 'Finlandia', code: '+358' }, { name: 'Fiyi', code: '+679' },
      { name: 'Francia', code: '+33' }, { name: 'Gabón', code: '+241' },
      { name: 'Gambia', code: '+220' }, { name: 'Georgia', code: '+995' },
      { name: 'Ghana', code: '+233' }, { name: 'Granada', code: '+1' },
      { name: 'Grecia', code: '+30' }, { name: 'Guatemala', code: '+502' },
      { name: 'Guinea', code: '+224' }, { name: 'Guinea Ecuatorial', code: '+240' },
      { name: 'Guinea-Bisáu', code: '+245' }, { name: 'Guyana', code: '+592' },
      { name: 'Haití', code: '+509' }, { name: 'Honduras', code: '+504' },
      { name: 'Hungría', code: '+36' }, { name: 'India', code: '+91' },
      { name: 'Indonesia', code: '+62' }, { name: 'Irak', code: '+964' },
      { name: 'Irán', code: '+98' }, { name: 'Irlanda', code: '+353' },
      { name: 'Islandia', code: '+354' }, { name: 'Islas Marshall', code: '+692' },
      { name: 'Islas Salomón', code: '+677' }, { name: 'Israel', code: '+972' },
      { name: 'Italia', code: '+39' }, { name: 'Jamaica', code: '+1' },
      { name: 'Japón', code: '+81' }, { name: 'Jordania', code: '+962' },
      { name: 'Kazajistán', code: '+7' }, { name: 'Kenia', code: '+254' },
      { name: 'Kirguistán', code: '+996' }, { name: 'Kiribati', code: '+686' },
      { name: 'Kuwait', code: '+965' }, { name: 'Laos', code: '+856' },
      { name: 'Lesoto', code: '+266' }, { name: 'Letonia', code: '+371' },
      { name: 'Líbano', code: '+961' }, { name: 'Liberia', code: '+231' },
      { name: 'Libia', code: '+218' }, { name: 'Liechtenstein', code: '+423' },
      { name: 'Lituania', code: '+370' }, { name: 'Luxemburgo', code: '+352' },
      { name: 'Madagascar', code: '+261' }, { name: 'Malasia', code: '+60' },
      { name: 'Malaui', code: '+265' }, { name: 'Maldivas', code: '+960' },
      { name: 'Malí', code: '+223' }, { name: 'Malta', code: '+356' },
      { name: 'Marruecos', code: '+212' }, { name: 'Mauricio', code: '+230' },
      { name: 'Mauritania', code: '+222' }, { name: 'México', code: '+52' },
      { name: 'Micronesia', code: '+691' }, { name: 'Moldavia', code: '+373' },
      { name: 'Mónaco', code: '+377' }, { name: 'Mongolia', code: '+976' },
      { name: 'Montenegro', code: '+382' }, { name: 'Mozambique', code: '+258' },
      { name: 'Myanmar', code: '+95' }, { name: 'Namibia', code: '+264' },
      { name: 'Nauru', code: '+674' }, { name: 'Nepal', code: '+977' },
      { name: 'Nicaragua', code: '+505' }, { name: 'Níger', code: '+227' },
      { name: 'Nigeria', code: '+234' }, { name: 'Noruega', code: '+47' },
      { name: 'Nueva Zelanda', code: '+64' }, { name: 'Omán', code: '+968' },
      { name: 'Países Bajos', code: '+31' }, { name: 'Pakistán', code: '+92' },
      { name: 'Palaos', code: '+680' }, { name: 'Panamá', code: '+507' },
      { name: 'Papúa Nueva Guinea', code: '+675' }, { name: 'Paraguay', code: '+595' },
      { name: 'Perú', code: '+51' }, { name: 'Polonia', code: '+48' },
      { name: 'Portugal', code: '+351' }, { name: 'Reino Unido', code: '+44' },
      { name: 'República Centroafricana', code: '+236' }, { name: 'República Checa', code: '+420' },
      { name: 'República del Congo', code: '+243' }, { name: 'República Dominicana', code: '+1' },
      { name: 'Ruanda', code: '+250' }, { name: 'Rumanía', code: '+40' },
      { name: 'Rusia', code: '+7' }, { name: 'Samoa', code: '+685' },
      { name: 'San Cristóbal y Nieves', code: '+1' }, { name: 'San Marino', code: '+378' },
      { name: 'San Vicente y las Granadinas', code: '+1' }, { name: 'Santa Lucía', code: '+1' },
      { name: 'Santo Tomé y Príncipe', code: '+239' }, { name: 'Senegal', code: '+221' },
      { name: 'Serbia', code: '+381' }, { name: 'Seychelles', code: '+248' },
      { name: 'Sierra Leona', code: '+232' }, { name: 'Singapur', code: '+65' },
      { name: 'Siria', code: '+963' }, { name: 'Somalia', code: '+252' },
      { name: 'Sri Lanka', code: '+94' }, { name: 'Sudáfrica', code: '+27' },
      { name: 'Sudán', code: '+249' }, { name: 'Sudán del Sur', code: '+211' },
      { name: 'Suecia', code: '+46' }, { name: 'Suiza', code: '+41' },
      { name: 'Surinam', code: '+597' }, { name: 'Suazilandia', code: '+268' },
      { name: 'Tailandia', code: '+66' }, { name: 'Taiwán', code: '+886' },
      { name: 'Tanzania', code: '+255' }, { name: 'Tayikistán', code: '+992' },
      { name: 'Timor-Leste', code: '+670' }, { name: 'Togo', code: '+228' },
      { name: 'Tonga', code: '+676' }, { name: 'Trinidad y Tobago', code: '+1' },
      { name: 'Túnez', code: '+216' }, { name: 'Turkmenistán', code: '+993' },
      { name: 'Turquía', code: '+90' }, { name: 'Tuvalu', code: '+688' },
      { name: 'Ucrania', code: '+380' }, { name: 'Uganda', code: '+256' },
      { name: 'Uruguay', code: '+598' }, { name: 'Uzbekistán', code: '+998' },
      { name: 'Vanuatu', code: '+678' }, { name: 'Venezuela', code: '+58' },
      { name: 'Vietnam', code: '+84' }, { name: 'Yemen', code: '+967' },
      { name: 'Yibuti', code: '+253' }, { name: 'Zambia', code: '+260' },
      { name: 'Zimbabue', code: '+263' }
    ].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /**
   * Limpia el caché
   */
  clearCache(): void {
    this._countries.set([]);
    this._citiesByCountry.set({});
    this._statesByCountry.set({});
  }
}
