import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';

@Component({
  selector: 'app-cursos-payment-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cursos-payment-config.component.html',
})
export class CursosPaymentConfigComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly profile = this.profileService.profile;

  readonly paymentMethod = signal('nequi');
  readonly accountNumber = signal('');
  readonly accountHolder = signal('');
  readonly bankName = signal('');
  readonly saving = signal(false);
  readonly saved = signal(false);

  readonly paymentMethods = [
    { value: 'nequi', label: 'Nequi', icon: 'phone_android' },
    { value: 'daviplata', label: 'Daviplata', icon: 'phone_android' },
    { value: 'bancolombia', label: 'Bancolombia', icon: 'account_balance' },
    { value: 'davivienda', label: 'Davivienda', icon: 'account_balance' },
    { value: 'bbva', label: 'BBVA', icon: 'account_balance' },
    { value: 'banco_bogota', label: 'Banco de Bogotá', icon: 'account_balance' },
    { value: 'otro', label: 'Otro banco', icon: 'account_balance' },
  ];

  ngOnInit(): void {
    const p = this.profile();
    if (p) {
      this.accountHolder.set(p.username ?? '');
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    // Placeholder: en el futuro se guarda en Supabase
    await new Promise(r => setTimeout(r, 800));
    this.saving.set(false);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }
}
