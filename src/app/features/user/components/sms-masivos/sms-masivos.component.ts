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
import type {
  SmsContact,
  SmsCampaign,
  SmsTemplate,
  SmsDashboardStats,
} from '../../../../core/models/sms.model';

type TabId = 'dashboard' | 'contacts' | 'compose' | 'campaigns' | 'templates';

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

  // ── Modal visibility ────────────────────────────────────────
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
  composeRecipients: 'all' | 'manual' = 'all';
  composePhones = '';
  composeCampaignName = '';

  // ── Operation state ─────────────────────────────────────────
  readonly sending = signal(false);
  readonly success = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // ── Import ──────────────────────────────────────────────────
  readonly importCsvText = signal('');

  // ── Computed ────────────────────────────────────────────────
  readonly smsInfo = computed(() => calculateSmsSegments(this.composeMessage));

  readonly recipientCount = computed(() => {
    if (this.composeRecipients === 'all') {
      return this.contacts().length;
    }
    return this.composePhones
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0).length;
  });

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
      // Determine recipients
      let phones: string[];
      if (this.composeRecipients === 'all') {
        phones = this.contacts().map((c) => c.phone_number);
      } else {
        phones = this.composePhones
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
      }

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
      this.composePhones = '';
      this.composeCampaignName = '';

      this.showSuccess(`Campaña enviada a ${phones.length} destinatarios`);
      this.setTab('campaigns');
    } catch (err: any) {
      this.error.set(err.message ?? 'Error enviando campaña');
    } finally {
      this.sending.set(false);
    }
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
      draft: 'bg-gray-500/20 border-gray-500/30 text-gray-400',
      scheduled: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
      sending: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
      completed: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
      failed: 'bg-red-500/20 border-red-500/30 text-red-400',
      cancelled: 'bg-slate-500/20 border-slate-500/30 text-slate-400',
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
