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
import * as XLSX from 'xlsx';
import { SmsService, calculateSmsSegments } from '../../../../core/services/sms.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { environment } from '../../../../../environments/environment';
import type {
  SmsContact,
  SmsCampaign,
  SmsTemplate,
  SmsDashboardStats,
  SmsCampaignRecipient,
  SmsShortLink,
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
  readonly currencyService = inject(CurrencyService);
  readonly profile = this.profileService.profile;
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

  // ── Números escritos a mano ──────────────────────────────────
  readonly manualPhones = signal<string[]>([]);
  manualPhoneInput = '';
  readonly manualPhoneError = signal<string | null>(null);

  // ── Distribution mode ───────────────────────────────────────
  distributionMode: 'all' | 'split' = 'all';
  splitParts = 2;
  splitSchedules: string[] = ['', ''];

  // ── Confirm modal ──────────────────────────────────────────
  readonly showConfirmModal = signal(false);

  // ── Detalle de campaña ──────────────────────────────────────
  readonly showCampaignDetailModal = signal(false);
  readonly selectedCampaign = signal<SmsCampaign | null>(null);
  readonly campaignDetailLoading = signal(false);
  readonly campaignRecipients = signal<SmsCampaignRecipient[]>([]);
  readonly campaignShortLinks = signal<SmsShortLink[]>([]);

  // ── Eliminar campaña ─────────────────────────────────────────
  readonly campaignToDelete = signal<SmsCampaign | null>(null);
  readonly deletingCampaign = signal(false);

  // ── Billetera & Referral modals ─────────────────────────────
  readonly showRecargaModal = signal(false);
  readonly showRetiroModal = signal(false);
  readonly showReferralModal = signal(false);
  readonly showNoBalanceModal = signal(false);
  readonly referralCopied = signal(false);
  readonly selectedRecharge = signal<number | null>(null);
  readonly rechargeLoading = signal(false);
  readonly rechargeError = signal<string | null>(null);

  // ── Wallet balance ─────────────────────────────────────────
  readonly walletBalance = signal(0);
  readonly walletUnlimited = signal(false);

  // ── Recharge history & Sent messages ───────────────────────
  readonly rechargeHistory = signal<any[]>([]);
  readonly sentMessages = signal<any[]>([]);

  /** Escala de precios: a mayor recarga, menor costo por SMS */
  readonly smsRechargeTiers = [
    { usd: 15,    copPerSms: 80 },
    { usd: 50,    copPerSms: 76 },
    { usd: 100,   copPerSms: 72 },
    { usd: 250,   copPerSms: 68 },
    { usd: 500,   copPerSms: 64 },
    { usd: 1_000, copPerSms: 60 },
  ];

  /** Costo base por SMS en COP (tier más pequeño) */
  readonly COST_PER_SMS = 80;

  /** COP base (sin comisión) con tasa en tiempo real */
  getSmsBaseCop(usd: number): number { return this.currencyService.usdToCop(usd); }
  /** COP total (con comisión ePayco) con tasa en tiempo real */
  getSmsTotalCop(usd: number): number { return this.currencyService.usdToFinalCop(usd); }

  /** Obtener el tier para un monto USD */
  getTier(usd: number) {
    return this.smsRechargeTiers.find(t => t.usd === usd) ?? this.smsRechargeTiers[0];
  }

  /** SMS que obtiene el usuario para un tier (con bonificación) */
  getSmsCountForTier(tier: { usd: number; copPerSms: number }): number {
    const cop = this.getSmsBaseCop(tier.usd);
    return Math.floor(cop / tier.copPerSms);
  }

  /** COP acreditados al wallet (incluye bonus por volumen) */
  getCreditAmountForTier(tier: { usd: number; copPerSms: number }): number {
    const smsCount = this.getSmsCountForTier(tier);
    return smsCount * this.COST_PER_SMS;
  }

  // ── Operation state ─────────────────────────────────────────
  readonly sending = signal(false);
  readonly success = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // ── Import ──────────────────────────────────────────────────
  readonly importCsvText = signal('');

  // ── Computed ────────────────────────────────────────────────
  readonly smsInfo = computed(() => calculateSmsSegments(this.composeMessage));

  /** Unión sin duplicados de los números del Excel y los escritos a mano */
  readonly allRecipients = computed(() => Array.from(new Set([...this.excelPhones(), ...this.manualPhones()])));

  readonly recipientCount = computed(() => this.allRecipients().length);

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
      const [contacts, campaigns, templates, stats, balance, recharges, sent, clickCounts] = await Promise.all([
        this.smsService.getContacts(profile.id),
        this.smsService.getCampaigns(profile.id),
        this.smsService.getTemplates(profile.id),
        this.smsService.getDashboardStats(profile.id),
        this.smsService.getWalletBalance(profile.id),
        this.smsService.getRechargeHistory(profile.id),
        this.smsService.getAllSentMessages(profile.id),
        this.smsService.getCampaignClickCounts(profile.id),
      ]);
      this.contacts.set(contacts);
      this.campaigns.set(campaigns.map(c => ({ ...c, clicks_count: clickCounts.get(c.id) ?? 0 })));
      this.templates.set(templates);
      this.stats.set(stats);
      this.walletBalance.set(balance.balance);
      this.walletUnlimited.set(balance.unlimited);
      this.rechargeHistory.set(recharges);
      this.sentMessages.set(sent);
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
      // Determine recipients from Excel upload + números escritos a mano
      const phones = [...this.allRecipients()];

      if (phones.length === 0) {
        this.error.set('No hay destinatarios seleccionados');
        this.sending.set(false);
        return;
      }

      // Check wallet balance before sending
      const balance = this.walletBalance();
      const totalCost = phones.length * this.COST_PER_SMS;

      if (!this.walletUnlimited() && balance < totalCost) {
        this.sending.set(false);
        this.showNoBalanceModal.set(true);
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
        cost_per_sms: this.COST_PER_SMS,
        total_cost: totalCost,
      });

      // Add recipients
      const recipients = phones.map((phone) => {
        const phoneDigits = phone.replace(/\D/g, '').slice(-10);
        return {
          campaign_id: campaign.id,
          phone_number: phone,
          contact_name:
            this.contacts().find((c) => c.phone_number.replace(/\D/g, '').slice(-10) === phoneDigits)?.full_name ?? undefined,
          status: 'pending' as const,
          cost: this.COST_PER_SMS,
        };
      });

      await this.smsService.addCampaignRecipients(recipients);

      // Update status to sending
      await this.smsService.updateCampaign(campaign.id, { status: 'sending' });

      // Enviar SMS reales vía Telnyx
      const sendResult = await this.smsService.sendCampaignSms(campaign.id);

      // Refresh all data including balance
      const [campaignsData, statsData, newBalance, sentData, clickCounts] = await Promise.all([
        this.smsService.getCampaigns(profile.id),
        this.smsService.getDashboardStats(profile.id),
        this.smsService.getWalletBalance(profile.id),
        this.smsService.getAllSentMessages(profile.id),
        this.smsService.getCampaignClickCounts(profile.id),
      ]);
      this.campaigns.set(campaignsData.map(c => ({ ...c, clicks_count: clickCounts.get(c.id) ?? 0 })));
      this.stats.set(statsData);
      this.walletBalance.set(newBalance.balance);
      this.walletUnlimited.set(newBalance.unlimited);
      this.sentMessages.set(sentData);

      // Reset compose
      this.composeMessage = '';
      this.composeCampaignName = '';
      this.excelPhones.set([]);
      this.excelFileName.set('');
      this.excelTotalRows.set(0);
      this.excelInvalid.set([]);
      this.manualPhones.set([]);
      this.distributionMode = 'all';
      this.splitParts = 2;
      this.splitSchedules = ['', ''];

      if (sendResult.success) {
        this.showSuccess(`Campaña enviada: ${sendResult.sent} entregados, ${sendResult.failed} fallidos`);
      } else {
        this.showSuccess(`Campaña creada pero hubo un error al enviar: ${sendResult.error}`);
      }
      this.setTab('campaigns');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error enviando campaña');
    } finally {
      this.sending.set(false);
    }
  }

  // ── Detalle de campaña ──────────────────────────────────────

  async openCampaignDetail(c: SmsCampaign): Promise<void> {
    this.selectedCampaign.set(c);
    this.showCampaignDetailModal.set(true);
    this.campaignDetailLoading.set(true);
    this.campaignRecipients.set([]);
    this.campaignShortLinks.set([]);
    try {
      const [recipients, shortLinks] = await Promise.all([
        this.smsService.getCampaignRecipients(c.id),
        this.smsService.getCampaignShortLinks(c.id),
      ]);
      this.campaignRecipients.set(recipients);
      this.campaignShortLinks.set(shortLinks);
    } catch (err: any) {
      this.error.set(err.message ?? 'Error cargando el detalle de la campaña');
    } finally {
      this.campaignDetailLoading.set(false);
    }
  }

  closeCampaignDetail(): void {
    this.showCampaignDetailModal.set(false);
    this.selectedCampaign.set(null);
  }

  requestDeleteCampaign(c: SmsCampaign, event?: Event): void {
    event?.stopPropagation();
    this.campaignToDelete.set(c);
  }

  cancelDeleteCampaign(): void {
    this.campaignToDelete.set(null);
  }

  async confirmDeleteCampaign(): Promise<void> {
    const campaign = this.campaignToDelete();
    const profile = this.profileService.profile();
    if (!campaign || !profile) return;

    this.deletingCampaign.set(true);
    try {
      await this.smsService.deleteCampaign(campaign.id);
      this.campaigns.set(this.campaigns().filter((c) => c.id !== campaign.id));
      this.stats.set(await this.smsService.getDashboardStats(profile.id));
      this.campaignToDelete.set(null);
      if (this.selectedCampaign()?.id === campaign.id) {
        this.closeCampaignDetail();
      }
      this.showSuccess('Campaña eliminada');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error eliminando la campaña');
    } finally {
      this.deletingCampaign.set(false);
    }
  }

  getRecipientStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-amber-50 border-amber-200 text-amber-600',
      sent: 'bg-blue-50 border-blue-200 text-blue-600',
      delivered: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      failed: 'bg-red-50 border-red-200 text-red-600',
      rejected: 'bg-red-50 border-red-200 text-red-600',
    };
    return map[status] ?? map['pending'];
  }

  getRecipientStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      sent: 'Enviado',
      delivered: 'Entregado',
      failed: 'Fallido',
      rejected: 'Rechazado',
    };
    return map[status] ?? status;
  }

  /** Opens recharge modal from the no-balance modal */
  goToRecharge(): void {
    this.showNoBalanceModal.set(false);
    this.showRecargaModal.set(true);
  }

  // ── Referral ────────────────────────────────────────────────
  get referralLink(): string {
    const code = this.profileService.profile()?.referral_code ?? '';
    const origin = isPlatformBrowser(this.platformId) ? window.location.origin : 'https://www.publihazclick.com';
    return code ? `${origin}/ref/${code}?to=/sms-masivos` : '';
  }

  copyReferralLink(): void {
    if (this.referralLink && isPlatformBrowser(this.platformId)) {
      navigator.clipboard.writeText(this.referralLink);
      this.referralCopied.set(true);
      setTimeout(() => this.referralCopied.set(false), 2000);
    }
  }

  // ── Billetera Recargable (ePayco) ────────────────────────────

  selectRecharge(usd: number): void {
    this.selectedRecharge.set(usd);
  }

  async startSmsRecharge(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const usd = this.selectedRecharge();
    if (!usd) return;
    const tier = this.getTier(usd);
    const cop = this.getSmsBaseCop(usd);
    const creditAmount = this.getCreditAmountForTier(tier);

    this.rechargeError.set(null);
    this.rechargeLoading.set(true);

    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();

      // Llamar directo a la edge function sin verificaciones intermedias
      const response = await supabase.functions.invoke('create-sms-wallet-recharge', {
        body: { amount: cop, credit_amount: creditAmount },
      });

      const data = response.data;
      if (!data?.invoice) {
        const errMsg = data?.error || 'Error al preparar el pago. Intenta cerrar sesión y volver a entrar.';
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
        external:      'true',
        confirmation:  data.confirmation,
        response:      `${window.location.origin}/dashboard/sms-masivos?epayco=result`,
        methodConfirmation: 'POST',
        email_billing: data.email_billing,
        name_billing:  data.name_billing,
        extra1:        data.extra1,
        extra2:        data.extra2,
        extra3:        data.extra3,
      });

      this.showRecargaModal.set(false);
      this.showNoBalanceModal.set(false);
    } catch (e: unknown) {
      this.rechargeError.set(e instanceof Error ? e.message : 'Error al iniciar pago');
    } finally {
      this.rechargeLoading.set(false);
    }
  }

  /** Refresh wallet balance (called after payment callback) */
  async refreshBalance(): Promise<void> {
    const profile = this.profileService.profile();
    if (!profile) return;
    try {
      const [balance, recharges] = await Promise.all([
        this.smsService.getWalletBalance(profile.id),
        this.smsService.getRechargeHistory(profile.id),
      ]);
      this.walletBalance.set(balance.balance);
      this.walletUnlimited.set(balance.unlimited);
      this.rechargeHistory.set(recharges);
    } catch {}
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

  /**
   * Convierte cualquier valor de celda Excel/CSV a texto seguro sin pasar
   * por notación científica. Un número grande (573001234567) guardado como
   * celda "Número" en Excel puede llegar como 573001234567 (float) y
   * String() lo vuelve "5.73001234567e+11" si es enorme; toFixed(0) evita
   * esa serialización y conserva todos los dígitos.
   */
  private cellToString(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw.toFixed(0) : '';
    return String(raw).trim();
  }

  /**
   * Normaliza cualquier formato de teléfono a E.164 (+<código país><número>).
   * Corrige automáticamente los casos más comunes de un Excel real:
   * - Espacios, guiones, paréntesis, puntos.
   * - Números colombianos de 10 dígitos sin el indicativo 57 (celulares
   *   empiezan por 3, o por 6 desde la ampliación de rangos de la CRC).
   * - El 57 ya incluido, con o sin "+" adelante.
   * - Un 0 o 00 de marcado internacional antes del indicativo.
   * Devuelve null solo si, después de corregir, no queda un número viable.
   */
  private normalizePhone(raw: unknown): string | null {
    const str = this.cellToString(raw);
    if (!str) return null;

    let digits = str.replace(/[^\d]/g, '');
    if (!digits) return null;

    digits = digits.replace(/^0+(?=\d)/, '');

    if (digits.length === 10 && /^(3|6)/.test(digits)) {
      digits = '57' + digits;
    }

    if (digits.length < 8 || digits.length > 15) return null;

    return '+' + digits;
  }

  onExcelFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.excelFileName.set(file.name);
    this.error.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        if (!firstSheet) {
          this.error.set('El archivo no tiene hojas de datos');
          return;
        }

        const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
          header: 1,
          defval: '',
          raw: true,
          blankrows: false,
        });

        if (!rows.length) {
          this.error.set('El archivo está vacío');
          return;
        }

        // Detectar si la primera fila es encabezado o ya es un dato (heurística: ¿la primera celda normaliza a teléfono?)
        const firstRow = rows[0] ?? [];
        const firstCellLooksLikePhone = !!this.normalizePhone(firstRow[0]);
        let phoneCol = 0;
        const startIdx = firstCellLooksLikePhone ? 0 : 1;

        if (!firstCellLooksLikePhone) {
          const headerRow = (firstRow as unknown[]).map((c) => String(c).toLowerCase().trim());
          headerRow.forEach((h, idx) => {
            if (/tel|phone|celular|movil|número|numero|whatsapp|wa\b/.test(h)) phoneCol = idx;
          });
        }

        const dataRows = rows.length - startIdx;
        this.excelTotalRows.set(dataRows);

        const phones: string[] = [];
        const invalid: { row: number; value: string; reason: string }[] = [];
        const seen = new Set<string>();

        for (let i = startIdx; i < rows.length; i++) {
          const rowNum = i + 1;
          const row = rows[i] ?? [];
          const raw = this.cellToString(row[phoneCol]);
          const phone = this.normalizePhone(row[phoneCol]);

          if (!raw) {
            invalid.push({ row: rowNum, value: raw, reason: 'Celda vacía' });
          } else if (!phone) {
            invalid.push({ row: rowNum, value: raw, reason: 'No se pudo reconocer como teléfono' });
          } else if (seen.has(phone)) {
            invalid.push({ row: rowNum, value: raw, reason: 'Número duplicado' });
          } else {
            seen.add(phone);
            phones.push(phone);
          }
        }

        this.excelPhones.set(phones);
        this.excelInvalid.set(invalid);

        if (phones.length === 0) {
          this.error.set('No se encontraron números de teléfono válidos en el archivo. Verifica que sea un Excel (.xlsx), .xls o .csv válido.');
        }
      } catch (e) {
        this.error.set('Error al leer el archivo. Verifica que sea un Excel (.xlsx), .xls o .csv válido.');
      }
    };
    reader.onerror = () => {
      this.error.set('No se pudo leer el archivo');
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  removeExcelFile(): void {
    this.excelPhones.set([]);
    this.excelFileName.set('');
    this.excelTotalRows.set(0);
    this.excelInvalid.set([]);
  }

  // ── Números escritos a mano ──────────────────────────────────

  addManualPhone(): void {
    const phone = this.normalizePhone(this.manualPhoneInput);
    if (!phone) {
      this.manualPhoneError.set('Ese número no parece válido. Ejemplo: 3001234567');
      return;
    }
    if (this.allRecipients().includes(phone)) {
      this.manualPhoneError.set('Ese número ya está en la lista');
      return;
    }
    this.manualPhones.update((list) => [...list, phone]);
    this.manualPhoneInput = '';
    this.manualPhoneError.set(null);
  }

  removeManualPhone(phone: string): void {
    this.manualPhones.update((list) => list.filter((p) => p !== phone));
  }

  clearManualPhones(): void {
    this.manualPhones.set([]);
    this.manualPhoneInput = '';
    this.manualPhoneError.set(null);
  }

  // ── Distribution ───────────────────────────────────────────

  onSplitPartsChange(value: number): void {
    this.splitParts = Math.max(2, Math.min(10, value));
    this.splitSchedules = Array.from({ length: this.splitParts }, (_, i) => this.splitSchedules[i] ?? '');
  }

  getPartSize(partIndex: number): number {
    const total = this.allRecipients().length;
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

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' COP';
  }

  getSelectedTotal(): number {
    const usd = this.selectedRecharge();
    return usd ? this.getSmsTotalCop(usd) : 0;
  }
}
