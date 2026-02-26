import { Component, inject, signal, OnInit, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { CountriesService } from '../../../../core/services/countries.service';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  UserAdmin,
  CreateUserAdminData,
  UserFilters,
} from '../../../../core/models/admin.model';
import type { Profile, UserRole } from '../../../../core/models/profile.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly countriesService = inject(CountriesService);

  // Estado de lista
  readonly users = signal<UserAdmin[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly selectedRole = signal<UserRole | 'all'>('all');
  readonly selectedStatus = signal<'active' | 'inactive' | 'all'>('all');
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Notificaciones
  readonly successMessage = signal<string | null>(null);
  readonly modalError = signal<string | null>(null);
  private notifTimer: ReturnType<typeof setTimeout> | null = null;

  // Países / ubicación
  readonly selectedCountryCode = signal<string>('+57');
  readonly countries = this.countriesService.getCountriesWithPhoneCodes();

  readonly rolesForCreation = [
    { value: 'guest', label: 'Usuario' },
    { value: 'admin', label: 'Administrador' },
  ];

  // Modal crear/editar
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create' | 'edit' | 'view'>('create');
  readonly selectedUser = signal<UserAdmin | null>(null);
  readonly saving = signal<boolean>(false);

  readonly formData = signal<Partial<CreateUserAdminData>>({
    email: '',
    password: '',
    username: '',
    full_name: '',
    role: 'guest',
    is_active: true,
    phone: '',
    country: '',
    country_code: '+57',
    department: '',
    city: '',
  });

  // Modal eliminar
  readonly showDeleteConfirm = signal<boolean>(false);
  readonly userToDelete = signal<UserAdmin | null>(null);
  readonly deleteError = signal<string | null>(null);

  // Admin referrer
  readonly adminReferralCode = signal<string>('');
  readonly adminProfile = signal<Profile | null>(null);

  // Realtime
  private realtimeChannel: RealtimeChannel | null = null;

  // Balance
  readonly balanceOperation = signal<'add' | 'subtract' | 'set'>('add');
  readonly balanceAmount = signal<number>(0);
  readonly balanceReason = signal<string>('');

  readonly Math = Math;

  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));

  readonly filteredUsers = computed(() =>
    this.users().filter((u) => {
      const q = this.searchQuery().toLowerCase();
      const matchesSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.full_name && u.full_name.toLowerCase().includes(q));
      const matchesRole = this.selectedRole() === 'all' || u.role === this.selectedRole();
      const matchesStatus =
        this.selectedStatus() === 'all' ||
        (this.selectedStatus() === 'active' && u.is_active) ||
        (this.selectedStatus() === 'inactive' && !u.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    })
  );

  readonly roles: { value: UserRole | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos los roles' },
    { value: 'dev', label: 'Desarrollador' },
    { value: 'admin', label: 'Administrador' },
    { value: 'advertiser', label: 'Anunciante' },
    { value: 'guest', label: 'Usuario' },
  ];

  readonly rolesForEdit = [
    { value: 'guest', label: 'Usuario' },
    { value: 'admin', label: 'Administrador' },
  ];

  readonly statuses = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
  ];

  readonly numberFormatter = new Intl.NumberFormat('es-CO');
  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  ngOnInit(): void {
    this.loadAdminProfile();
    this.loadUsers();
    this.subscribeToProfiles();
  }

  ngOnDestroy(): void {
    if (this.notifTimer) clearTimeout(this.notifTimer);
    if (this.realtimeChannel) {
      getSupabaseClient().removeChannel(this.realtimeChannel);
    }
  }

  private subscribeToProfiles(): void {
    this.realtimeChannel = getSupabaseClient()
      .channel('admin-profiles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => this.loadUsers()
      )
      .subscribe();
  }

  // ─── Notificaciones ───────────────────────────────────────────────────────

  private showSuccess(message: string): void {
    this.successMessage.set(message);
    this.error.set(null);
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notifTimer = setTimeout(() => this.successMessage.set(null), 4000);
  }

  private parseUserError(err: unknown): string {
    const msg: string =
      (err as any)?.message || (err as any)?.toString() || 'Error desconocido';
    if (msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('already registered'))
      return 'Ya existe un usuario con ese email o username';
    if (msg.includes('weak') || (msg.includes('password') && msg.includes('short')))
      return 'La contraseña es demasiado débil (mínimo 6 caracteres)';
    if (msg.includes('Invalid email') || msg.includes('invalid email'))
      return 'El formato del email es inválido';
    if (msg.includes('rate limit') || msg.includes('Rate limit'))
      return 'Límite de solicitudes excedido. Espera unos minutos e intenta de nuevo';
    if (msg.includes('No puedes eliminar tu propia cuenta'))
      return 'No puedes eliminar tu propia cuenta';
    if (msg.includes('Forbidden'))
      return 'No tienes permisos para realizar esta acción';
    return msg;
  }

  // ─── Carga ────────────────────────────────────────────────────────────────

  private async loadAdminProfile(): Promise<void> {
    try {
      const profile = await this.profileService.getCurrentProfile();
      if (profile) {
        this.adminProfile.set(profile);
        this.adminReferralCode.set(profile.referral_code);
      }
    } catch (err) {
      console.error('Error loading admin profile:', err);
    }
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = (this.currentPage() - 1) * this.pageSize();
      const to = from + this.pageSize() - 1;
      const { data, count } = await this.supabaseQuery(from, to);
      if (data) {
        this.users.set(data as UserAdmin[]);
        this.totalCount.set(count || 0);
      }
    } catch (err: unknown) {
      console.error('Error loading users:', err);
      this.error.set('Error al cargar los usuarios');
    } finally {
      this.loading.set(false);
    }
  }

  private async supabaseQuery(
    from: number,
    to: number
  ): Promise<{ data: unknown[]; count: number | null }> {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('profiles')
      .select('*, referrer:referred_by (username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (this.selectedRole() !== 'all') query = query.eq('role', this.selectedRole());
    if (this.selectedStatus() !== 'all')
      query = query.eq('is_active', this.selectedStatus() === 'active');

    const { data, error, count } = await query;
    if (error) throw error;

    const transformedData = (data || []).map((u: any) => ({
      ...u,
      referrer_username: u.referrer?.username,
    }));
    return { data: transformedData, count };
  }

  // ─── Filtros y paginación ─────────────────────────────────────────────────

  onSearch(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  onRoleChange(role: UserRole | 'all'): void {
    this.selectedRole.set(role);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onStatusChange(status: 'active' | 'inactive' | 'all'): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadUsers();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadUsers();
    }
  }
  nextPage(): void { this.goToPage(this.currentPage() + 1); }
  prevPage(): void { this.goToPage(this.currentPage() - 1); }

  // ─── Modal crear/editar ───────────────────────────────────────────────────

  openCreateModal(): void {
    this.modalMode.set('create');
    this.selectedUser.set(null);
    this.modalError.set(null);
    this.formData.set({
      email: '',
      password: '',
      username: '',
      full_name: '',
      role: 'guest',
      is_active: true,
      phone: '',
      country: '',
      country_code: '+57',
      department: '',
      city: '',
    });
    this.showModal.set(true);
  }

  openEditModal(user: UserAdmin): void {
    this.modalMode.set('edit');
    this.selectedUser.set(user);
    this.modalError.set(null);
    this.formData.set({
      username: user.username,
      full_name: user.full_name || '',
      role: user.role,
      is_active: user.is_active,
      phone: user.phone || '',
      country: user.country || '',
      country_code: user.country_code || '+57',
      department: user.department || '',
      city: user.city || '',
    });
    this.balanceAmount.set(0);
    this.balanceReason.set('');
    this.showModal.set(true);
  }

  openViewModal(user: UserAdmin): void {
    this.modalMode.set('view');
    this.selectedUser.set(user);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedUser.set(null);
    this.modalError.set(null);
    this.balanceAmount.set(0);
    this.balanceReason.set('');
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async saveUser(): Promise<void> {
    this.saving.set(true);
    this.modalError.set(null);
    try {
      if (this.modalMode() === 'create') {
        await this.createUser();
        this.showSuccess('Usuario creado correctamente');
      } else {
        await this.updateUser();
        this.showSuccess('Usuario actualizado correctamente');
      }
      await this.loadUsers();
      this.closeModal();
    } catch (err: unknown) {
      this.modalError.set(this.parseUserError(err));
    } finally {
      this.saving.set(false);
    }
  }

  private async createUser(): Promise<void> {
    const data = this.formData();
    if (!data.email || !data.password || !data.username) {
      throw new Error('Email, contraseña y username son requeridos');
    }
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: data.email,
        password: data.password,
        username: data.username,
        full_name: data.full_name,
        role: data.role,
        is_active: data.is_active,
        phone: data.phone || null,
        country: data.country || null,
        country_code: data.country_code || null,
        city: data.city || null,
        department: data.department || null,
        referral_code: this.adminReferralCode() || '',
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);

    await this.dashboardService.logActivity('create_user', 'user', result.user.id, {
      email: data.email,
      role: data.role,
    });
  }

  private async updateUser(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;
    const data = this.formData();
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('profiles')
      .update({
        username: data.username,
        full_name: data.full_name || null,
        role: data.role,
        is_active: data.is_active,
        phone: data.phone || null,
        country: data.country || null,
        country_code: data.country_code || null,
        department: data.department || null,
        city: data.city || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) throw error;

    await this.dashboardService.logActivity('update_user', 'user', user.id, {
      changes: ['username', 'full_name', 'role', 'is_active', 'phone', 'country'],
    });
  }

  // ─── Eliminar ─────────────────────────────────────────────────────────────

  openDeleteConfirm(user: UserAdmin): void {
    this.userToDelete.set(user);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm(): void {
    this.userToDelete.set(null);
    this.showDeleteConfirm.set(false);
    this.deleteError.set(null);
  }

  async confirmDelete(): Promise<void> {
    const user = this.userToDelete();
    if (!user) return;
    this.saving.set(true);
    this.deleteError.set(null);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: result, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: user.id },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      await this.dashboardService.logActivity('delete_user', 'user', user.id, {
        email: user.email,
        username: user.username,
      });

      this.showSuccess(`Usuario "${user.username}" eliminado correctamente`);
      await this.loadUsers();
      this.closeDeleteConfirm();
    } catch (err: unknown) {
      this.deleteError.set(this.parseUserError(err));
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Balance ──────────────────────────────────────────────────────────────

  async updateBalance(): Promise<void> {
    const user = this.selectedUser();
    if (!user || !this.balanceReason()) return;
    this.saving.set(true);
    this.modalError.set(null);
    try {
      await this.profileService.updateBalance(
        user.id,
        this.balanceAmount(),
        this.balanceOperation()
      );
      await this.dashboardService.logActivity('update_balance', 'user', user.id, {
        operation: this.balanceOperation(),
        amount: this.balanceAmount(),
        reason: this.balanceReason(),
      });
      this.showSuccess('Balance actualizado correctamente');
      this.balanceAmount.set(0);
      this.balanceReason.set('');
      await this.loadUsers();
    } catch (err: unknown) {
      this.modalError.set(this.parseUserError(err));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleUserStatus(user: UserAdmin): Promise<void> {
    const newStatus = !user.is_active;
    const success = await this.profileService.setUserActive(user.id, newStatus);
    if (success) {
      await this.dashboardService.logActivity(
        newStatus ? 'activate_user' : 'deactivate_user',
        'user',
        user.id,
        { previous_status: user.is_active }
      );
      this.users.update((users) =>
        users.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u))
      );
      this.showSuccess(
        `Usuario "${user.username}" ${newStatus ? 'activado' : 'desactivado'} correctamente`
      );
    }
  }

  // ─── Formato ──────────────────────────────────────────────────────────────

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value ?? 0);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      dev: 'Desarrollador',
      admin: 'Administrador',
      advertiser: 'Anunciante',
      guest: 'Usuario',
    };
    return labels[role] || role;
  }

  getRoleBadgeClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      dev: 'bg-violet-500/10 text-violet-400',
      admin: 'bg-rose-500/10 text-rose-400',
      advertiser: 'bg-amber-500/10 text-amber-400',
      guest: 'bg-blue-500/10 text-blue-400',
    };
    return classes[role] || 'bg-slate-500/10 text-slate-400';
  }
}
