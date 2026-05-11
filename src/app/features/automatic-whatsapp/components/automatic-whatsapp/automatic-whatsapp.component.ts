import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import * as XLSX from 'xlsx';
import { WhatsappService } from '../../../../core/services/whatsapp.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  WaSubscription,
  WaSession,
  WaContact,
  WaContactGroup,
  WaTemplate,
  WaCampaign,
  WaDashboardStats,
  WaAntiBlockConfig,
  WaAntiBlockPreset,
  WaMessageType,
  WaTemplateCategory,
  WaMediaItem,
  DEFAULT_ANTI_BLOCK_CONFIG,
  ANTI_BLOCK_PRESETS,
  findShortenerInText,
} from '../../../../core/models/whatsapp.model';

type Tab = 'dashboard' | 'contacts' | 'campaigns' | 'templates' | 'settings';
type ContactModal = 'none' | 'add' | 'import' | 'group';
type CampaignModal = 'none' | 'create';
type TemplateModal = 'none' | 'create';

@Component({
  selector: 'app-automatic-whatsapp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './automatic-whatsapp.component.html',
  styleUrl: './automatic-whatsapp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomaticWhatsappComponent implements OnInit, OnDestroy {
  private wa = inject(WhatsappService);
  private currency = inject(CurrencyService);
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);

  // ─── State ─────────────────────────────────
  loading = signal(true);
  activeTab = signal<Tab>('dashboard');
  subscription = signal<WaSubscription | null>(null);
  hasSubscription = computed(() => !!this.subscription());

  // Dashboard
  stats = signal<WaDashboardStats>({
    totalContacts: 0, totalGroups: 0, totalCampaigns: 0, totalTemplates: 0,
    totalSent: 0, totalFailed: 0, totalPending: 0, totalSending: 0,
    successRate: 0, failureRate: 0, activeCampaigns: 0, todaySent: 0,
  });

  // Contacts
  contacts = signal<WaContact[]>([]);
  groups = signal<WaContactGroup[]>([]);
  contactSearch = signal('');
  selectedGroupFilter = signal('');
  selectedContacts = signal<Set<string>>(new Set());
  contactModal = signal<ContactModal>('none');
  contactsLoading = signal(false);

  // New contact form
  newContactPhone = signal('');
  newContactName = signal('');

  // Import
  importText = signal('');
  importResult = signal('');

  // New group form
  newGroupName = signal('');
  newGroupColor = signal('#22c55e');

  // Templates
  templates = signal<WaTemplate[]>([]);
  templateModal = signal<TemplateModal>('none');
  newTemplateName = signal('');
  newTemplateCategory = signal<WaTemplateCategory>('general');
  newTemplateType = signal<WaMessageType>('text');
  newTemplateContent = signal('');
  newTemplateMediaFile = signal<File | null>(null); // legacy - ya no se usa para guardar
  newTemplateMediaItems = signal<WaMediaItem[]>([]); // archivos ya subidos
  newTemplateVariants = signal<string[]>([]); // variaciones del mensaje para rotador
  templateMediaUploading = signal(false);
  templateSaving = signal(false);
  editingTemplate = signal<WaTemplate | null>(null);

  // Campaigns
  campaigns = signal<WaCampaign[]>([]);
  campaignModal = signal<CampaignModal>('none');
  newCampaignName = signal('');
  newCampaignDescription = signal('');
  newCampaignTemplateId = signal('');
  newCampaignTargetType = signal<'excel' | 'all' | 'group' | 'custom'>('excel');
  newCampaignGroupId = signal('');
  antiBlockConfig = signal<WaAntiBlockConfig>({ ...DEFAULT_ANTI_BLOCK_CONFIG });
  selectedPreset = signal<WaAntiBlockPreset>('new_account');
  templateUrlWarning = signal<string | null>(null);
  activeCampaignDetail = signal<WaCampaign | null>(null);
  campaignEditing = signal(false);
  campaignEditSaving = signal(false);
  // Snapshots editables
  editCampaignName = signal('');
  editCampaignDescription = signal('');
  editCampaignScheduleEnabled = signal(false);
  editCampaignScheduleStart = signal('09:00');
  editCampaignScheduleEnd = signal('18:00');
  editCampaignScheduleDays = signal<number[]>([]);
  editCampaignMinDelay = signal(15);
  editCampaignMaxDelay = signal(45);
  editCampaignDailyLimit = signal(80);
  editCampaignHourlyLimit = signal(20);
  editCampaignBatchSize = signal(8);
  editCampaignBatchPause = signal(180);

  // Excel para campaña (destinatarios)
  campaignExcelLoading = signal(false);
  campaignExcelFileName = signal('');
  campaignExcelResult = signal('');
  campaignExcelContactIds = signal<string[]>([]);
  campaignExcelTotal = signal(0);

  // División en bloques
  newCampaignBlockCount = signal(1);

  // Ventana horaria (default 8am-8pm todos los dias — horario natural humano)
  newCampaignScheduleEnabled = signal(false);
  newCampaignScheduleStart = signal('08:00');
  newCampaignScheduleEnd = signal('20:00');
  newCampaignScheduleDays = signal<number[]>([1, 2, 3, 4, 5, 6]); // Lun-Sab (domingo fuera: mucha gente no atiende negocios)

  weekDays: { dow: number; label: string }[] = [
    { dow: 1, label: 'L' },
    { dow: 2, label: 'M' },
    { dow: 3, label: 'X' },
    { dow: 4, label: 'J' },
    { dow: 5, label: 'V' },
    { dow: 6, label: 'S' },
    { dow: 0, label: 'D' },
  ];

  toggleScheduleDay(dow: number) {
    this.newCampaignScheduleDays.update(days =>
      days.includes(dow) ? days.filter(d => d !== dow) : [...days, dow].sort(),
    );
  }

  /** Cuántos destinatarios por bloque (aproximadamente) */
  campaignBlockPreview = computed(() => {
    const total = this.newCampaignTargetType() === 'excel'
      ? this.campaignExcelContactIds().length
      : 0;
    const n = Math.max(1, this.newCampaignBlockCount());
    if (total === 0) return '';
    const per = Math.ceil(total / n);
    return `${total} números ÷ ${n} bloque${n > 1 ? 's' : ''} = ~${per} por bloque`;
  });

  // Estado de envío del modal de campaña
  campaignSaving = signal(false);
  campaignSaveError = signal<string | null>(null);

  /**
   * Devuelve true si los destinatarios actuales son válidos para crear
   * la campaña. Se usa para habilitar/deshabilitar el botón "Crear Campaña"
   * y evitar envíos silenciosos sin audiencia.
   */
  canSaveCampaign = computed(() => {
    if (!this.newCampaignName() || !this.newCampaignTemplateId()) return false;
    const t = this.newCampaignTargetType();
    if (t === 'excel') return this.campaignExcelContactIds().length > 0;
    if (t === 'group') return !!this.newCampaignGroupId();
    if (t === 'custom') return this.selectedContacts().size > 0;
    return true; // 'all'
  });

  // Settings / Sessions
  sessions = signal<WaSession[]>([]);
  newSessionName = signal('');
  activeInstance = signal<string | null>(null);
  qrCode = signal<string | null>(null);
  qrImage = signal<string | null>(null);
  pairingCode = signal<string | null>(null);
  sessionLoading = signal(false);
  sessionError = signal<string | null>(null);
  testPhone = signal('');
  testMessage = signal('');
  testSending = signal(false);
  testResult = signal<string | null>(null);

  // Subscription / ePayco flow
  subscribing = signal(false);
  showPaymentModal = signal(false);
  subscriptionStep = signal<'pricing' | 'epayco-loading' | 'epayco-opening' | 'epayco-result'>('pricing');
  epaycoError = signal<string | null>(null);
  priceCOP = computed(() => this.currency.usdToCop(20));
  priceWithFeeCOP = computed(() => this.currency.usdToFinalCop(20));

  templateCategories: { value: WaTemplateCategory; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'informativo', label: 'Informativo' },
    { value: 'recordatorio', label: 'Recordatorio' },
    { value: 'bienvenida', label: 'Bienvenida' },
  ];

  messageTypes: { value: WaMessageType; label: string; icon: string }[] = [
    { value: 'text', label: 'Texto', icon: 'chat' },
    { value: 'image', label: 'Imagen', icon: 'image' },
    { value: 'audio', label: 'Audio', icon: 'mic' },
    { value: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
    { value: 'video', label: 'Video', icon: 'videocam' },
  ];

  tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Panel', icon: 'dashboard' },
    { id: 'contacts', label: 'Contactos', icon: 'contacts' },
    { id: 'campaigns', label: 'Campañas', icon: 'campaign' },
    { id: 'templates', label: 'Plantillas', icon: 'description' },
    { id: 'settings', label: 'Ajustes', icon: 'settings' },
  ];

  private qrPollHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadSubscription();

    // Detectar retorno de ePayco
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParamMap.subscribe(params => {
        if (params.get('epayco') === 'result') {
          this.subscriptionStep.set('epayco-result');
          // Recargar suscripcion despues de un breve delay
          setTimeout(() => this.loadSubscription(), 2000);
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.qrPollHandle) {
      clearInterval(this.qrPollHandle);
      this.qrPollHandle = null;
    }
  }

  async loadSubscription() {
    this.loading.set(true);
    const sub = await this.wa.getSubscription();
    this.subscription.set(sub);
    await this.loadDashboard();
    this.loading.set(false);
  }

  /** Returns true if subscribed; opens payment modal if not */
  requireSubscription(): boolean {
    if (this.hasSubscription()) return true;
    this.showPaymentModal.set(true);
    this.subscriptionStep.set('pricing');
    return false;
  }

  async loadDashboard() {
    const [stats, sessions] = await Promise.all([
      this.wa.getDashboardStats(),
      this.wa.getSessions(),
    ]);
    this.stats.set(stats);
    this.sessions.set(sessions);
  }

  async switchTab(tab: Tab) {
    this.activeTab.set(tab);
    if (tab === 'contacts') await this.loadContacts();
    else if (tab === 'campaigns') await this.loadCampaigns();
    else if (tab === 'templates') await this.loadTemplates();
    else if (tab === 'settings') await this.loadSettings();
    else if (tab === 'dashboard') await this.loadDashboard();
  }

  // ─── Subscription / ePayco ─────────────────

  async startEpaycoCheckout(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.epaycoError.set(null);
    this.subscribing.set(true);
    this.subscriptionStep.set('epayco-loading');

    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();

      const copAmount = this.priceCOP();

      const response = await supabase.functions.invoke('create-wa-subscription-payment', {
        body: { cop_amount: copAmount },
      });

      const data = response.data;
      if (!data?.invoice) {
        const errMsg = data?.error || 'Error al preparar el pago. Intenta cerrar sesion y volver a entrar.';
        throw new Error(errMsg);
      }

      await this.loadEpaycoScript();
      this.subscriptionStep.set('epayco-opening');

      const epayco = (window as unknown as Record<string, unknown>)['ePayco'] as {
        checkout: { configure: (cfg: unknown) => { open: (params: unknown) => void } };
      };

      const handler = epayco.checkout.configure({
        key: data.publicKey,
        test: data.test,
      });

      handler.open({
        name:          data.name,
        description:   data.description,
        invoice:       data.invoice,
        currency:      data.currency,
        amount:        data.amount,
        tax_base:      data.tax_base,
        tax:           data.tax,
        country:       data.country,
        lang:          data.lang,
        external:      'true',
        confirmation:  data.confirmation,
        response:      `${window.location.origin}/dashboard/automatic-whatsapp?epayco=result`,
        methodConfirmation: 'POST',
        email_billing: data.email_billing,
        name_billing:  data.name_billing,
        extra1:        data.extra1,
        extra2:        data.extra2,
        extra3:        data.extra3,
      });
    } catch (e: unknown) {
      this.epaycoError.set(e instanceof Error ? e.message : 'Error al iniciar pago');
      this.subscriptionStep.set('pricing');
    } finally {
      this.subscribing.set(false);
    }
  }

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['ePayco']) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.epayco.co/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar ePayco'));
      document.head.appendChild(script);
    });
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  }

  // ─── Contacts ──────────────────────────────

  async loadContacts() {
    this.contactsLoading.set(true);
    const [contacts, groups] = await Promise.all([
      this.wa.getContacts(this.contactSearch() || undefined, this.selectedGroupFilter() || undefined),
      this.wa.getGroups(),
    ]);
    this.contacts.set(contacts);
    this.groups.set(groups);
    this.contactsLoading.set(false);
  }

  async searchContacts() {
    await this.loadContacts();
  }

  async addContact() {
    if (!this.requireSubscription()) return;
    const phone = this.normalizePhone(this.newContactPhone());
    if (!phone) {
      // No hacer nada si teléfono inválido
      return;
    }
    await this.wa.createContact({
      phone,
      name: this.newContactName() || null,
    });
    this.newContactPhone.set('');
    this.newContactName.set('');
    this.contactModal.set('none');
    await this.loadContacts();
  }

  async deleteContact(id: string) {
    await this.wa.deleteContact(id);
    await this.loadContacts();
  }

  toggleContactSelection(id: string) {
    const current = new Set(this.selectedContacts());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.selectedContacts.set(current);
  }

  selectAllContacts() {
    const all = new Set(this.contacts().map(c => c.id));
    this.selectedContacts.set(all);
  }

  deselectAllContacts() {
    this.selectedContacts.set(new Set());
  }

  async importContacts() {
    if (!this.requireSubscription()) return;
    const lines = this.importText().split('\n').filter(l => l.trim());
    const seen = new Set<string>();
    const parsed: { phone: string; name?: string }[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      const phone = this.normalizePhone(parts[0]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      parsed.push({ phone, name: parts[1] || undefined });
    }

    if (parsed.length === 0) {
      this.importResult.set('No se encontraron números válidos');
      return;
    }

    const count = await this.wa.importContacts(parsed);
    this.importResult.set(`${count} contactos importados correctamente`);
    this.importText.set('');
    await this.loadContacts();
  }

  excelImportLoading = signal(false);
  excelImportResult = signal('');
  excelFileName = signal('');

  /**
   * Convierte cualquier valor proveniente de Excel/CSV a un string seguro
   * sin pasar por notación científica. Un número grande como 573118117854
   * en Excel formato "Número" puede llegar aquí ya serializado como
   * "5,73118E+11" (locale ES) o "5.73118e+11" (locale EN). Si dejamos que
   * `String(x)` o `x.toString()` actúen sobre eso, extraer los dígitos da
   * un teléfono truncado. Por eso, cuando recibimos un Number lo pasamos
   * por `toFixed(0)` para obtener la forma entera completa.
   */
  private cellToString(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return '';
      return Number.isInteger(raw) ? raw.toFixed(0) : String(raw);
    }
    if (typeof raw === 'bigint') return raw.toString();
    return String(raw);
  }

  /**
   * Normaliza un teléfono: deja solo dígitos, valida 10-15 chars (móviles
   * internacionales van de 10 a 15 dígitos; 10 es el mínimo de Colombia
   * sin prefijo, 12 con prefijo 57). Devuelve null si es inválido.
   */
  private normalizePhone(raw: unknown): string | null {
    const str = this.cellToString(raw);
    if (!str) return null;
    const s = str.replace(/[^0-9]/g, '');
    if (s.length < 10 || s.length > 15) return null;
    return s;
  }

  onExcelFileSelected(event: Event) {
    if (!this.requireSubscription()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.excelFileName.set(file.name);
    this.excelImportLoading.set(true);
    this.excelImportResult.set('');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        if (!firstSheet) {
          this.excelImportResult.set('El archivo no tiene hojas');
          this.excelImportLoading.set(false);
          return;
        }

        // Convertir a matriz (cada fila = array de celdas)
        // raw: true devuelve el valor nativo (number/string). Evita que
        // XLSX serialice teléfonos como "5,73118E+11" cuando la celda es
        // número — esa serialización trunca teléfonos largos al extraer
        // los dígitos. cellToString() maneja la conversión sin perder.
        const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
          header: 1,
          defval: '',
          raw: true,
          blankrows: false,
        });

        if (!rows.length) {
          this.excelImportResult.set('El archivo está vacío');
          this.excelImportLoading.set(false);
          return;
        }

        // Detectar si la primera fila es encabezado: si ninguna celda parece un número.
        const firstRow = rows[0] ?? [];
        const firstCellLooksLikePhone = !!this.normalizePhone(firstRow[0]);
        const startIdx = firstCellLooksLikePhone ? 0 : 1;

        // Heurística: localizar columna de teléfono y de nombre por cabecera.
        let phoneCol = 0;
        let nameCol = 1;
        if (!firstCellLooksLikePhone) {
          const headerRow = (firstRow as unknown[]).map(c => String(c).toLowerCase().trim());
          headerRow.forEach((h, idx) => {
            if (/tel|phone|celular|movil|numero|whatsapp|wa/.test(h)) phoneCol = idx;
            if (/nombre|name|nombres|contacto|client/.test(h)) nameCol = idx;
          });
        }

        const contacts: { phone: string; name?: string }[] = [];
        const seen = new Set<string>();

        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i] ?? [];
          const phone = this.normalizePhone(row[phoneCol]);
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          const nameRaw = row[nameCol];
          const name = nameRaw === null || nameRaw === undefined
            ? undefined
            : String(nameRaw).trim() || undefined;
          contacts.push({ phone, name });
        }

        if (contacts.length === 0) {
          this.excelImportResult.set('No se encontraron números válidos en el archivo');
          this.excelImportLoading.set(false);
          return;
        }

        // Importar en lotes de 500 para no chocar con Supabase
        let total = 0;
        for (let i = 0; i < contacts.length; i += 500) {
          const batch = contacts.slice(i, i + 500);
          total += await this.wa.importContacts(batch);
        }
        this.excelImportResult.set(`${total} contactos importados desde ${file.name}`);
        await this.loadContacts();
      } catch (e) {
        this.excelImportResult.set('Error al procesar el archivo. Verifica que sea un Excel o CSV válido.');
      } finally {
        this.excelImportLoading.set(false);
      }
    };
    reader.onerror = () => {
      this.excelImportResult.set('Error al leer el archivo');
      this.excelImportLoading.set(false);
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  async createGroup() {
    if (!this.newGroupName()) return;
    await this.wa.createGroup(this.newGroupName(), this.newGroupColor());
    this.newGroupName.set('');
    this.newGroupColor.set('#22c55e');
    this.contactModal.set('none');
    await this.loadContacts();
  }

  async deleteGroup(id: string) {
    await this.wa.deleteGroup(id);
    await this.loadContacts();
  }

  async addSelectedToGroup(groupId: string) {
    const ids = [...this.selectedContacts()];
    if (ids.length === 0) return;
    await this.wa.addContactsToGroup(groupId, ids);
    this.selectedContacts.set(new Set());
    await this.loadContacts();
  }

  // ─── Templates ─────────────────────────────

  async loadTemplates() {
    this.templates.set(await this.wa.getTemplates());
  }

  openCreateTemplate() {
    this.editingTemplate.set(null);
    this.newTemplateName.set('');
    this.newTemplateCategory.set('general');
    this.newTemplateType.set('text');
    this.newTemplateContent.set('');
    this.newTemplateMediaFile.set(null);
    this.newTemplateMediaItems.set([]);
    this.newTemplateVariants.set([]);
    this.templateMediaUploading.set(false);
    this.templateSaving.set(false);
    this.templateModal.set('create');
  }

  editTemplate(t: WaTemplate) {
    this.editingTemplate.set(t);
    this.newTemplateName.set(t.name);
    this.newTemplateCategory.set(t.category);
    this.newTemplateType.set(t.message_type);
    this.newTemplateContent.set(t.content);
    this.newTemplateMediaItems.set(Array.isArray(t.media_items) ? [...t.media_items] : []);
    this.newTemplateVariants.set(Array.isArray(t.content_variants) ? [...t.content_variants] : []);
    this.newTemplateMediaFile.set(null);
    this.templateMediaUploading.set(false);
    this.templateSaving.set(false);
    this.templateModal.set('create');
  }

  addTemplateVariant() {
    this.newTemplateVariants.update(v => [...v, '']);
  }

  updateTemplateVariant(index: number, text: string) {
    this.newTemplateVariants.update(v => v.map((val, i) => (i === index ? text : val)));
  }

  removeTemplateVariant(index: number) {
    this.newTemplateVariants.update(v => v.filter((_, i) => i !== index));
  }

  /**
   * Sube uno o varios archivos y los agrega a la plantilla. No reemplaza
   * lo que ya hay — cada llamada suma. El usuario puede elegir imágenes,
   * audios, videos y PDFs en la misma plantilla.
   */
  async onTemplateMediaFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    this.templateMediaUploading.set(true);
    try {
      const uploaded: WaMediaItem[] = [];
      for (const file of Array.from(files)) {
        const item = await this.wa.uploadMediaItem(file);
        if (item) uploaded.push(item);
      }
      if (uploaded.length > 0) {
        this.newTemplateMediaItems.update(current => [...current, ...uploaded]);
      }
    } finally {
      this.templateMediaUploading.set(false);
      input.value = '';
    }
  }

  removeTemplateMediaItem(index: number) {
    this.newTemplateMediaItems.update(items => items.filter((_, i) => i !== index));
  }

  getMediaIcon(kind: string): string {
    const map: Record<string, string> = {
      image: 'image',
      video: 'videocam',
      audio: 'graphic_eq',
      pdf: 'picture_as_pdf',
    };
    return map[kind] ?? 'description';
  }

  getMediaColor(kind: string): string {
    const map: Record<string, string> = {
      image: 'text-blue-400',
      video: 'text-purple-400',
      audio: 'text-amber-400',
      pdf: 'text-red-400',
    };
    return map[kind] ?? 'text-slate-400';
  }

  async saveTemplate() {
    if (!this.requireSubscription()) return;
    if (!this.newTemplateName() || !this.newTemplateContent()) return;
    if (this.templateMediaUploading()) return;

    // Bloqueo duro: acortadores de URL disparan filtros de spam de WhatsApp.
    const shortener = this.detectShortenerInTemplate();
    if (shortener) {
      this.templateUrlWarning.set(shortener);
      alert(
        `No se puede guardar: el mensaje contiene el acortador "${shortener}". ` +
        `WhatsApp detecta acortadores como spam y bloquea la cuenta. ` +
        `Usa el link completo del sitio original.`,
      );
      return;
    }

    this.templateSaving.set(true);
    try {
      const items = this.newTemplateMediaItems();

      // Si hay un media “suelto” en el file input legacy, también lo subimos
      const legacyFile = this.newTemplateMediaFile();
      if (legacyFile) {
        const extra = await this.wa.uploadMediaItem(legacyFile);
        if (extra) items.push(extra);
      }

      // Para retrocompatibilidad con worker viejo: guardamos también
      // media_url/filename/message_type basado en el primer media (si existe).
      const first = items[0];
      const derivedType: WaMessageType = first
        ? (first.kind as WaMessageType)
        : 'text';

      const variants = this.newTemplateVariants().map(v => (v || '').trim()).filter(v => v.length > 0);

      const payload: Partial<WaTemplate> = {
        name: this.newTemplateName(),
        category: this.newTemplateCategory(),
        message_type: derivedType,
        content: this.newTemplateContent(),
        content_variants: variants,
        media_items: items,
        media_url: first?.url ?? null,
        media_filename: first?.filename ?? null,
      };

      const editing = this.editingTemplate();
      if (editing) {
        await this.wa.updateTemplate(editing.id, payload);
      } else {
        await this.wa.createTemplate(payload);
      }
      this.templateModal.set('none');
      await this.loadTemplates();
    } finally {
      this.templateSaving.set(false);
    }
  }

  async deleteTemplate(id: string) {
    await this.wa.deleteTemplate(id);
    await this.loadTemplates();
  }

  async toggleFavorite(t: WaTemplate) {
    await this.wa.toggleFavoriteTemplate(t.id, !t.is_favorite);
    await this.loadTemplates();
  }

  onMediaFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.newTemplateMediaFile.set(input.files[0]);
    }
  }

  // ─── Campaigns ─────────────────────────────

  async loadCampaigns() {
    const [campaigns, templates, groups] = await Promise.all([
      this.wa.getCampaigns(),
      this.wa.getTemplates(),
      this.wa.getGroups(),
    ]);
    this.campaigns.set(campaigns);
    this.templates.set(templates);
    this.groups.set(groups);
  }

  openCreateCampaign() {
    this.newCampaignName.set('');
    this.newCampaignDescription.set('');
    this.newCampaignTemplateId.set('');
    this.newCampaignTargetType.set('excel');
    this.newCampaignGroupId.set('');
    // Si hay sesión con menos de 30 días, forzar preset "new_account".
    // Si no, default a "normal".
    const preset: WaAntiBlockPreset = this.hasNewSession() ? 'new_account' : 'normal';
    this.selectedPreset.set(preset);
    this.antiBlockConfig.set({ ...ANTI_BLOCK_PRESETS[preset] });
    this.activeCampaignDetail.set(null);
    this.campaignExcelFileName.set('');
    this.campaignExcelResult.set('');
    this.campaignExcelContactIds.set([]);
    this.campaignExcelTotal.set(0);
    this.campaignExcelLoading.set(false);
    this.campaignSaving.set(false);
    this.campaignSaveError.set(null);
    this.newCampaignBlockCount.set(1);
    this.newCampaignScheduleEnabled.set(false);
    this.newCampaignScheduleStart.set('08:00');
    this.newCampaignScheduleEnd.set('20:00');
    this.newCampaignScheduleDays.set([1, 2, 3, 4, 5, 6]);
    this.campaignModal.set('create');
  }

  /**
   * Sube un Excel/CSV con los destinatarios de la campaña.
   * Acepta cualquier formato (xlsx, xls, csv) — autodetecta cabecera y la
   * columna de teléfono. Importa los contactos a la cuenta del usuario y
   * guarda los IDs para usarlos como target_contact_ids al crear la campaña.
   */
  onCampaignExcelFileSelected(event: Event) {
    if (!this.requireSubscription()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.campaignExcelFileName.set(file.name);
    this.campaignExcelLoading.set(true);
    this.campaignExcelResult.set('');
    this.campaignExcelContactIds.set([]);
    this.campaignExcelTotal.set(0);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        if (!firstSheet) {
          this.campaignExcelResult.set('El archivo no tiene hojas');
          this.campaignExcelLoading.set(false);
          return;
        }

        // raw: true devuelve el valor nativo (number/string). Evita que
        // XLSX serialice teléfonos como "5,73118E+11" cuando la celda es
        // número — esa serialización trunca teléfonos largos al extraer
        // los dígitos. cellToString() maneja la conversión sin perder.
        const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
          header: 1,
          defval: '',
          raw: true,
          blankrows: false,
        });

        if (!rows.length) {
          this.campaignExcelResult.set('El archivo está vacío');
          this.campaignExcelLoading.set(false);
          return;
        }

        const firstRow = rows[0] ?? [];
        const firstCellLooksLikePhone = !!this.normalizePhone(firstRow[0]);
        const startIdx = firstCellLooksLikePhone ? 0 : 1;

        let phoneCol = 0;
        let nameCol = 1;
        if (!firstCellLooksLikePhone) {
          const headerRow = (firstRow as unknown[]).map(c => String(c).toLowerCase().trim());
          headerRow.forEach((h, idx) => {
            if (/tel|phone|celular|movil|numero|whatsapp|wa/.test(h)) phoneCol = idx;
            if (/nombre|name|nombres|contacto|client/.test(h)) nameCol = idx;
          });
        }

        const contacts: { phone: string; name?: string }[] = [];
        const seen = new Set<string>();

        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i] ?? [];
          const phone = this.normalizePhone(row[phoneCol]);
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          const nameRaw = row[nameCol];
          const name = nameRaw === null || nameRaw === undefined
            ? undefined
            : String(nameRaw).trim() || undefined;
          contacts.push({ phone, name });
        }

        if (contacts.length === 0) {
          this.campaignExcelResult.set('No se encontraron números válidos en el archivo');
          this.campaignExcelLoading.set(false);
          return;
        }

        // Importar en lotes y recolectar IDs
        const allIds: string[] = [];
        let totalImported = 0;
        for (let i = 0; i < contacts.length; i += 500) {
          const batch = contacts.slice(i, i + 500);
          const { ids, imported } = await this.wa.importContactsForCampaign(batch);
          allIds.push(...ids);
          totalImported += imported;
        }

        const uniqueIds = Array.from(new Set(allIds));
        this.campaignExcelContactIds.set(uniqueIds);
        this.campaignExcelTotal.set(contacts.length);
        const newCount = totalImported;
        const existing = uniqueIds.length - newCount;
        this.campaignExcelResult.set(
          `${uniqueIds.length} destinatarios listos (${newCount} nuevos, ${existing > 0 ? existing : 0} ya existían)`,
        );
      } catch {
        this.campaignExcelResult.set('Error al procesar el archivo. Verifica que sea un Excel o CSV válido.');
      } finally {
        this.campaignExcelLoading.set(false);
      }
    };
    reader.onerror = () => {
      this.campaignExcelResult.set('Error al leer el archivo');
      this.campaignExcelLoading.set(false);
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  clearCampaignExcel() {
    this.campaignExcelFileName.set('');
    this.campaignExcelResult.set('');
    this.campaignExcelContactIds.set([]);
    this.campaignExcelTotal.set(0);
  }

  async saveCampaign() {
    this.campaignSaveError.set(null);
    if (!this.requireSubscription()) return;
    if (!this.newCampaignName()) { this.campaignSaveError.set('Falta el nombre de la campaña.'); return; }
    if (!this.newCampaignTemplateId()) { this.campaignSaveError.set('Selecciona una plantilla.'); return; }

    const targetType = this.newCampaignTargetType();
    const config = this.antiBlockConfig();

    let totalContacts = 0;
    let targetContactIds: string[] = [];
    let storedTargetType: 'all' | 'group' | 'custom' = 'all';
    let targetGroupId: string | null = null;

    if (targetType === 'excel') {
      targetContactIds = this.campaignExcelContactIds();
      if (targetContactIds.length === 0) {
        this.campaignSaveError.set('Sube un archivo Excel con los destinatarios antes de crear la campaña.');
        return;
      }
      totalContacts = targetContactIds.length;
      storedTargetType = 'custom';
    } else if (targetType === 'all') {
      totalContacts = await this.wa.getContactCount();
      if (totalContacts === 0) {
        this.campaignSaveError.set('No tienes contactos guardados. Importa o elige otra opción de destinatarios.');
        return;
      }
      storedTargetType = 'all';
    } else if (targetType === 'group') {
      if (!this.newCampaignGroupId()) {
        this.campaignSaveError.set('Selecciona un grupo.');
        return;
      }
      totalContacts = this.groups().find(g => g.id === this.newCampaignGroupId())?.contacts_count ?? 0;
      targetGroupId = this.newCampaignGroupId();
      storedTargetType = 'group';
    } else {
      // custom (selección manual de contactos)
      targetContactIds = [...this.selectedContacts()];
      if (targetContactIds.length === 0) {
        this.campaignSaveError.set('Selecciona al menos un contacto destinatario.');
        return;
      }
      totalContacts = targetContactIds.length;
      storedTargetType = 'custom';
    }

    // Bloques (solo aplica a excel/custom; en all/group el bloque queda en 1)
    const blockCount = targetType === 'excel' || targetType === 'custom'
      ? Math.max(1, this.newCampaignBlockCount() || 1)
      : 1;

    const scheduleOn = this.newCampaignScheduleEnabled();
    const schedulePayload = scheduleOn
      ? {
          schedule_start_time: this.newCampaignScheduleStart(),
          schedule_end_time: this.newCampaignScheduleEnd(),
          schedule_days: [...this.newCampaignScheduleDays()],
          schedule_timezone: 'America/Bogota',
        }
      : {
          schedule_start_time: null,
          schedule_end_time: null,
          schedule_days: [] as number[],
          schedule_timezone: 'America/Bogota',
        };

    // Forzar variación de mensajes en listas grandes: WhatsApp detecta
    // mensajes idénticos enviados en ráfaga como spam.
    if (totalContacts > 20 && !config.variation_enabled) {
      config.variation_enabled = true;
    }

    // Warning de lista fría: si es Excel/custom con >30 destinatarios y el
    // usuario no confirma entender el riesgo, no crear la campaña.
    const isColdList = (storedTargetType === 'custom' || targetType === 'excel') && totalContacts > 30;
    if (isColdList) {
      const confirmed = confirm(
        `Vas a enviar a ${totalContacts} números importados. La mayoría de bloqueos de WhatsApp ` +
        `vienen de enviar a números que no te tienen guardado. Un solo "Reportar spam" puede ` +
        `bloquear tu cuenta.\n\n` +
        `¿Confirmas que estos números son clientes que ya te conocen, te han comprado antes, ` +
        `o te han dado su número voluntariamente?`,
      );
      if (!confirmed) {
        this.campaignSaveError.set('Cancelado. Recomendación: pide a tus clientes que guarden tu número antes de enviar campañas masivas.');
        return;
      }
    }

    // Warning de cuenta nueva: si la sesión tiene <7 días, avisar que
    // el daily_limit propuesto excede lo prudente.
    const sessionAge = this.youngestSessionAgeDays();
    if (sessionAge !== null && sessionAge < 7 && config.daily_limit > 15) {
      const confirmed = confirm(
        `Tu cuenta de WhatsApp tiene solo ${sessionAge} día(s) conectada. Enviar más de 15 mensajes ` +
        `al día con una cuenta tan nueva casi siempre termina en bloqueo.\n\n` +
        `Recomendación: baja el límite diario a 15 y activa calentamiento.\n\n` +
        `¿Seguir de todas formas?`,
      );
      if (!confirmed) {
        this.campaignSaveError.set('Cancelado. Aplica el preset "Cuenta Nueva" y vuelve a intentar.');
        return;
      }
    }

    this.campaignSaving.set(true);
    try {
      const { data, error } = await this.wa.createCampaign({
        name: this.newCampaignName(),
        description: this.newCampaignDescription() || null,
        template_id: this.newCampaignTemplateId(),
        target_type: storedTargetType,
        target_group_id: targetGroupId,
        target_contact_ids: targetContactIds,
        total_contacts: totalContacts,
        block_count: blockCount,
        current_block: 0,
        ...schedulePayload,
        ...config,
      });

      if (error || !data) {
        this.campaignSaveError.set(error || 'No se pudo crear la campaña. Intenta de nuevo.');
        return;
      }

      this.campaignModal.set('none');
      await this.loadCampaigns();
    } finally {
      this.campaignSaving.set(false);
    }
  }

  async startCampaign(id: string) {
    if (!this.requireSubscription()) return;
    const result = await this.wa.startCampaign(id);
    if (result.error) {
      alert(result.error);
    }
    await this.loadCampaigns();
  }

  async pauseCampaign(id: string) {
    const result = await this.wa.pauseCampaign(id);
    if (!result.ok && result.error) {
      alert(result.error);
    }
    await this.loadCampaigns();
  }

  async resumeCampaign(id: string) {
    if (!this.requireSubscription()) return;
    const result = await this.wa.resumeCampaign(id);
    if (!result.ok) {
      alert(result.error || 'No se pudo continuar la campaña.');
      return;
    }
    await this.loadCampaigns();
  }

  async cancelCampaign(id: string) {
    await this.wa.cancelCampaign(id);
    await this.loadCampaigns();
  }

  async deleteCampaign(id: string) {
    await this.wa.deleteCampaign(id);
    await this.loadCampaigns();
  }

  getCampaignStatusColor(status: string): string {
    const map: Record<string, string> = {
      draft: 'text-slate-400 bg-slate-500/20',
      scheduled: 'text-blue-400 bg-blue-500/20',
      running: 'text-green-400 bg-green-500/20',
      paused: 'text-yellow-400 bg-yellow-500/20',
      completed: 'text-primary bg-primary/20',
      failed: 'text-red-400 bg-red-500/20',
      cancelled: 'text-slate-500 bg-slate-600/20',
    };
    return map[status] ?? 'text-slate-400 bg-slate-500/20';
  }

  getCampaignStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador', scheduled: 'Programada', running: 'Enviando',
      paused: 'Pausada', completed: 'Completada', failed: 'Fallida', cancelled: 'Cancelada',
    };
    return map[status] ?? status;
  }

  getProgressPercent(c: WaCampaign): number {
    if (c.total_contacts === 0) return 0;
    return Math.round((c.sent_count / c.total_contacts) * 100);
  }

  // ─── Detalle / Edición en vuelo ────────────

  /** Abre el modal de detalle en modo solo-lectura */
  openCampaignDetail(c: WaCampaign) {
    this.activeCampaignDetail.set(c);
    this.campaignEditing.set(false);
  }

  closeCampaignDetail() {
    this.activeCampaignDetail.set(null);
    this.campaignEditing.set(false);
  }

  /** Alterna al modo edición cargando los valores actuales */
  startEditingCampaign() {
    const c = this.activeCampaignDetail();
    if (!c) return;
    this.editCampaignName.set(c.name || '');
    this.editCampaignDescription.set(c.description || '');
    const hasSchedule = !!(c.schedule_start_time && c.schedule_end_time);
    this.editCampaignScheduleEnabled.set(hasSchedule);
    this.editCampaignScheduleStart.set((c.schedule_start_time || '09:00').slice(0, 5));
    this.editCampaignScheduleEnd.set((c.schedule_end_time || '18:00').slice(0, 5));
    this.editCampaignScheduleDays.set(Array.isArray(c.schedule_days) ? [...c.schedule_days] : []);
    this.editCampaignMinDelay.set(c.min_delay_seconds);
    this.editCampaignMaxDelay.set(c.max_delay_seconds);
    this.editCampaignDailyLimit.set(c.daily_limit);
    this.editCampaignHourlyLimit.set(c.hourly_limit);
    this.editCampaignBatchSize.set(c.batch_size);
    this.editCampaignBatchPause.set(c.batch_pause_seconds);
    this.campaignEditing.set(true);
  }

  cancelEditingCampaign() {
    this.campaignEditing.set(false);
  }

  toggleEditScheduleDay(dow: number) {
    this.editCampaignScheduleDays.update(days =>
      days.includes(dow) ? days.filter(d => d !== dow) : [...days, dow].sort(),
    );
  }

  async saveCampaignEdit() {
    const c = this.activeCampaignDetail();
    if (!c) return;

    this.campaignEditSaving.set(true);
    try {
      const scheduleOn = this.editCampaignScheduleEnabled();
      const patch: Partial<WaCampaign> = {
        name: this.editCampaignName() || c.name,
        description: this.editCampaignDescription() || null,
        min_delay_seconds: Math.max(1, this.editCampaignMinDelay()),
        max_delay_seconds: Math.max(1, this.editCampaignMaxDelay()),
        daily_limit: Math.max(1, this.editCampaignDailyLimit()),
        hourly_limit: Math.max(1, this.editCampaignHourlyLimit()),
        batch_size: Math.max(1, this.editCampaignBatchSize()),
        batch_pause_seconds: Math.max(0, this.editCampaignBatchPause()),
        schedule_start_time: scheduleOn ? this.editCampaignScheduleStart() : null,
        schedule_end_time: scheduleOn ? this.editCampaignScheduleEnd() : null,
        schedule_days: scheduleOn ? [...this.editCampaignScheduleDays()] : [],
      };

      const updated = await this.wa.updateCampaign(c.id, patch);
      if (updated) {
        this.activeCampaignDetail.set(updated);
      }
      this.campaignEditing.set(false);
      await this.loadCampaigns();
    } finally {
      this.campaignEditSaving.set(false);
    }
  }

  getScheduleDaysLabel(days: number[]): string {
    if (!days || days.length === 0) return 'Todos';
    const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    return [...days].sort().map(d => names[d] ?? '?').join(' · ');
  }

  // ─── Settings ──────────────────────────────

  async loadSettings() {
    this.sessions.set(await this.wa.getSessions());
    // Verificar estado real de cada sesion con instancia
    for (const s of this.sessions()) {
      if (s.phone_number) {
        const status = await this.wa.getInstanceStatus(s.phone_number);
        if (status !== s.status) {
          await this.wa.updateSession(s.id, status);
        }
      }
    }
    this.sessions.set(await this.wa.getSessions());
  }

  async createSession() {
    if (!this.newSessionName() || !this.requireSubscription()) return;
    this.sessionLoading.set(true);
    this.sessionError.set(null);
    this.qrCode.set(null);
    this.qrImage.set(null);
    this.pairingCode.set(null);

    try {
      const { instance } = await this.wa.createSession(this.newSessionName());
      if (!instance) {
        throw new Error('Evolution no devolvio el nombre de la instancia.');
      }

      this.activeInstance.set(instance);
      this.newSessionName.set('');

      // Evolution a veces tarda en generar el QR. Intentamos hasta 4 veces
      // con pausas crecientes antes de rendirnos.
      const got = await this.fetchQrWithRetries(instance);
      if (!got) {
        throw new Error('No se pudo generar el codigo QR despues de varios intentos. Intenta de nuevo.');
      }

      this.startQrPolling(instance);
      await this.loadSettings();
    } catch (e: unknown) {
      this.sessionError.set(e instanceof Error ? e.message : 'Error al crear sesion');
    } finally {
      this.sessionLoading.set(false);
    }
  }

  async connectSession(session: WaSession) {
    if (!session.phone_number) return;
    this.sessionLoading.set(true);
    this.sessionError.set(null);
    this.activeInstance.set(session.phone_number);
    this.qrCode.set(null);
    this.qrImage.set(null);
    this.pairingCode.set(null);
    try {
      const got = await this.fetchQrWithRetries(session.phone_number);
      if (!got) {
        throw new Error('No se pudo obtener el QR. Elimina la sesion e intenta crear una nueva.');
      }
      this.startQrPolling(session.phone_number);
    } catch (e: unknown) {
      this.sessionError.set(e instanceof Error ? e.message : 'Error al obtener QR');
    } finally {
      this.sessionLoading.set(false);
    }
  }

  /**
   * Llama a getQRCode con reintentos. Evolution genera el QR de forma
   * asincrona, asi que puede volver vacio la primera vez. Reintentamos
   * hasta 4 veces con pausas de 2s, 3s, 4s.
   *
   * Excepcion: si el wa-engine devuelve error_code `evolution_no_qr`
   * (servidor Evolution caido o IP baneada por WhatsApp), abortamos
   * inmediatamente — los reintentos no van a ayudar y solo demoran
   * el mensaje accionable al usuario.
   */
  private async fetchQrWithRetries(instance: string): Promise<boolean> {
    const waits = [0, 2000, 3000, 4000];
    for (let i = 0; i < waits.length; i++) {
      if (waits[i] > 0) {
        await new Promise(r => setTimeout(r, waits[i]));
      }
      // Si el usuario cerro o cambio de instancia, abortar.
      if (this.activeInstance() !== instance) return false;
      try {
        const { qrCode, qrImage, pairingCode } = await this.wa.getQRCode(instance);
        if (qrImage || qrCode || pairingCode) {
          this.qrCode.set(qrCode);
          this.qrImage.set(qrImage);
          this.pairingCode.set(pairingCode);
          return true;
        }
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === 'evolution_no_qr') throw e;
        console.warn(`[createSession] intento ${i + 1} fallo`, e);
        if (i === waits.length - 1) throw e;
      }
    }
    return false;
  }

  async refreshQR(instance: string) {
    // Usado por el boton "Generar nuevo codigo" y el polling. Intenta una
    // vez y setea lo que haya (si no hay nada, limpia para forzar reintento
    // en el proximo tick del polling).
    try {
      const { qrCode, qrImage, pairingCode } = await this.wa.getQRCode(instance);
      this.qrCode.set(qrCode);
      this.qrImage.set(qrImage);
      this.pairingCode.set(pairingCode);
    } catch (e) {
      console.warn('[refreshQR]', e);
    }
  }

  /**
   * Polling de conexión cada 3s hasta 3 min. Cuando Evolution reporte
   * `connected`, actualiza la DB y cierra el QR automáticamente.
   */
  private startQrPolling(instance: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.qrPollHandle) {
      clearInterval(this.qrPollHandle);
      this.qrPollHandle = null;
    }
    let ticks = 0;
    const MAX_TICKS = 60; // 60 * 3s = 3 min
    this.qrPollHandle = setInterval(async () => {
      ticks++;
      if (this.activeInstance() !== instance || ticks > MAX_TICKS) {
        if (this.qrPollHandle) {
          clearInterval(this.qrPollHandle);
          this.qrPollHandle = null;
        }
        return;
      }
      try {
        // Si todavia no tenemos el QR en pantalla, volver a pedirlo.
        // Evolution lo genera asincrono: puede llegar por webhook despues
        // de la llamada inicial.
        if (!this.qrImage() && !this.pairingCode()) {
          try { await this.refreshQR(instance); } catch { /* noop */ }
        }
        const status = await this.wa.getInstanceStatus(instance);
        if (status === 'connected') {
          // Actualizar DB para que el worker pueda procesar campañas
          const session = this.sessions().find(s => s.phone_number === instance);
          if (session) {
            await this.wa.updateSession(session.id, 'connected');
          }
          this.qrCode.set(null);
          this.qrImage.set(null);
          this.pairingCode.set(null);
          this.activeInstance.set(null);
          if (this.qrPollHandle) {
            clearInterval(this.qrPollHandle);
            this.qrPollHandle = null;
          }
          await this.loadSettings();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  async checkConnection() {
    const instance = this.activeInstance();
    if (!instance) return;
    const status = await this.wa.getInstanceStatus(instance);
    const session = this.sessions().find(s => s.phone_number === instance);
    if (session && status !== session.status) {
      await this.wa.updateSession(session.id, status);
    }
    if (status === 'connected') {
      this.qrCode.set(null);
      this.pairingCode.set(null);
      this.activeInstance.set(null);
      if (this.qrPollHandle) {
        clearInterval(this.qrPollHandle);
        this.qrPollHandle = null;
      }
      await this.loadSettings();
    }
  }

  async deleteSession(id: string) {
    const session = this.sessions().find(s => s.id === id);
    const name = session?.session_name || 'esta sesion';
    if (!confirm(
      `¿Eliminar ${name}?\n\n` +
      `Se desconectara de WhatsApp y quedara el numero libre para reconectar luego.`,
    )) {
      return;
    }

    // Si estabamos viendo el QR de esta sesion, limpiar estado UI.
    if (session?.phone_number && this.activeInstance() === session.phone_number) {
      this.activeInstance.set(null);
      this.qrCode.set(null);
      this.qrImage.set(null);
      this.pairingCode.set(null);
      if (this.qrPollHandle) {
        clearInterval(this.qrPollHandle);
        this.qrPollHandle = null;
      }
    }

    const result = await this.wa.deleteSession(id);
    if (!result.ok) {
      alert(result.error || 'No se pudo eliminar la sesion.');
      return;
    }

    await this.loadSettings();
  }

  async sendTest() {
    if (!this.requireSubscription()) return;
    const phone = this.normalizePhone(this.testPhone());
    if (!phone || !this.testMessage()) {
      this.testResult.set('Ingresa un teléfono válido y un mensaje');
      return;
    }
    const sessions = this.sessions().filter(s => s.status === 'connected');
    if (!sessions.length || !sessions[0].phone_number) {
      this.testResult.set('No hay sesión conectada. Escanea el QR primero.');
      return;
    }
    this.testSending.set(true);
    this.testResult.set(null);
    const ok = await this.wa.sendTestMessage(sessions[0].phone_number, phone, this.testMessage());
    this.testResult.set(ok ? 'Mensaje enviado correctamente ✓' : 'Error al enviar el mensaje');
    this.testSending.set(false);
  }

  getSessionStatusIcon(status: string): string {
    const map: Record<string, string> = {
      connected: 'check_circle', disconnected: 'cancel', qr_pending: 'qr_code_2', banned: 'block',
    };
    return map[status] ?? 'help';
  }

  getSessionStatusColor(status: string): string {
    const map: Record<string, string> = {
      connected: 'text-green-400', disconnected: 'text-slate-500', qr_pending: 'text-yellow-400', banned: 'text-red-400',
    };
    return map[status] ?? 'text-slate-400';
  }

  updateAntiBlockField(field: keyof WaAntiBlockConfig, value: number | boolean) {
    this.antiBlockConfig.update(c => ({ ...c, [field]: value }));
  }

  /** Aplica un preset de anti-bloqueo completo sobre la config actual. */
  applyPreset(preset: WaAntiBlockPreset) {
    this.selectedPreset.set(preset);
    this.antiBlockConfig.set({ ...ANTI_BLOCK_PRESETS[preset] });
  }

  /**
   * Retorna true si alguna sesión del usuario tiene menos de 30 días desde
   * su creación. Se usa para sugerir el preset "new_account" y mostrar
   * warnings por UI.
   */
  hasNewSession = computed(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    return this.sessions().some(s => {
      if (!s.created_at) return false;
      const age = now - new Date(s.created_at).getTime();
      return age < THIRTY_DAYS;
    });
  });

  /** Edad en días de la sesión más joven (o null si no hay). */
  youngestSessionAgeDays = computed(() => {
    const ages = this.sessions()
      .map(s => s.created_at ? Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000) : null)
      .filter((n): n is number => n !== null);
    if (ages.length === 0) return null;
    return Math.min(...ages);
  });

  /**
   * Detecta acortadores de URL en el contenido y variantes de la plantilla
   * en edición. Retorna el dominio encontrado o null.
   */
  private detectShortenerInTemplate(): string | null {
    const content = this.newTemplateContent() || '';
    const fromContent = findShortenerInText(content);
    if (fromContent) return fromContent;
    for (const v of this.newTemplateVariants()) {
      const hit = findShortenerInText(v || '');
      if (hit) return hit;
    }
    return null;
  }

  /** Se llama al escribir en contenido o variantes para alertar en vivo. */
  onTemplateContentChange(value: string) {
    this.newTemplateContent.set(value);
    this.recomputeTemplateUrlWarning();
  }

  recomputeTemplateUrlWarning() {
    const hit = this.detectShortenerInTemplate();
    this.templateUrlWarning.set(hit ? hit : null);
  }
}
