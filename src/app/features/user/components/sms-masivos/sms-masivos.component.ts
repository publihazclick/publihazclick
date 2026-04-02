import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmsService, calculateSmsSegments } from '../../../../core/services/sms.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { environment } from '../../../../../environments/environment';
import type {
  SmsContact,
  SmsCampaign,
  SmsTemplate,
  SmsDashboardStats,
} from '../../../../core/models/sms.model';

type TabId = 'dashboard' | 'compose' | 'templates' | 'contacts' | 'saved-lists' | 'campaigns' | 'sent-messages' | 'recharge-history';

@Component({
  selector: 'app-sms-masivos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './sms-masivos.component.html',
  host: { class: 'block' },
})
export class SmsMasivosComponent implements OnInit {
  private readonly smsService = inject(SmsService);
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);

  // ── Tab state ───────────────────────────────────────────────
  readonly activeTab = signal<TabId>('dashboard');

  // ── Data signals ────────────────────────────────────────────
  readonly loading = signal(false);
  readonly contacts = signal<SmsContact[]>([]);
  readonly campaigns = signal<SmsCampaign[]>([]);
  readonly templates = signal<SmsTemplate[]>([]);
  readonly stats = signal<SmsDashboardStats | null>(null);

  // ── Menu & Modal visibility ─────────────────────────────────
  readonly menuOpen = signal(false);
  readonly showContactModal = signal(false);
  readonly showTemplateModal = signal(false);
  readonly showImportModal = signal(false);

  // ── Editing state ───────────────────────────────────────────
  readonly editingContact = signal<SmsContact | null>(null);
  readonly editingTemplate = signal<SmsTemplate | null>(null);

  // ── Contact form fields ─────────────────────────────────────
  contactName = '';
  contactPhone = '';
  contactCountryCode = '+57';
  contactTags = '';
  contactNotes = '';

  // ── Template form fields ────────────────────────────────────
  templateName = '';
  templateBody = '';

  // ── Compose fields ──────────────────────────────────────────
  composeMessage = '';
  composeCampaignName = '';

  // ── Excel upload ────────────────────────────────────────────
  readonly excelPhones = signal<string[]>([]);
  readonly excelFileName = signal('');
  readonly excelTotalRows = signal(0);
  readonly excelInvalid = signal<{ row: number; value: string; reason: string }[]>([]);

  // ── Distribution mode ───────────────────────────────────────
  distributionMode: 'all' | 'split' = 'all';
  splitParts = 2;
  splitSchedules: string[] = ['', ''];

  // ── Confirm modal ──────────────────────────────────────────
  readonly showConfirmModal = signal(false);

  // ── Billetera modals ───────────────────────────────────────
  readonly showRecargaModal = signal(false);
  readonly showRetiroModal = signal(false);
  readonly selectedRecharge = signal<number | null>(null);
  readonly rechargeLoading = signal(false);
  readonly rechargeError = signal<string | null>(null);

  readonly smsRechargeOptions = [
    { usd: 10,    cop: 10 * 3_700 },
    { usd: 20,    cop: 20 * 3_700 },
    { usd: 50,    cop: 50 * 3_700 },
    { usd: 150,   cop: 150 * 3_700 },
    { usd: 250,   cop: 250 * 3_700 },
    { usd: 500,   cop: 500 * 3_700 },
    { usd: 1_000, cop: 1_000 * 3_700 },
    { usd: 1_500, cop: 1_500 * 3_700 },
    { usd: 2_000, cop: 2_000 * 3_700 },
  ];

  // ── Operation state ─────────────────────────────────────────
  readonly sending = signal(false);
  readonly success = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // ── Import ──────────────────────────────────────────────────
  readonly importCsvText = signal('');

  // ── Computed ────────────────────────────────────────────────
  readonly smsInfo = computed(() => calculateSmsSegments(this.composeMessage));

  readonly recipientCount = computed(() => this.excelPhones().length);

  // ── Country codes ───────────────────────────────────────────
  readonly countryCodes = [
    { code: '+57', country: 'Colombia' },
    { code: '+1', country: 'USA/Canada' },
    { code: '+52', country: 'México' },
    { code: '+54', country: 'Argentina' },
    { code: '+56', country: 'Chile' },
    { code: '+51', country: 'Perú' },
    { code: '+593', country: 'Ecuador' },
    { code: '+58', country: 'Venezuela' },
    { code: '+507', country: 'Panamá' },
    { code: '+34', country: 'España' },
    { code: '+55', country: 'Brasil' },
    { code: '+44', country: 'UK' },
    { code: '+49', country: 'Alemania' },
    { code: '+33', country: 'Francia' },
    { code: '+39', country: 'Italia' },
  ];

  // ── Lifecycle ───────────────────────────────────────────────

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadAllData();
    }
  }

  // ── Data loading ────────────────────────────────────────────

  private async loadAllData(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;

    this.loading.set(true);
    try {
      const [contacts, campaigns, templates, stats] = await Promise.all([
        this.smsService.getContacts(profile.id),
        this.smsService.getCampaigns(profile.id),
        this.smsService.getTemplates(profile.id),
        this.smsService.getDashboardStats(profile.id),
      ]);
      this.contacts.set(contacts);
      this.campaigns.set(campaigns);
      this.templates.set(templates);
      this.stats.set(stats);
    } catch (err: any) {
      this.error.set(err.message ?? 'Error cargando datos');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Tab ─────────────────────────────────────────────────────

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    this.menuOpen.set(false);
  }

  // ── Contact CRUD ────────────────────────────────────────────

  openContactModal(): void {
    this.editingContact.set(null);
    this.contactName = '';
    this.contactPhone = '';
    this.contactCountryCode = '+57';
    this.contactTags = '';
    this.contactNotes = '';
    this.showContactModal.set(true);
  }

  editContact(c: SmsContact): void {
    this.editingContact.set(c);
    this.contactName = c.full_name;
    this.contactPhone = c.phone_number;
    this.contactCountryCode = c.country_code || '+57';
    this.contactTags = (c.tags ?? []).join(', ');
    this.contactNotes = c.notes ?? '';
    this.showContactModal.set(true);
  }

  closeContactModal(): void {
    this.showContactModal.set(false);
    this.editingContact.set(null);
  }

  async saveContact(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;

    const tags = this.contactTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload: Partial<SmsContact> = {
      user_id: profile.id,
      full_name: this.contactName,
      phone_number: this.contactPhone,
      country_code: this.contactCountryCode,
      tags,
      notes: this.contactNotes,
      is_active: true,
    };

    try {
      const editing = this.editingContact();
      if (editing) {
        await this.smsService.updateContact(editing.id, payload);
      } else {
        await this.smsService.createContact(payload);
      }
      this.closeContactModal();
      this.contacts.set(await this.smsService.getContacts(profile.id));
      this.showSuccess(editing ? 'Contacto actualizado' : 'Contacto creado');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error guardando contacto');
    }
  }

  async deleteContact(id: string): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;
    try {
      await this.smsService.deleteContact(id);
      this.contacts.set(await this.smsService.getContacts(profile.id));
      this.showSuccess('Contacto eliminado');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error eliminando contacto');
    }
  }

  // ── Template CRUD ───────────────────────────────────────────

  openTemplateModal(): void {
    this.editingTemplate.set(null);
    this.templateName = '';
    this.templateBody = '';
    this.showTemplateModal.set(true);
  }

  editTemplate(t: SmsTemplate): void {
    this.editingTemplate.set(t);
    this.templateName = t.name;
    this.templateBody = t.body;
    this.showTemplateModal.set(true);
  }

  closeTemplateModal(): void {
    this.showTemplateModal.set(false);
    this.editingTemplate.set(null);
  }

  async saveTemplate(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;

    const variables = (this.templateBody.match(/\{(\w+)\}/g) ?? []).map((v) =>
      v.replace(/[{}]/g, '')
    );

    const payload: Partial<SmsTemplate> = {
      user_id: profile.id,
      name: this.templateName,
      body: this.templateBody,
      variables,
    };

    try {
      const editing = this.editingTemplate();
      if (editing) {
        await this.smsService.updateTemplate(editing.id, payload);
      } else {
        await this.smsService.createTemplate(payload);
      }
      this.closeTemplateModal();
      this.templates.set(await this.smsService.getTemplates(profile.id));
      this.showSuccess(editing ? 'Plantilla actualizada' : 'Plantilla creada');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error guardando plantilla');
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;
    try {
      await this.smsService.deleteTemplate(id);
      this.templates.set(await this.smsService.getTemplates(profile.id));
      this.showSuccess('Plantilla eliminada');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error eliminando plantilla');
    }
  }

  // ── Import ──────────────────────────────────────────────────

  openImportModal(): void {
    this.importCsvText.set('');
    this.showImportModal.set(true);
  }

  closeImportModal(): void {
    this.showImportModal.set(false);
  }

  async processImport(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;

    const lines = this.importCsvText()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const contactsToImport: Partial<SmsContact>[] = lines.map((line) => {
      const [name, phone] = line.split(',').map((s) => s.trim());
      return {
        user_id: profile.id,
        full_name: name || 'Sin nombre',
        phone_number: phone || name,
        country_code: '+57',
        tags: ['importado'],
        notes: '',
        is_active: true,
      };
    });

    try {
      await this.smsService.bulkImportContacts(contactsToImport);
      this.closeImportModal();
      this.contacts.set(await this.smsService.getContacts(profile.id));
      this.showSuccess(`${contactsToImport.length} contactos importados`);
    } catch (err: any) {
      this.error.set(err.message ?? 'Error importando contactos');
    }
  }

  // ── Compose / Send ──────────────────────────────────────────

  useTemplate(t: SmsTemplate): void {
    this.composeMessage = t.body;
    this.setTab('compose');
  }

  insertVariable(variable: string): void {
    this.composeMessage += `{${variable}}`;
  }

  async sendCampaign(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;

    this.sending.set(true);
    this.error.set(null);

    try {
      // Determine recipients from Excel upload
      const phones = [...this.excelPhones()];

      if (phones.length === 0) {
        this.error.set('No hay destinatarios seleccionados');
        this.sending.set(false);
        return;
      }

      // Create campaign
      const campaign = await this.smsService.createCampaign({
        user_id: profile.id,
        name: this.composeCampaignName || `Campaña ${new Date().toLocaleDateString()}`,
        message_body: this.composeMessage,
        status: 'draft',
        total_recipients: phones.length,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
        cost_per_sms: 0.03,
        total_cost: phones.length * 0.03,
      });

      // Add recipients
      const recipients = phones.map((phone) => ({
        campaign_id: campaign.id,
        phone_number: phone,
        contact_name:
          this.contacts().find((c) => c.phone_number === phone)?.full_name ?? undefined,
        status: 'pending' as const,
        cost: 0.03,
      }));

      await this.smsService.addCampaignRecipients(recipients);

      // Update status to sending
      await this.smsService.updateCampaign(campaign.id, { status: 'sending' });

      // Refresh data
      this.campaigns.set(await this.smsService.getCampaigns(profile.id));
      this.stats.set(await this.smsService.getDashboardStats(profile.id));

      // Reset compose
      this.composeMessage = '';
      this.composeCampaignName = '';
      this.excelPhones.set([]);
      this.excelFileName.set('');
      this.excelTotalRows.set(0);
      this.excelInvalid.set([]);
      this.distributionMode = 'all';
      this.splitParts = 2;
      this.splitSchedules = ['', ''];

      this.showSuccess(`Campaña enviada a ${phones.length} destinatarios`);
      this.setTab('campaigns');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error enviando campaña');
    } finally {
      this.sending.set(false);
    }
  }

  // ── Billetera Recargable (ePayco) ────────────────────────────

  selectRecharge(usd: number): void {
    this.selectedRecharge.set(usd);
  }

  async startSmsRecharge(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const opt = this.smsRechargeOptions.find(o => o.usd === this.selectedRecharge());
    if (!opt) return;

    this.rechargeError.set(null);
    this.rechargeLoading.set(true);

    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();

      // Verificar sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado. Inicia sesión de nuevo.');

      const response = await supabase.functions.invoke('create-sms-wallet-recharge', {
        body: { amount: opt.cop },
      });

      // supabase-js v2: en error HTTP, data puede tener el body o error tiene el mensaje
      const data = response.data ?? response.error;

      if (!data?.invoice) {
        const errMsg = data?.error
          ?? (typeof response.error === 'string' ? response.error : null)
          ?? (response.error as any)?.message
          ?? 'Error al preparar el pago';
        throw new Error(errMsg);
      }

      await this.loadEpaycoScript();

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
        external:      'false',
        confirmation:  data.confirmation,
        response:      `${window.location.origin}/dashboard/sms-masivos?epayco=result`,
        email_billing: data.email_billing,
        name_billing:  data.name_billing,
        extra1:        data.extra1,
        extra2:        data.extra2,
        extra3:        data.extra3,
      });

      this.showRecargaModal.set(false);
    } catch (e: unknown) {
      this.rechargeError.set(e instanceof Error ? e.message : 'Error al iniciar pago');
    } finally {
      this.rechargeLoading.set(false);
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

  // ── Excel upload ────────────────────────────────────────────

  onExcelFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.excelFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const hasHeader = lines.length > 0 && !/^[\+\d]/.test(lines[0]);
      const start = hasHeader ? 1 : 0;
      const dataRows = lines.length - start;
      this.excelTotalRows.set(dataRows);

      const phones: string[] = [];
      const invalid: { row: number; value: string; reason: string }[] = [];
      const seen = new Set<string>();

      for (let i = start; i < lines.length; i++) {
        const rowNum = i + 1;
        const cols = lines[i].split(/[,;\t]/);
        const raw = cols[0].trim();
        const phone = raw.replace(/[^+\d]/g, '');

        if (!raw || raw.length === 0) {
          invalid.push({ row: rowNum, value: raw, reason: 'Celda vacía' });
        } else if (!/\d/.test(raw)) {
          invalid.push({ row: rowNum, value: raw, reason: 'No contiene números' });
        } else if (phone.length < 7) {
          invalid.push({ row: rowNum, value: raw, reason: 'Número muy corto (mínimo 7 dígitos)' });
        } else if (phone.length > 15) {
          invalid.push({ row: rowNum, value: raw, reason: 'Número muy largo (máximo 15 dígitos)' });
        } else if (!/^\+?\d+$/.test(phone)) {
          invalid.push({ row: rowNum, value: raw, reason: 'Formato inválido' });
        } else if (seen.has(phone)) {
          invalid.push({ row: rowNum, value: raw, reason: 'Número duplicado' });
        } else {
          seen.add(phone);
          phones.push(phone);
        }
      }

      this.excelPhones.set(phones);
      this.excelInvalid.set(invalid);
    };
    reader.readAsText(file);
    input.value = '';
  }

  removeExcelFile(): void {
    this.excelPhones.set([]);
    this.excelFileName.set('');
    this.excelTotalRows.set(0);
    this.excelInvalid.set([]);
  }

  // ── Distribution ───────────────────────────────────────────

  onSplitPartsChange(value: number): void {
    this.splitParts = Math.max(2, Math.min(10, value));
    this.splitSchedules = Array.from({ length: this.splitParts }, (_, i) => this.splitSchedules[i] ?? '');
  }

  getPartSize(partIndex: number): number {
    const total = this.excelPhones().length;
    const base = Math.floor(total / this.splitParts);
    const remainder = total % this.splitParts;
    return base + (partIndex < remainder ? 1 : 0);
  }

  // ── Confirm & Send ─────────────────────────────────────────

  requestSend(): void {
    this.showConfirmModal.set(true);
  }

  cancelSend(): void {
    this.showConfirmModal.set(false);
  }

  async confirmSend(): Promise<void> {
    this.showConfirmModal.set(false);
    await this.sendCampaign();
  }

  // ── Helpers ─────────────────────────────────────────────────

  private showSuccess(message: string): void {
    this.success.set(message);
    setTimeout(() => this.clearSuccess(), 4000);
  }

  clearSuccess(): void {
    this.success.set(null);
  }

  clearError(): void {
    this.error.set(null);
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 border-gray-200 text-gray-500',
      scheduled: 'bg-amber-50 border-amber-200 text-amber-600',
      sending: 'bg-blue-50 border-blue-200 text-blue-600',
      completed: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      failed: 'bg-red-50 border-red-200 text-red-600',
      cancelled: 'bg-gray-100 border-gray-200 text-gray-500',
    };
    return map[status] ?? map['draft'];
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      scheduled: 'Programado',
      sending: 'Enviando',
      completed: 'Completado',
      failed: 'Fallido',
      cancelled: 'Cancelado',
    };
    return map[status] ?? status;
  }

  getImportLineCount(): number {
    return this.importCsvText()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0).length;
  }

  recentCampaigns(): SmsCampaign[] {
    return this.campaigns().slice(0, 5);
  }

  getVariableCount(body: string): number {
    return (body.match(/\{(\w+)\}/g) ?? []).length;
  }
}
