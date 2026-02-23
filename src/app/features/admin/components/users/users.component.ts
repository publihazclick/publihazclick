import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { CountriesService } from '../../../../core/services/countries.service';
import type {
  UserAdmin,
  CreateUserAdminData,
  UpdateUserAdminData,
  UserFilters,
  PaginationParams
} from '../../../../core/models/admin.model';
import type { Profile, UserRole } from '../../../../core/models/profile.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  // Servicios
  private readonly profileService = inject(ProfileService);
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly countriesService = inject(CountriesService);

  // Signals para estado
  readonly users = signal<UserAdmin[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly selectedRole = signal<UserRole | 'all'>('all');
  readonly selectedStatus = signal<'active' | 'inactive' | 'all'>('all');
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Country/Location signals
  readonly selectedCountryCode = signal<string>('+57');
  readonly countries = this.countriesService.getCountriesWithPhoneCodes();
  readonly departmentsList = computed(() => this.countriesService.getDepartments(this.selectedCountryCode()));
  readonly availableCities = computed(() => this.countriesService.getCities(this.formData().department || ''));

  // Roles for creation - only usuario and administrador
  readonly rolesForCreation = [
    { value: 'guest', label: 'Usuario' },
    { value: 'admin', label: 'Administrador' }
  ];

  // Modal state
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create' | 'edit' | 'view'>('create');
  readonly selectedUser = signal<UserAdmin | null>(null);
  readonly saving = signal<boolean>(false);

  // Form data
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
    city: ''
  });

  // Admin referrer code
  readonly adminReferralCode = signal<string>('');
  readonly adminProfile = signal<Profile | null>(null);

  readonly balanceOperation = signal<'add' | 'subtract' | 'set'>('add');
  readonly balanceAmount = signal<number>(0);
  readonly balanceReason = signal<string>('');

  // Computed
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));
  readonly filteredUsers = computed(() => {
    return this.users().filter(u => {
      const matchesSearch = !this.searchQuery() ||
        u.username.toLowerCase().includes(this.searchQuery().toLowerCase()) ||
        u.email.toLowerCase().includes(this.searchQuery().toLowerCase()) ||
        (u.full_name && u.full_name.toLowerCase().includes(this.searchQuery().toLowerCase()));

      const matchesRole = this.selectedRole() === 'all' || u.role === this.selectedRole();
      const matchesStatus = this.selectedStatus() === 'all' ||
        (this.selectedStatus() === 'active' && u.is_active) ||
        (this.selectedStatus() === 'inactive' && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  });

  readonly roles: { value: UserRole | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos los roles' },
    { value: 'dev', label: 'Desarrollador' },
    { value: 'admin', label: 'Administrador' },
    { value: 'advertiser', label: 'Anunciante' },
    { value: 'guest', label: 'Usuario' }
  ];

  readonly statuses = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  readonly numberFormatter = new Intl.NumberFormat('es-CO');
  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  ngOnInit(): void {
    this.loadAdminProfile();
    this.loadUsers();
  }

  // Cargar perfil del admin actual para obtener su código de referido
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

  // Exponer Math para template
  readonly Math = Math;

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
    } catch (err: any) {
      console.error('Error loading users:', err);
      this.error.set('Error al cargar los usuarios');
    } finally {
      this.loading.set(false);
    }
  }

  private async supabaseQuery(from: number, to: number): Promise<{ data: unknown[]; count: number | null }> {
    const supabase = this.profileService['supabase'];

    let query = supabase
      .from('profiles')
      .select(`
        *,
        referrer:referred_by (username)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (this.selectedRole() !== 'all') {
      query = query.eq('role', this.selectedRole());
    }

    if (this.selectedStatus() !== 'all') {
      query = query.eq('is_active', this.selectedStatus() === 'active');
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Transform data to include referrer_username
    const transformedData = (data || []).map((u: any) => ({
      ...u,
      referrer_username: u.referrer?.username
    }));

    return { data: transformedData, count };
  }

  // Search
  onSearch(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  // Filter changes
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

  onDepartmentChange(value: string): void {
    this.formData.update(data => ({ ...data, department: value, city: '' }));
  }

  // Pagination
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadUsers();
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  // Modal actions
  openCreateModal(): void {
    this.modalMode.set('create');
    this.selectedUser.set(null);
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
      city: ''
    });
    this.showModal.set(true);
  }

  openEditModal(user: UserAdmin): void {
    this.modalMode.set('edit');
    this.selectedUser.set(user);
    this.formData.set({
      username: user.username,
      full_name: user.full_name || '',
      role: user.role,
      is_active: user.is_active,
      phone: user.phone || '',
      country: user.country || '',
      country_code: user.country_code || '+57',
      department: user.department || '',
      city: user.city || ''
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
    this.balanceAmount.set(0);
    this.balanceReason.set('');
  }

  // CRUD operations
  async saveUser(): Promise<void> {
    this.saving.set(true);

    try {
      if (this.modalMode() === 'create') {
        // Crear usuario
        await this.createUser();
      } else {
        // Actualizar usuario
        await this.updateUser();
      }

      await this.loadUsers();
      this.closeModal();
    } catch (err: any) {
      console.error('Error saving user:', err);
      this.error.set(err.message || 'Error al guardar el usuario');
    } finally {
      this.saving.set(false);
    }
  }

  private async createUser(): Promise<void> {
    const data = this.formData();
    if (!data.email || !data.password) {
      throw new Error('Email y contraseña son requeridos');
    }

    // Crear usuario en auth
    const supabase = this.profileService['supabase'];
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password
    });

    if (authError) throw authError;

    // Actualizar perfil con datos adicionales
    if (authData.user) {
      // Obtener el ID del referidor basado en el código de referido del admin
      let referredById: string | null = null;
      const adminReferralCode = this.adminReferralCode();
      
      if (adminReferralCode) {
        const { data: referrerData } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', adminReferralCode)
          .single();
        
        if (referrerData) {
          referredById = referrerData.id;
        }
      }

      // Generar código de referido para el nuevo usuario
      const usernameLower = (data.username || '').toLowerCase();
      const randomDigits = Math.floor(10000 + Math.random() * 90000); // 5 dígitos
      const currentYear = new Date().getFullYear();
      const referralCode = `${usernameLower}${randomDigits}-${currentYear}`;
      // Generar el link de referido
      const referralLink = `/register/${referralCode}`;

      const { error } = await supabase
        .from('profiles')
        .update({
          username: data.username,
          full_name: data.full_name,
          role: data.role,
          is_active: data.is_active,
          phone: data.phone || null,
          country: data.country || null,
          country_code: data.country_code || null,
          city: data.city || null,
          department: data.department || null,
          referred_by: referredById,
          referral_code: referralCode,
          referral_link: referralLink
        })
        .eq('id', authData.user.id);

      if (error) throw error;

      // Log activity
      await this.dashboardService.logActivity(
        'create_user',
        'user',
        authData.user.id,
        { email: data.email, role: data.role }
      );
    }
  }

  private async updateUser(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;

    const data = this.formData();
    const updateData: UpdateUserAdminData = {
      username: data.username,
      full_name: data.full_name,
      role: data.role,
      is_active: data.is_active
    };

    // Actualizar perfil
    await this.profileService.updateProfile(updateData as any);

    // Log activity
    await this.dashboardService.logActivity(
      'update_user',
      'user',
      user.id,
      { changes: Object.keys(updateData) }
    );
  }

  async updateBalance(): Promise<void> {
    const user = this.selectedUser();
    if (!user || !this.balanceReason()) return;

    this.saving.set(true);

    try {
      await this.profileService.updateBalance(
        user.id,
        this.balanceAmount(),
        this.balanceOperation()
      );

      await this.dashboardService.logActivity(
        'update_balance',
        'user',
        user.id,
        {
          operation: this.balanceOperation(),
          amount: this.balanceAmount(),
          reason: this.balanceReason()
        }
      );

      await this.loadUsers();
    } catch (err: any) {
      console.error('Error updating balance:', err);
      this.error.set(err.message || 'Error al actualizar el balance');
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

      // Update local state
      this.users.update(users =>
        users.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u)
      );
    }
  }

  async changeUserRole(user: UserAdmin, newRole: UserRole): Promise<void> {
    const success = await this.profileService.setUserRole(user.id, newRole);

    if (success) {
      await this.dashboardService.logActivity(
        'change_role',
        'user',
        user.id,
        { previous_role: user.role, new_role: newRole }
      );

      // Update local state
      this.users.update(users =>
        users.map(u => u.id === user.id ? { ...u, role: newRole } : u)
      );
    }
  }

  // Formatting
  formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      dev: 'Desarrollador',
      admin: 'Administrador',
      advertiser: 'Anunciante',
      guest: 'Usuario'
    };
    return labels[role] || role;
  }

  getRoleBadgeClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      dev: 'bg-violet-500/10 text-violet-500',
      admin: 'bg-rose-500/10 text-rose-500',
      advertiser: 'bg-amber-500/10 text-amber-500',
      guest: 'bg-blue-500/10 text-blue-500'
    };
    return classes[role] || 'bg-slate-500/10 text-slate-500';
  }
}
