import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FacebookService } from '../../../../core/services/facebook.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  FbSubscription, FbSession, FbGroup, FbPage,
  FbPostTemplate, FbMessageTemplate, FbCampaign,
  FbScheduledPost, FbDashboardStats, FbAntiBlockConfig,
  FbCampaignType, DEFAULT_FB_ANTI_BLOCK, FB_CAMPAIGN_TYPE_LABELS,
} from '../../../../core/models/facebook.model';

type Tab = 'dashboard' | 'groups' | 'pages' | 'campaigns' | 'templates' | 'scheduler' | 'settings';
type Modal = 'none' | 'group' | 'page' | 'post-template' | 'msg-template' | 'campaign' | 'schedule';

@Component({
  selector: 'app-automatic-facebook',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './automatic-facebook.component.html',
  styleUrl: './automatic-facebook.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomaticFacebookComponent implements OnInit {
  private fb = inject(FacebookService);
  private currency = inject(CurrencyService);
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);

  loading = signal(true);
  activeTab = signal<Tab>('dashboard');
  subscription = signal<FbSubscription | null>(null);
  hasSubscription = computed(() => !!this.subscription());
  modal = signal<Modal>('none');

  // Subscription / ePayco
  subscribing = signal(false);
  showPaymentModal = signal(false);
  subStep = signal<'pricing' | 'epayco-loading' | 'epayco-opening' | 'epayco-result'>('pricing');
  epaycoError = signal<string | null>(null);
  priceCOP = computed(() => this.currency.usdToCop(20));
  priceWithFeeCOP = computed(() => this.currency.usdToFinalCop(20));

  // Dashboard
  stats = signal<FbDashboardStats>({ totalGroups: 0, totalPages: 0, totalCampaigns: 0, activeCampaigns: 0, totalPostsSent: 0, totalMessagesSent: 0, totalGroupJoins: 0, scheduledPosts: 0, successRate: 0, todayActions: 0 });
  sessions = signal<FbSession[]>([]);

  // Groups
  groups = signal<FbGroup[]>([]);
  newGroupName = signal('');
  newGroupUrl = signal('');
  newGroupCategory = signal('');

  // Pages
  pages = signal<FbPage[]>([]);
  newPageName = signal('');
  newPageUrl = signal('');

  // Templates
  postTemplates = signal<FbPostTemplate[]>([]);
  msgTemplates = signal<FbMessageTemplate[]>([]);
  tplName = signal('');
  tplContent = signal('');
  tplMediaType = signal('none');
  tplLinkUrl = signal('');
  tplCategory = signal('general');
  msgTplName = signal('');
  msgTplContent = signal('');
  msgTplMediaType = signal('text');
  editingPostTpl = signal<FbPostTemplate | null>(null);
  editingMsgTpl = signal<FbMessageTemplate | null>(null);

  // Campaigns
  campaigns = signal<FbCampaign[]>([]);
  campName = signal('');
  campDescription = signal('');
  campType = signal<FbCampaignType>('group_post');
  campPostTplId = signal('');
  campMsgTplId = signal('');
  campTargetGroupIds = signal<Set<string>>(new Set());
  campTargetPageIds = signal<Set<string>>(new Set());
  campKeywords = signal('');
  antiBlock = signal<FbAntiBlockConfig>({ ...DEFAULT_FB_ANTI_BLOCK });

  // Scheduler
  scheduledPosts = signal<FbScheduledPost[]>([]);
  schedTargetType = signal<'group' | 'page'>('group');
  schedTargetId = signal('');
  schedContent = signal('');
  schedDate = signal('');
  schedTime = signal('');
  schedRepeat = signal(false);
  schedRepeatHours = signal(24);

  // Settings
  newSessionName = signal('');

  campaignTypeLabels = FB_CAMPAIGN_TYPE_LABELS;
  campaignTypes: FbCampaignType[] = ['group_join', 'group_post', 'group_message', 'friend_message', 'page_post', 'page_message'];

  tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Panel', icon: 'dashboard' },
    { id: 'groups', label: 'Grupos', icon: 'groups' },
    { id: 'pages', label: 'Paginas', icon: 'article' },
    { id: 'campaigns', label: 'Campañas', icon: 'campaign' },
    { id: 'templates', label: 'Plantillas', icon: 'description' },
    { id: 'scheduler', label: 'Programar', icon: 'schedule' },
    { id: 'settings', label: 'Ajustes', icon: 'settings' },
  ];

  ngOnInit() {
    this.loadSubscription();
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParamMap.subscribe(params => {
        if (params.get('epayco') === 'result') {
          this.subStep.set('epayco-result');
          setTimeout(() => this.loadSubscription(), 2000);
        }
      });
    }
  }

  async loadSubscription() {
    this.loading.set(true);
    const sub = await this.fb.getSubscription();
    this.subscription.set(sub);
    await this.loadDashboard();
    this.loading.set(false);
  }

  requireSubscription(): boolean {
    if (this.hasSubscription()) return true;
    this.showPaymentModal.set(true);
    this.subStep.set('pricing');
    return false;
  }

  async loadDashboard() {
    const [stats, sessions] = await Promise.all([this.fb.getDashboardStats(), this.fb.getSessions()]);
    this.stats.set(stats);
    this.sessions.set(sessions);
  }

  async switchTab(tab: Tab) {
    this.activeTab.set(tab);
    if (tab === 'dashboard') await this.loadDashboard();
    else if (tab === 'groups') this.groups.set(await this.fb.getGroups());
    else if (tab === 'pages') this.pages.set(await this.fb.getPages());
    else if (tab === 'campaigns') await this.loadCampaigns();
    else if (tab === 'templates') await this.loadTemplates();
    else if (tab === 'scheduler') await this.loadScheduler();
    else if (tab === 'settings') this.sessions.set(await this.fb.getSessions());
  }

  // ─── ePayco ────────────────────────────────
  async startEpaycoCheckout(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.epaycoError.set(null);
    this.subscribing.set(true);
    this.subStep.set('epayco-loading');
    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();
      const response = await supabase.functions.invoke('create-fb-subscription-payment', {
        body: { cop_amount: this.priceCOP() },
      });
      const data = response.data;
      if (!data?.invoice) throw new Error(data?.error || 'Error al preparar el pago');

      await this.loadEpaycoScript();
      this.subStep.set('epayco-opening');

      const epayco = (window as unknown as Record<string, unknown>)['ePayco'] as {
        checkout: { configure: (cfg: unknown) => { open: (p: unknown) => void } };
      };
      const handler = epayco.checkout.configure({ key: data.publicKey, test: data.test });
      handler.open({
        name: data.name, description: data.description, invoice: data.invoice,
        currency: data.currency, amount: data.amount, tax_base: data.tax_base,
        tax: data.tax, country: data.country, lang: data.lang, external: 'true',
        confirmation: data.confirmation,
        response: `${window.location.origin}/dashboard/automatic-facebook?epayco=result`,
        methodConfirmation: 'POST',
        email_billing: data.email_billing, name_billing: data.name_billing,
        extra1: data.extra1, extra2: data.extra2, extra3: data.extra3,
      });
    } catch (e: unknown) {
      this.epaycoError.set(e instanceof Error ? e.message : 'Error al iniciar pago');
      this.subStep.set('pricing');
    } finally {
      this.subscribing.set(false);
    }
  }

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['ePayco']) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://checkout.epayco.co/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ePayco'));
      document.head.appendChild(s);
    });
  }

  formatCOP(n: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
  }

  // ─── Groups ────────────────────────────────
  async addGroup() {
    if (!this.newGroupName() || !this.requireSubscription()) return;
    await this.fb.createGroup({ name: this.newGroupName(), url: this.newGroupUrl() || null, category: this.newGroupCategory() || null, status: 'joined' });
    this.newGroupName.set(''); this.newGroupUrl.set(''); this.newGroupCategory.set('');
    this.modal.set('none');
    this.groups.set(await this.fb.getGroups());
  }

  async deleteGroup(id: string) {
    await this.fb.deleteGroup(id);
    this.groups.set(await this.fb.getGroups());
  }

  async toggleGroupPosting(g: FbGroup) {
    await this.fb.updateGroup(g.id, { is_posting_enabled: !g.is_posting_enabled });
    this.groups.set(await this.fb.getGroups());
  }

  // ─── Pages ─────────────────────────────────
  async addPage() {
    if (!this.newPageName() || !this.requireSubscription()) return;
    await this.fb.createPage({ name: this.newPageName(), url: this.newPageUrl() || null });
    this.newPageName.set(''); this.newPageUrl.set('');
    this.modal.set('none');
    this.pages.set(await this.fb.getPages());
  }

  async deletePage(id: string) {
    await this.fb.deletePage(id);
    this.pages.set(await this.fb.getPages());
  }

  // ─── Templates ─────────────────────────────
  async loadTemplates() {
    const [pt, mt] = await Promise.all([this.fb.getPostTemplates(), this.fb.getMessageTemplates()]);
    this.postTemplates.set(pt);
    this.msgTemplates.set(mt);
  }

  openPostTplModal(t?: FbPostTemplate) {
    this.editingPostTpl.set(t ?? null);
    this.tplName.set(t?.name ?? '');
    this.tplContent.set(t?.content ?? '');
    this.tplMediaType.set(t?.media_type ?? 'none');
    this.tplLinkUrl.set(t?.link_url ?? '');
    this.tplCategory.set(t?.category ?? 'general');
    this.modal.set('post-template');
  }

  async savePostTemplate() {
    if (!this.tplName() || !this.tplContent() || !this.requireSubscription()) return;
    const payload: Partial<FbPostTemplate> = { name: this.tplName(), content: this.tplContent(), media_type: this.tplMediaType() as any, link_url: this.tplLinkUrl() || null, category: this.tplCategory() };
    const ed = this.editingPostTpl();
    if (ed) await this.fb.updatePostTemplate(ed.id, payload);
    else await this.fb.createPostTemplate(payload);
    this.modal.set('none');
    await this.loadTemplates();
  }

  async deletePostTemplate(id: string) { await this.fb.deletePostTemplate(id); await this.loadTemplates(); }

  openMsgTplModal(t?: FbMessageTemplate) {
    this.editingMsgTpl.set(t ?? null);
    this.msgTplName.set(t?.name ?? '');
    this.msgTplContent.set(t?.content ?? '');
    this.msgTplMediaType.set(t?.media_type ?? 'text');
    this.modal.set('msg-template');
  }

  async saveMsgTemplate() {
    if (!this.msgTplName() || !this.msgTplContent() || !this.requireSubscription()) return;
    const payload: Partial<FbMessageTemplate> = { name: this.msgTplName(), content: this.msgTplContent(), media_type: this.msgTplMediaType() as any };
    const ed = this.editingMsgTpl();
    if (ed) await this.fb.updateMessageTemplate(ed.id, payload);
    else await this.fb.createMessageTemplate(payload);
    this.modal.set('none');
    await this.loadTemplates();
  }

  async deleteMsgTemplate(id: string) { await this.fb.deleteMessageTemplate(id); await this.loadTemplates(); }

  // ─── Campaigns ─────────────────────────────
  async loadCampaigns() {
    const [camps, pt, mt, g, p] = await Promise.all([
      this.fb.getCampaigns(), this.fb.getPostTemplates(), this.fb.getMessageTemplates(), this.fb.getGroups(), this.fb.getPages()
    ]);
    this.campaigns.set(camps); this.postTemplates.set(pt); this.msgTemplates.set(mt); this.groups.set(g); this.pages.set(p);
  }

  openCampaignModal() {
    this.campName.set(''); this.campDescription.set(''); this.campType.set('group_post');
    this.campPostTplId.set(''); this.campMsgTplId.set('');
    this.campTargetGroupIds.set(new Set()); this.campTargetPageIds.set(new Set());
    this.campKeywords.set(''); this.antiBlock.set({ ...DEFAULT_FB_ANTI_BLOCK });
    this.modal.set('campaign');
  }

  toggleCampGroup(id: string) {
    const s = new Set(this.campTargetGroupIds());
    s.has(id) ? s.delete(id) : s.add(id);
    this.campTargetGroupIds.set(s);
  }

  toggleCampPage(id: string) {
    const s = new Set(this.campTargetPageIds());
    s.has(id) ? s.delete(id) : s.add(id);
    this.campTargetPageIds.set(s);
  }

  needsPostTemplate(): boolean {
    return ['group_post', 'page_post', 'scheduled_post'].includes(this.campType());
  }

  needsMsgTemplate(): boolean {
    return ['group_message', 'friend_message', 'page_message'].includes(this.campType());
  }

  needsGroups(): boolean {
    return ['group_post', 'group_message'].includes(this.campType());
  }

  needsPages(): boolean {
    return ['page_post', 'page_message'].includes(this.campType());
  }

  needsKeywords(): boolean {
    return this.campType() === 'group_join';
  }

  async saveCampaign() {
    if (!this.campName() || !this.requireSubscription()) return;
    const ab = this.antiBlock();
    await this.fb.createCampaign({
      name: this.campName(),
      description: this.campDescription() || null,
      campaign_type: this.campType(),
      post_template_id: this.needsPostTemplate() ? this.campPostTplId() || null : null,
      message_template_id: this.needsMsgTemplate() ? this.campMsgTplId() || null : null,
      target_group_ids: this.needsGroups() ? [...this.campTargetGroupIds()] : [],
      target_page_ids: this.needsPages() ? [...this.campTargetPageIds()] : [],
      target_keywords: this.needsKeywords() ? this.campKeywords().split(',').map(k => k.trim()).filter(Boolean) : [],
      total_targets: this.needsGroups() ? this.campTargetGroupIds().size : this.needsPages() ? this.campTargetPageIds().size : 0,
      ...ab,
    });
    this.modal.set('none');
    await this.loadCampaigns();
  }

  async startCampaign(id: string) { if (!this.requireSubscription()) return; await this.fb.updateCampaignStatus(id, 'running'); await this.loadCampaigns(); }
  async pauseCampaign(id: string) { await this.fb.updateCampaignStatus(id, 'paused'); await this.loadCampaigns(); }
  async cancelCampaign(id: string) { await this.fb.updateCampaignStatus(id, 'cancelled'); await this.loadCampaigns(); }
  async deleteCampaign(id: string) { await this.fb.deleteCampaign(id); await this.loadCampaigns(); }

  getCampStatusColor(s: string): string {
    const m: Record<string, string> = { draft: 'text-slate-400 bg-slate-500/20', scheduled: 'text-blue-400 bg-blue-500/20', running: 'text-green-400 bg-green-500/20', paused: 'text-yellow-400 bg-yellow-500/20', completed: 'text-primary bg-primary/20', failed: 'text-red-400 bg-red-500/20', cancelled: 'text-slate-500 bg-slate-600/20' };
    return m[s] ?? m['draft'];
  }

  getCampStatusLabel(s: string): string {
    const m: Record<string, string> = { draft: 'Borrador', scheduled: 'Programada', running: 'Ejecutando', paused: 'Pausada', completed: 'Completada', failed: 'Fallida', cancelled: 'Cancelada' };
    return m[s] ?? s;
  }

  getProgress(c: FbCampaign): number {
    return c.total_targets ? Math.round((c.completed_count / c.total_targets) * 100) : 0;
  }

  // ─── Scheduler ─────────────────────────────
  async loadScheduler() {
    const [sp, g, p] = await Promise.all([this.fb.getScheduledPosts(), this.fb.getGroups(), this.fb.getPages()]);
    this.scheduledPosts.set(sp); this.groups.set(g); this.pages.set(p);
  }

  openScheduleModal() {
    this.schedTargetType.set('group'); this.schedTargetId.set('');
    this.schedContent.set(''); this.schedDate.set(''); this.schedTime.set('');
    this.schedRepeat.set(false); this.schedRepeatHours.set(24);
    this.modal.set('schedule');
  }

  async saveScheduledPost() {
    if (!this.schedTargetId() || !this.schedContent() || !this.schedDate() || !this.schedTime() || !this.requireSubscription()) return;
    const dt = new Date(`${this.schedDate()}T${this.schedTime()}`);
    const targets = this.schedTargetType() === 'group' ? this.groups() : this.pages();
    const target = targets.find(t => t.id === this.schedTargetId());
    await this.fb.createScheduledPost({
      target_type: this.schedTargetType(),
      target_id: this.schedTargetId(),
      target_name: target?.name ?? '',
      content: this.schedContent(),
      scheduled_at: dt.toISOString(),
      repeat_enabled: this.schedRepeat(),
      repeat_interval_hours: this.schedRepeat() ? this.schedRepeatHours() : null,
    });
    this.modal.set('none');
    await this.loadScheduler();
  }

  async deleteScheduledPost(id: string) { await this.fb.deleteScheduledPost(id); await this.loadScheduler(); }

  // ─── Settings ──────────────────────────────
  async createSession() {
    if (!this.newSessionName() || !this.requireSubscription()) return;
    await this.fb.createSession(this.newSessionName());
    this.newSessionName.set('');
    this.sessions.set(await this.fb.getSessions());
  }

  async deleteSession(id: string) {
    await this.fb.deleteSession(id);
    this.sessions.set(await this.fb.getSessions());
  }

  getSessionStatusIcon(s: string): string {
    const m: Record<string, string> = { connected: 'check_circle', disconnected: 'cancel', pending: 'hourglass_top', banned: 'block', limited: 'warning' };
    return m[s] ?? 'help';
  }

  getSessionStatusColor(s: string): string {
    const m: Record<string, string> = { connected: 'text-green-400', disconnected: 'text-slate-500', pending: 'text-yellow-400', banned: 'text-red-400', limited: 'text-orange-400' };
    return m[s] ?? 'text-slate-400';
  }

  updateAntiBlock(field: keyof FbAntiBlockConfig, value: number | boolean) {
    this.antiBlock.update(c => ({ ...c, [field]: value }));
  }
}
