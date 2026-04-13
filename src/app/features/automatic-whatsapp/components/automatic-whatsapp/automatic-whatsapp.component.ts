import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  WaMessageType,
  WaTemplateCategory,
  DEFAULT_ANTI_BLOCK_CONFIG,
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
export class AutomaticWhatsappComponent implements OnInit {
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
    totalSent: 0, totalDelivered: 0, totalFailed: 0, totalReplies: 0,
    deliveryRate: 0, replyRate: 0, activeCampaigns: 0, todaySent: 0,
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
  newTemplateMediaFile = signal<File | null>(null);
  editingTemplate = signal<WaTemplate | null>(null);

  // Campaigns
  campaigns = signal<WaCampaign[]>([]);
  campaignModal = signal<CampaignModal>('none');
  newCampaignName = signal('');
  newCampaignDescription = signal('');
  newCampaignTemplateId = signal('');
  newCampaignTargetType = signal<'all' | 'group' | 'custom'>('all');
  newCampaignGroupId = signal('');
  antiBlockConfig = signal<WaAntiBlockConfig>({ ...DEFAULT_ANTI_BLOCK_CONFIG });
  activeCampaignDetail = signal<WaCampaign | null>(null);

  // Settings / Sessions
  sessions = signal<WaSession[]>([]);
  newSessionName = signal('');
  activeInstance = signal<string | null>(null);
  qrCode = signal<string | null>(null);
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
    if (!this.newContactPhone() || !this.requireSubscription()) return;
    await this.wa.createContact({
      phone: this.newContactPhone(),
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
    const parsed = lines.map(line => {
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      const phone = parts[0]?.replace(/[^0-9+]/g, '');
      const name = parts[1] || undefined;
      return { phone, name };
    }).filter(c => c.phone.length >= 7);

    if (parsed.length === 0) {
      this.importResult.set('No se encontraron numeros validos');
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
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const hasHeader = lines.length > 0 && !/^[+\d]/.test(lines[0]);
      const start = hasHeader ? 1 : 0;

      const contacts: { phone: string; name?: string }[] = [];
      const seen = new Set<string>();

      for (let i = start; i < lines.length; i++) {
        const cols = lines[i].split(/[,;\t]/);
        const raw = cols[0]?.trim() ?? '';
        const phone = raw.replace(/[^0-9+]/g, '');
        if (phone.length >= 7 && phone.length <= 15 && !seen.has(phone)) {
          seen.add(phone);
          contacts.push({ phone, name: cols[1]?.trim() || undefined });
        }
      }

      if (contacts.length === 0) {
        this.excelImportResult.set('No se encontraron numeros validos en el archivo');
      } else {
        const count = await this.wa.importContacts(contacts);
        this.excelImportResult.set(`${count} contactos importados desde ${file.name}`);
        await this.loadContacts();
      }
      this.excelImportLoading.set(false);
    };
    reader.onerror = () => {
      this.excelImportResult.set('Error al leer el archivo');
      this.excelImportLoading.set(false);
    };
    reader.readAsText(file);
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
    this.templateModal.set('create');
  }

  editTemplate(t: WaTemplate) {
    this.editingTemplate.set(t);
    this.newTemplateName.set(t.name);
    this.newTemplateCategory.set(t.category);
    this.newTemplateType.set(t.message_type);
    this.newTemplateContent.set(t.content);
    this.templateModal.set('create');
  }

  async saveTemplate() {
    if (!this.newTemplateName() || !this.newTemplateContent() || !this.requireSubscription()) return;

    let mediaUrl: string | null = null;
    const file = this.newTemplateMediaFile();
    if (file) {
      mediaUrl = await this.wa.uploadMedia(file);
    }

    const payload: Partial<WaTemplate> = {
      name: this.newTemplateName(),
      category: this.newTemplateCategory(),
      message_type: this.newTemplateType(),
      content: this.newTemplateContent(),
    };
    if (mediaUrl) {
      payload.media_url = mediaUrl;
      payload.media_filename = file!.name;
    }

    const editing = this.editingTemplate();
    if (editing) {
      await this.wa.updateTemplate(editing.id, payload);
    } else {
      await this.wa.createTemplate(payload);
    }
    this.templateModal.set('none');
    await this.loadTemplates();
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
    this.newCampaignTargetType.set('all');
    this.newCampaignGroupId.set('');
    this.antiBlockConfig.set({ ...DEFAULT_ANTI_BLOCK_CONFIG });
    this.activeCampaignDetail.set(null);
    this.campaignModal.set('create');
  }

  async saveCampaign() {
    if (!this.newCampaignName() || !this.newCampaignTemplateId() || !this.requireSubscription()) return;
    const config = this.antiBlockConfig();
    const totalContacts = this.newCampaignTargetType() === 'all'
      ? await this.wa.getContactCount()
      : this.newCampaignTargetType() === 'group'
        ? (this.groups().find(g => g.id === this.newCampaignGroupId())?.contacts_count ?? 0)
        : this.selectedContacts().size;

    await this.wa.createCampaign({
      name: this.newCampaignName(),
      description: this.newCampaignDescription() || null,
      template_id: this.newCampaignTemplateId(),
      target_type: this.newCampaignTargetType(),
      target_group_id: this.newCampaignTargetType() === 'group' ? this.newCampaignGroupId() : null,
      target_contact_ids: this.newCampaignTargetType() === 'custom' ? [...this.selectedContacts()] : [],
      total_contacts: totalContacts,
      ...config,
    });
    this.campaignModal.set('none');
    await this.loadCampaigns();
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
    await this.wa.pauseCampaign(id);
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
    this.pairingCode.set(null);

    try {
      const { instance } = await this.wa.createSession(this.newSessionName());
      if (instance) {
        this.activeInstance.set(instance);
        // Esperar un momento y obtener el QR
        await new Promise(r => setTimeout(r, 2000));
        await this.refreshQR(instance);
      }
      this.newSessionName.set('');
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
    this.activeInstance.set(session.phone_number);
    this.qrCode.set(null);
    try {
      await this.refreshQR(session.phone_number);
    } catch {
      this.sessionError.set('Error al obtener QR');
    } finally {
      this.sessionLoading.set(false);
    }
  }

  async refreshQR(instance: string) {
    const { qrCode, pairingCode } = await this.wa.getQRCode(instance);
    this.qrCode.set(qrCode);
    this.pairingCode.set(pairingCode);
  }

  async checkConnection() {
    const instance = this.activeInstance();
    if (!instance) return;
    const status = await this.wa.getInstanceStatus(instance);
    if (status === 'connected') {
      this.qrCode.set(null);
      this.pairingCode.set(null);
      this.activeInstance.set(null);
      await this.loadSettings();
    }
  }

  async deleteSession(id: string) {
    await this.wa.deleteSession(id);
    await this.loadSettings();
  }

  async sendTest() {
    if (!this.testPhone() || !this.testMessage()) return;
    const sessions = this.sessions().filter(s => s.status === 'connected');
    if (!sessions.length || !sessions[0].phone_number) {
      this.testResult.set('No hay sesion conectada');
      return;
    }
    this.testSending.set(true);
    this.testResult.set(null);
    const ok = await this.wa.sendTestMessage(sessions[0].phone_number, this.testPhone(), this.testMessage());
    this.testResult.set(ok ? 'Mensaje enviado correctamente' : 'Error al enviar el mensaje');
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
}
